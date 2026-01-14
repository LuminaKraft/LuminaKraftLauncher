use anyhow::Result;
use std::path::PathBuf;
use std::fs;
use reqwest::Client;
use lyceris::util::hash::calculate_sha1;
use crate::utils::downloader::download_file;
use super::types::{ModrinthManifest, ModrinthFile, ModrinthVersion};

/// Download files from Modrinth modpack using direct CDN URLs
/// Unlike CurseForge, Modrinth provides direct download URLs in the manifest
pub async fn download_files_with_failed_tracking<F>(
    manifest: &ModrinthManifest, 
    instance_dir: &PathBuf,
    emit_progress: F,
    start_percentage: f32,
    end_percentage: f32,
    override_filenames: &std::collections::HashSet<String>,
    max_concurrent_downloads: Option<usize>,
) -> Result<(Vec<serde_json::Value>, std::collections::HashSet<String>)>
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    use futures::{stream, StreamExt};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::sync::{Mutex, Semaphore};

    // Filter files that are for client (not server-only)
    let client_files: Vec<ModrinthFile> = manifest.files.iter()
        .filter(|f| {
            // Include file if:
            // 1. No env specified (default to include)
            // 2. Client is "required" or "optional"
            // 3. Client is not "unsupported"
            match &f.env {
                None => true,
                Some(env) => {
                    match env.client.as_deref() {
                        Some("unsupported") => false,
                        _ => true,
                    }
                }
            }
        })
        .cloned()
        .collect();
    
    let failed_files = Arc::new(Mutex::new(Vec::new()));
    let expected_filenames = Arc::new(Mutex::new(std::collections::HashSet::new()));
    
    let total_files = client_files.len();
    let progress_range = end_percentage - start_percentage;
    let completed_count = Arc::new(AtomicUsize::new(0));
    
    // Define concurrency limit
    let max_concurrent = max_concurrent_downloads.unwrap_or(10);
    let download_semaphore = Arc::new(Semaphore::new(max_concurrent));
    
    emit_progress(
        format!("progress.downloadingModrinthFiles|{}", total_files),
        start_percentage,
        "downloading_modrinth_files".to_string()
    );
    
    println!("📥 [Modrinth] Downloading {} files in parallel (max {} concurrent)...", total_files, max_concurrent);
    
    // Prepare download tasks
    let download_tasks: Vec<_> = client_files.into_iter().map(|file| {
        let emit = emit_progress.clone();
        let instance_dir = instance_dir.clone();
        let failed_files = failed_files.clone();
        let expected_filenames = expected_filenames.clone();
        let override_filenames = override_filenames.clone();
        let completed_count = completed_count.clone();
        let download_semaphore = download_semaphore.clone();
        
        async move {
            // Acquire semaphore permit
            let _permit = download_semaphore.acquire().await.ok()?;
            
            // Extract filename from path
            let filename = file.path.split('/').last().unwrap_or(&file.path).to_string();
            
            // Add to expected filenames
            {
                let mut expected = expected_filenames.lock().await;
                expected.insert(filename.clone());
            }
            
            // Determine destination path
            let dest_path = instance_dir.join(&file.path);
            
            // Create parent directory if needed
            if let Some(parent) = dest_path.parent() {
                if !parent.exists() {
                    let _ = fs::create_dir_all(parent);
                }
            }
            
            // Check if file already exists with correct hash
            if verify_file_hash(&dest_path, &file.hashes.sha1) {
                let completed = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                let mod_progress = start_percentage + (completed as f32 / total_files as f32) * progress_range;
                emit(format!("progress.downloadingModsProgress|{}|{}", completed, total_files), mod_progress, "file_already_exists".to_string());
                return Some(());
            }
            
            // Check if file is in overrides
            if override_filenames.contains(&file.path) {
                let completed = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                let mod_progress = start_percentage + (completed as f32 / total_files as f32) * progress_range;
                emit(format!("progress.downloadingModsProgress|{}|{}", completed, total_files), mod_progress, "file_in_overrides".to_string());
                return Some(());
            }
            
            // Get download URL
            let download_url = match file.downloads.first() {
                Some(url) => url.clone(),
                None => {
                    println!("⚠️ [Modrinth] No download URL for: {}", file.path);
                    let failed_info = create_failed_file_info(&file, &filename, None).await;
                    let mut failed = failed_files.lock().await;
                    failed.push(failed_info);
                    
                    let completed = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                    let mod_progress = start_percentage + (completed as f32 / total_files as f32) * progress_range;
                    emit(format!("progress.downloadingModsProgress|{}|{}", completed, total_files), mod_progress, "file_unavailable".to_string());
                    return Some(());
                }
            };
            
            // Download with retry loop
            loop {
                match download_file(&download_url, &dest_path).await {
                    Ok(()) => {
                        if verify_file_hash(&dest_path, &file.hashes.sha1) {
                            let completed = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                            let mod_progress = start_percentage + (completed as f32 / total_files as f32) * progress_range;
                            emit(
                                format!("progress.downloadingModsProgress|{}|{}", completed, total_files),
                                mod_progress,
                                "downloading_mod".to_string()
                            );
                            break;
                        } else {
                            println!("⚠️ [Modrinth] Hash mismatch for {}, retrying...", filename);
                            let _ = fs::remove_file(&dest_path);
                            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                            continue;
                        }
                    },
                    Err(e) => {
                        let error_msg = e.to_string();
                        
                        if error_msg.contains("Error de red") || error_msg.contains("TIMEDOUT") || 
                           error_msg.contains("unreachable") || error_msg.to_lowercase().contains("offline") ||
                           error_msg.contains("dns") || error_msg.contains("connection closed") {
                            println!("⚠️ [Modrinth] Network error for {}, retrying...", filename);
                            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                            continue;
                        }
                        
                        // Fatal error
                        println!("❌ [Modrinth] Failed to download {}: {}", filename, e);
                        let failed_info = create_failed_file_info(&file, &filename, Some(&error_msg)).await;
                        let mut failed = failed_files.lock().await;
                        failed.push(failed_info);
                        
                        let completed = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                        let mod_progress = start_percentage + (completed as f32 / total_files as f32) * progress_range;
                        emit(format!("progress.downloadingModsProgress|{}|{}", completed, total_files), mod_progress, "file_download_error".to_string());
                        break;
                    }
                }
            }
            
            Some(())
        }
    }).collect();
    
    // Execute all downloads in parallel
    let _: Vec<_> = stream::iter(download_tasks)
        .buffer_unordered(max_concurrent * 2)
        .collect()
        .await;
    
    // Extract results
    let failed_result = match Arc::try_unwrap(failed_files) {
        Ok(mutex) => mutex.into_inner(),
        Err(arc) => arc.lock().await.clone(),
    };
    
    let expected_result = match Arc::try_unwrap(expected_filenames) {
        Ok(mutex) => mutex.into_inner(),
        Err(arc) => arc.lock().await.clone(),
    };
    
    println!("✅ [Modrinth] Downloads complete! {} failed", failed_result.len());
    
    Ok((failed_result, expected_result))
}

