use anyhow::Result;
use std::path::PathBuf;
use std::fs;
use reqwest::Client;
use lyceris::util::hash::calculate_sha1;
use crate::utils::downloader::download_file;
use super::types::{CurseForgeManifest, ModFileInfo, ApiResponse, GetModFilesRequest, EdgeFunctionRequest, FileHash};



/// Fetch mod file information in batches from CurseForge API
pub async fn fetch_mod_files_batch<P>(file_ids: &[i64], auth_token: Option<&str>, anon_key: &str, on_progress: P) -> Result<Vec<ModFileInfo>> 
where P: Fn(usize, usize) + Send + Sync
{
    let client = Client::builder()
        .user_agent("LKLauncher/1.0 (CurseForge API Client)")
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .pool_idle_timeout(std::time::Duration::from_secs(30))
        .pool_idle_timeout(std::time::Duration::from_secs(30))
        .pool_max_idle_per_host(10)
        .build()?;
    
    // Use Supabase Edge Function for CurseForge proxy
    let proxy_base_url = "https://iytnvsdsqvbdoqesyweo.supabase.co/functions/v1/curseforge-proxy";
    const BATCH_SIZE: usize = 50;
    let mut all_file_infos = Vec::new();
    let mut last_error = None;
    
    let total_batches = (file_ids.len() + BATCH_SIZE - 1) / BATCH_SIZE;
    
    for (batch_idx, chunk) in file_ids.chunks(BATCH_SIZE).enumerate() {
        let current_batch = batch_idx + 1;
        
        // Wrap request in Edge Function format
        let edge_request = EdgeFunctionRequest {
            endpoint: "/mods/files".to_string(),
            method: "POST".to_string(),
            body: GetModFilesRequest {
                file_ids: chunk.to_vec(),
            },
        };

        let max_retries = 5;
        let mut response = None;
        let mut batch_error = None;

        // Report progress
        on_progress(current_batch, total_batches);

        for attempt in 1..=max_retries {
            if attempt == 1 {
                println!("🌐 Fetching mod info batch {}/{} (size: {})", current_batch, total_batches, chunk.len());
            } else {
                 println!("🌐 Retrying mod info batch {}/{} (attempt {}/{})", current_batch, total_batches, attempt, max_retries);
            }

            // Build the request with optional auth
            let mut request = client
                .post(proxy_base_url)
                .header("Content-Type", "application/json")
                .header("apikey", anon_key);
            
            if let Some(token) = auth_token {
                request = request.header("Authorization", token);
            }

            request = request.json(&edge_request);
            
            match request.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    
                    if status.is_success() {
                        response = Some(resp);
                        batch_error = None;
                        break;
                    } else if status == 404 {
                        // 404 is acceptable - some files might not exist
                        response = Some(resp);
                        batch_error = None;
                        break;
                    } else if status == 401 {
                        // 401 Unauthorized - critical error, don't retry
                        let error_text = resp.text().await.unwrap_or_default();
                        println!("❌ CurseForge API authentication failed (401) - The proxy server is not authorized. Response: {}", error_text);
                        batch_error = Some(anyhow::anyhow!("CurseForge API authentication failed (401). Response: {}", error_text));
                        break;
                    } else if status == 403 {
                        // 403 Forbidden - critical error, don't retry
                        println!("❌ CurseForge API access forbidden (403) - Permission denied");
                        batch_error = Some(anyhow::anyhow!("CurseForge API access forbidden (403). The launcher does not have permission to access this content."));
                        break;
                    } else if status == 429 {
                        if attempt < max_retries {
                            // Rate limited - retry with exponential backoff
                            let delay_secs = 2u64.pow(attempt as u32);
                            println!("⚠️ CurseForge API rate limited (429), retrying in {} seconds...", delay_secs);
                            tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                            continue;
                        } else {
                            // Max retries exceeded for rate limit
                            println!("❌ CurseForge API rate limit exceeded after {} retries", max_retries);
                            batch_error = Some(anyhow::anyhow!("Rate limit exceeded (429). Create a LuminaKraft account to increase your download limits."));
                            break;
                        }
                    } else if status.is_server_error() && attempt < max_retries {
                        // Server error - retry
                        println!("⚠️ CurseForge API server error ({}), retrying...", status);
                        let delay_ms = 1000 * attempt;
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    } else {
                        // Other HTTP errors
                        batch_error = Some(anyhow::anyhow!("CurseForge API error: HTTP {} - {}", status.as_u16(), status.canonical_reason().unwrap_or("Unknown error")));
                        break;
                    }
                },
                Err(e) => {
                    if attempt < max_retries {
                        println!("⚠️ CurseForge API connection error, retrying... ({})", e);
                        let delay_ms = 200 * attempt;
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    } else {
                        batch_error = Some(anyhow::anyhow!("Failed to connect to CurseForge API after {} attempts: {}", max_retries, e));
                        break;
                    }
                }
            }
        }
        
        // Handle the response or error for this batch
        if let Some(error) = batch_error {
            last_error = Some(error);
            println!("❌ CurseForge API batch failed: {}", last_error.as_ref().unwrap());
            // Continue to next batch - we'll decide later if this is fatal
        } else if let Some(response) = response {
            match response.text().await {
                Ok(response_text) => {
                    match serde_json::from_str::<ApiResponse<Vec<ModFileInfo>>>(&response_text) {
                        Ok(api_response) => {
                            all_file_infos.extend(api_response.data);
                        },
                        Err(e) => {
                            last_error = Some(anyhow::anyhow!("Failed to parse CurseForge API response: {}", e));
                            println!("❌ Failed to parse CurseForge response: {}", e);
                        }
                    }
                },
                Err(e) => {
                    last_error = Some(anyhow::anyhow!("Failed to read CurseForge API response: {}", e));
                    println!("❌ Failed to read CurseForge response: {}", e);
                }
            }
        }
        
        // Delay between batches
        if chunk != file_ids.chunks(BATCH_SIZE).last().unwrap() {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    }
    
    // Check if we got any successful responses
    if all_file_infos.is_empty() && file_ids.len() > 0 {
        // No file info retrieved and we expected some - this is an error
        if let Some(error) = last_error {
            return Err(error);
        } else {
            return Err(anyhow::anyhow!("Failed to retrieve any mod file information from CurseForge API. All requests failed."));
        }
    }
    
    // Log if we had partial failures
    if let Some(error) = last_error {
        println!("⚠️ Some CurseForge API requests failed, but continuing with partial data: {}", error);
    }
    
    Ok(all_file_infos)
}

