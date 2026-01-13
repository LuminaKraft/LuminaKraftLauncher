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
) -> Result<(Vec<serde_json::Value>, std::collections::HashSet<String>)>
where
    F: Fn(String, f32, String) + Send + Sync + 'static,
{
    // Filter files that are for client (not server-only)
    let client_files: Vec<&ModrinthFile> = manifest.files.iter()
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
        .collect();
    
    let mut failed_files = Vec::new();
    let mut expected_filenames = std::collections::HashSet::new();
    
    let total_files = client_files.len();
    let progress_range = end_percentage - start_percentage;
    
    emit_progress(
        format!("progress.downloadingModrinthFiles|{}", total_files),
        start_percentage,
        "downloading_modrinth_files".to_string()
    );
    
    for (index, file) in client_files.iter().enumerate() {
        let mod_progress = start_percentage + (index as f32 / total_files as f32) * progress_range;
        
        // Extract filename from path (e.g., "mods/sodium.jar" -> "sodium.jar")
        let filename = file.path.split('/').last().unwrap_or(&file.path).to_string();
        expected_filenames.insert(filename.clone());
        
        // Determine destination path
        let dest_path = instance_dir.join(&file.path);
        
        // Create parent directory if needed
        if let Some(parent) = dest_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }
        
        emit_progress(
            format!("downloading_modpack:{}:{}", index + 1, total_files),
            mod_progress,
            "downloading_modpack_file".to_string()
        );
        
        // Check if file already exists with correct hash
        if verify_file_hash(&dest_path, &file.hashes.sha1) {
            emit_progress(
                format!("file_exists:{}", filename),
                mod_progress,
                "file_already_exists".to_string()
            );
            continue;
        }
        
        // Check if file is in overrides - will be extracted later
        if override_filenames.contains(&filename) {
            emit_progress(
                format!("file_in_overrides:{}", filename),
                mod_progress,
                "file_in_overrides".to_string()
            );
            println!("✓ [Modrinth] File {} will be extracted from overrides", filename);
            continue;
        }
        
        // Get download URL (Modrinth provides direct CDN URLs)
        let download_url = match file.downloads.first() {
            Some(url) => url,
            None => {
                // No download URL available - try to get project info for the dialog
                println!("⚠️ [Modrinth] No download URL for: {}", file.path);
                let failed_info = create_failed_file_info(file, &filename, None).await;
                failed_files.push(failed_info);
                continue;
            }
        };
        
        emit_progress(
            format!("mod_name:{}", filename),
            mod_progress,
            "downloading_mod_file".to_string()
        );
        
        // Download with infinite retry for network errors
        loop {
            match download_file(download_url, &dest_path).await {
                Ok(()) => {
                    // Verify hash
                    if verify_file_hash(&dest_path, &file.hashes.sha1) {
                        emit_progress(
                            format!("file_downloaded:{}:{}", index + 1, total_files),
                            mod_progress,
                            "file_downloaded".to_string()
                        );
                        break;
                    } else {
                        // Hash mismatch - retry
                        println!("⚠️ [Modrinth] Hash mismatch for {}, retrying...", filename);
                        let _ = fs::remove_file(&dest_path);
                        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                        continue;
                    }
                },
                Err(e) => {
                    let error_msg = e.to_string();
                    println!("DEBUG: [Modrinth] Download error: {:?}", e);
                    
                    // Check for network errors - infinite retry
                    if error_msg.contains("Error de red") 
                        || error_msg.contains("TIMEDOUT") 
                        || error_msg.contains("unreachable") 
                        || error_msg.to_lowercase().contains("offline")
                        || error_msg.contains("dns")
                        || error_msg.contains("connection closed")
                    {
                        emit_progress(
                            "progress.waitingForNetwork".to_string(),
                            mod_progress,
                            "waiting_for_network".to_string()
                        );
                        println!("⚠️ [Modrinth] Network error for {}, waiting...", filename);
                        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                        continue;
                    }
                    
                    // Fatal error - enrich with project info if possible
                    println!("❌ [Modrinth] Failed to download {}: {}", filename, e);
                    let failed_info = create_failed_file_info(file, &filename, Some(&error_msg)).await;
                    failed_files.push(failed_info);
                    break;
                }
            }
        }
    }
    
    Ok((failed_files, expected_filenames))
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