/// Create a failed file info JSON with enriched data from Modrinth API
async fn create_failed_file_info(file: &ModrinthFile, filename: &str, error: Option<&str>) -> serde_json::Value {
    // Try to fetch project info from Modrinth using the hash
    let project_info = fetch_version_info_by_hash(&file.hashes.sha1).await;
    
    let mut info = serde_json::json!({
        "path": file.path,
        "fileName": filename,
        "sha1": file.hashes.sha1,
        "source": "modrinth"
    });
    
    // Add error if present
    if let Some(err) = error {
        info["error"] = serde_json::Value::String(err.to_string());
    }
    
    // Add download URL if available
    if let Some(url) = file.downloads.first() {
        info["url"] = serde_json::Value::String(url.clone());
    }
    
    // Add project info if we got it from API
    if let Some(version_info) = project_info {
        info["projectId"] = serde_json::Value::String(version_info.project_id);
        info["versionId"] = serde_json::Value::String(version_info.id);
        info["versionName"] = serde_json::Value::String(version_info.name);
    }
    
    info
}

/// Fetch version info from Modrinth API using file hash
async fn fetch_version_info_by_hash(sha1: &str) -> Option<ModrinthVersion> {
    let client = match Client::builder()
        .user_agent("LuminaKraftLauncher/1.0 (Modrinth API Client)")
        .timeout(std::time::Duration::from_secs(10))
        .build() {
            Ok(c) => c,
            Err(_) => return None,
        };
    
    let url = format!(
        "https://api.modrinth.com/v2/version_file/{}?algorithm=sha1",
        sha1
    );
    
    match client.get(&url).send().await {
        Ok(response) if response.status().is_success() => {
            response.json::<ModrinthVersion>().await.ok()
        },
        _ => None
    }
}

/// Verify if a file exists and has the correct SHA1 hash
pub fn verify_file_hash(file_path: &PathBuf, expected_sha1: &str) -> bool {
    if !file_path.exists() {
        return false;
    }
    
    match calculate_sha1(file_path) {
        Ok(actual_hash) => {
            actual_hash.to_lowercase() == expected_sha1.to_lowercase()
        },
        Err(_) => false,
    }
}