/// Verify if a file exists and has the correct hash
pub fn verify_file_hash(file_path: &PathBuf, expected_hashes: &[FileHash]) -> bool {
    if !file_path.exists() || expected_hashes.is_empty() {
        return false;
    }

    for hash in expected_hashes.iter() {
        let calculated_hash = match hash.algo {
            1 => { // SHA1
                match calculate_sha1(file_path) {
                    Ok(h) => h,
                    Err(_) => continue,
                }
            },
            _ => continue,
        };
        
        if let Some(expected_value) = &hash.value {
            if calculated_hash.to_lowercase() == expected_value.to_lowercase() {
                return true;
            }
        }
    }

    false
}

/// Download mods with progress tracking and failed mod detection
/// Progress ranges from start_percentage to end_percentage proportionally
/// override_filenames: Set of filenames present in the modpack's overrides folder
///                     These files will NOT be marked as failed even if they have no download URL
pub async fn download_mods_with_failed_tracking<F>(
    manifest: &CurseForgeManifest, 
    instance_dir: &PathBuf,
    emit_progress: F,
    start_percentage: f32,
    end_percentage: f32,
    auth_token: Option<&str>,
    anon_key: &str,
    override_filenames: &std::collections::HashSet<String>,
    pre_fetched_infos: Option<Vec<ModFileInfo>>,
    max_concurrent_downloads: Option<usize>,
) -> Result<Vec<serde_json::Value>>
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    use futures::{stream, StreamExt};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::sync::{Mutex, Semaphore};

    let mods_dir = instance_dir.join("mods");
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir)?;
    }

    let file_ids: Vec<i64> = manifest.files.iter().map(|f| f.file_id).collect();
    
    emit_progress(
        "progress.fetchingModInfo".to_string(),
        start_percentage + 5.0,
        "fetching_mod_info".to_string()
    );
    
    let all_file_infos = if let Some(infos) = pre_fetched_infos {
        infos
    } else {
        // Infinite retry loop for fetching mod info
        loop {
            match fetch_mod_files_batch(&file_ids, auth_token, anon_key, |current, total| {
                let percent = start_percentage + (current as f32 / total as f32) * 5.0;
                emit_progress(
                    format!("progress.fetchingModInfoBatch|{}|{}", current, total),
                    percent,
                    "fetching_mod_info".to_string()
                );
            }).await {
                Ok(infos) => break infos,
                Err(e) => {
                    let error_msg = e.to_string();
                    println!("DEBUG: Fetch mod info error: {:?}", e);
                    
                    if error_msg.contains("Error de red") || error_msg.contains("TIMEDOUT") || error_msg.contains("unreachable") || error_msg.to_lowercase().contains("offline") 
                        || error_msg.contains("dns") || error_msg.contains("connection closed") || error_msg.contains("hyper::Error") {
                         
                         emit_progress("progress.waitingForNetwork".to_string(), start_percentage, "waiting_for_network".to_string());
                         println!("⚠️ Network error fetching mod info, waiting for connection...");
                         tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                         continue;
                    }

                    emit_progress(
                        format!("progress.curseforgeApiError|{}", e),
                        start_percentage,
                        "curseforge_api_error".to_string()
                    );
                    return Err(e);
                }
            }
        }
    };
    
    let failed_mods = Arc::new(Mutex::new(Vec::new()));
    let mut file_id_to_project: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    
    for manifest_file in &manifest.files {
        file_id_to_project.insert(manifest_file.file_id, manifest_file.project_id);
    }
    
    let total_mods = all_file_infos.len();
    let progress_range = end_percentage - start_percentage;
    let completed_count = Arc::new(AtomicUsize::new(0));
    
    // Define concurrency limit for parallel downloads
    let max_concurrent = max_concurrent_downloads.unwrap_or(10);
    let download_semaphore = Arc::new(Semaphore::new(max_concurrent));
    
    println!("📥 Downloading {} mods in parallel (max {} concurrent)...", total_mods, max_concurrent);
    
    // Prepare download tasks
    let download_tasks: Vec<_> = all_file_infos.iter().map(|file_info| {
        let emit = emit_progress.clone();
        let mods_dir = mods_dir.clone();
        let instance_dir = instance_dir.clone();
        let failed_mods = failed_mods.clone();
        let completed_count = completed_count.clone();
        let override_filenames = override_filenames.clone();
        let file_id_to_project = file_id_to_project.clone();
        let download_semaphore = download_semaphore.clone();
        let file_info = file_info.clone();
        
        async move {
            // Acquire semaphore permit
            let _permit = download_semaphore.acquire().await.ok()?;
            
            let file_name = file_info.file_name.as_deref().unwrap_or("unknown_file");
            let mod_path = mods_dir.join(file_name);
            
            // Handle files without download URL
            let download_url = match &file_info.download_url {
                Some(url) if !url.is_empty() => url.clone(),
                _ => {
                    // Check if file exists in mods/ folder
                    if verify_file_hash(&mod_path, &file_info.hashes) {
                        let completed = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                        let mod_progress = start_percentage + (completed as f32 / total_mods as f32) * progress_range;
                        emit(format!("progress.downloadingModsProgress|{}|{}", completed, total_mods), mod_progress, "mod_already_exists".to_string());
                        return Some(());
                    }

                    // Check resourcepacks folder
                    let resourcepack_path = instance_dir.join("resourcepacks").join(file_name);
                    if verify_file_hash(&resourcepack_path, &file_info.hashes) {
                        let completed = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                        let mod_progress = start_percentage + (completed as f32 / total_mods as f32) * progress_range;
                        emit(format!("progress.downloadingModsProgress|{}|{}", completed, total_mods), mod_progress, "mod_already_exists".to_string());
                        return Some(());
                    }

                    // Check if file is in overrides (override_filenames contains paths like "mods/file.jar")
                    let mods_path = format!("mods/{}", file_name);
                    let resourcepacks_path = format!("resourcepacks/{}", file_name);
                    if override_filenames.contains(&mods_path) || override_filenames.contains(&resourcepacks_path) || override_filenames.contains(file_name) {
                        let completed = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                        let mod_progress = start_percentage + (completed as f32 / total_mods as f32) * progress_range;
                        emit(format!("progress.downloadingModsProgress|{}|{}", completed, total_mods), mod_progress, "mod_in_overrides".to_string());
                        println!("✓ File {} will be extracted from overrides", file_name);
                        return Some(());
                    }

                    // Mark as failed
                    let project_id = file_id_to_project.get(&file_info.id).copied().unwrap_or(file_info.mod_id.unwrap_or(-1));
                    let mut failed = failed_mods.lock().await;
                    failed.push(serde_json::json!({
                        "projectId": project_id,
                        "fileId": file_info.id,
                        "fileName": file_name
                    }));
                    
                    let completed = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                    let mod_progress = start_percentage + (completed as f32 / total_mods as f32) * progress_range;
                    emit(format!("progress.downloadingModsProgress|{}|{}", completed, total_mods), mod_progress, "mod_unavailable".to_string());
                    return Some(());
                }
            };
            
            // Check if file already exists with correct hash
            if verify_file_hash(&mod_path, &file_info.hashes) {
                let completed = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                let mod_progress = start_percentage + (completed as f32 / total_mods as f32) * progress_range;
                emit(format!("progress.downloadingModsProgress|{}|{}", completed, total_mods), mod_progress, "mod_already_exists".to_string());
                return Some(());
            }
            
            // Download with retry loop
            loop {
                match download_file(&download_url, &mod_path).await {
                    Ok(()) => {
                        if verify_file_hash(&mod_path, &file_info.hashes) {
                            let completed = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                            let mod_progress = start_percentage + (completed as f32 / total_mods as f32) * progress_range;
                            emit(
                                format!("progress.downloadingModsProgress|{}|{}", completed, total_mods),
                                mod_progress,
                                "downloading_mod".to_string()
                            );
                            break;
                        } else {
                            println!("⚠️ Hash mismatch for {}, retrying...", file_name);
                            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                            continue;
                        }
                    },
                    Err(e) => {
                        let error_msg = e.to_string();
                        
                        if error_msg.contains("Error de red") || error_msg.contains("TIMEDOUT") || 
                           error_msg.contains("unreachable") || error_msg.to_lowercase().contains("offline") {
                            println!("⚠️ Network error for {}, retrying...", file_name);
                            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                            continue;
                        }
                        
                        // Fatal error
                        println!("❌ Failed to download {}: {}", file_name, e);
                        let mut failed = failed_mods.lock().await;
                        failed.push(serde_json::json!({
                            "fileId": file_info.id,
                            "fileName": file_name,
                            "url": download_url,
                            "error": error_msg
                        }));
                        
                        let completed = completed_count.fetch_add(1, Ordering::Relaxed) + 1;
                        let mod_progress = start_percentage + (completed as f32 / total_mods as f32) * progress_range;
                        emit(format!("progress.downloadingModsProgress|{}|{}", completed, total_mods), mod_progress, "mod_download_error".to_string());
                        break;
                    }
                }
            }
            
            Some(())
        }
    }).collect();
    
    // Execute all downloads in parallel with buffer
    let _: Vec<_> = stream::iter(download_tasks)
        .buffer_unordered(max_concurrent * 2) // Allow buffering for smoother execution
        .collect()
        .await;
    
    // Extract the failed mods from Arc<Mutex>
    let result = match Arc::try_unwrap(failed_mods) {
        Ok(mutex) => mutex.into_inner(),
        Err(arc) => arc.lock().await.clone(),
    };
    
    println!("✅ Mod downloads complete! {} failed", result.len());
    
    Ok(result)
}

/// Download mods with progress tracking and return expected filenames for cleanup
/// This wraps download_mods_with_failed_tracking and also returns the set of expected filenames
/// override_filenames: Set of filenames present in the modpack's overrides folder
pub async fn download_mods_with_filenames<F>(
    manifest: &CurseForgeManifest, 
    instance_dir: &PathBuf,
    emit_progress: F,
    start_percentage: f32,
    end_percentage: f32,
    auth_token: Option<&str>,
    anon_key: &str,
    override_filenames: &std::collections::HashSet<String>,
    max_concurrent_downloads: Option<usize>,
) -> Result<(Vec<serde_json::Value>, std::collections::HashSet<String>)>
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    let file_ids: Vec<i64> = manifest.files.iter().map(|f| f.file_id).collect();
    
    // Fetch file info to get filenames
    emit_progress(
        "progress.fetchingModInfo".to_string(),
        start_percentage + 2.0,
        "fetching_mod_info".to_string()
    );
    
    // Infinite retry loop for fetching filenames
    let all_file_infos = loop {
        match fetch_mod_files_batch(&file_ids, auth_token, anon_key, |current, total| {
            let percent = start_percentage + (current as f32 / total as f32) * 5.0;
            emit_progress(
                format!("progress.fetchingModInfoBatch|{}|{}", current, total),
                percent,
                "fetching_mod_info".to_string()
            );
        }).await {
            Ok(infos) => break infos,
            Err(e) => {
                let error_msg = e.to_string();
                println!("DEBUG: Fetch filenames error: {:?}", e);
                
                if error_msg.contains("Error de red") || error_msg.contains("TIMEDOUT") || error_msg.contains("unreachable") || error_msg.to_lowercase().contains("offline") 
                    || error_msg.contains("dns") || error_msg.contains("connection closed") || error_msg.contains("hyper::Error") {
                        
                        emit_progress("progress.waitingForNetwork".to_string(), start_percentage + 2.0, "waiting_for_network".to_string());
                        println!("⚠️ Network error fetching filenames, waiting for connection...");
                        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                        continue;
                }
                
                return Err(e);
            }
        }
    };
    
    // Collect expected filenames for cleanup
    let expected_filenames: std::collections::HashSet<String> = all_file_infos
        .iter()
        .filter_map(|info| info.file_name.clone())
        .collect();
    
    println!("📋 Expected {} mod files from manifest", expected_filenames.len());
    
    // Now do the actual download using the existing function
    // Now do the actual download using the existing function, passing the already fetched infos
    let failed_mods = download_mods_with_failed_tracking(
        manifest, 
        instance_dir, 
        emit_progress, 
        start_percentage, 
        end_percentage, 
        auth_token, 
        anon_key, 
        override_filenames,
        Some(all_file_infos),
        max_concurrent_downloads
    ).await?;
    
    Ok((failed_mods, expected_filenames))
} 