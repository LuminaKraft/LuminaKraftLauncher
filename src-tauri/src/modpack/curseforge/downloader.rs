use anyhow::Result;
use std::path::PathBuf;
use std::fs;
use reqwest::Client;
use lyceris::util::hash::calculate_sha1;
use crate::utils::downloader::download_file;
use super::types::{CurseForgeManifest, ModFileInfo, ApiResponse, GetModFilesRequest, FileHash};



/// Fetch mod file information in batches from CurseForge API
pub async fn fetch_mod_files_batch(file_ids: &[i64], auth_token: Option<&str>) -> Result<Vec<ModFileInfo>> {
    let client = Client::builder()
        .user_agent("LKLauncher/1.0 (CurseForge API Client)")
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .pool_idle_timeout(std::time::Duration::from_secs(30))
        .pool_max_idle_per_host(10)
        .build()?;
    
    let proxy_base_url = "https://api.luminakraft.com/v1/curseforge";
    const BATCH_SIZE: usize = 50;
    let mut all_file_infos = Vec::new();
    let mut last_error = None;
    
    for chunk in file_ids.chunks(BATCH_SIZE) {
        let request_body = GetModFilesRequest {
            file_ids: chunk.to_vec(),
        };
        
        let max_retries = 3;
        let mut response = None;
        let mut batch_error = None;
        
        for attempt in 1..=max_retries {
            let batch_url = format!("{}/mods/files", proxy_base_url);
            
            if attempt == 1 {
                println!("🌐 Fetching mod info from CurseForge API: {} (batch size: {})", batch_url, chunk.len());
            }
            
            let mut request = client.post(&batch_url)
                .json(&request_body);
            
            // Add authentication headers
            if let Some(token) = auth_token {
                if token.starts_with("Bearer ") {
                    // Microsoft token - use Authorization header
                    request = request.header("Authorization", token);
                } else {
                    // Offline launcher token - use x-lk-token header
                    request = request.header("x-lk-token", token);
                }
            }
            
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
                        println!("❌ CurseForge API authentication failed (401) - The proxy server is not authorized");
                        batch_error = Some(anyhow::anyhow!("CurseForge API authentication failed (401). The launcher is not authorized to access CurseForge mod data. Please try again later or contact support."));
                        break;
                    } else if status == 403 {
                        // 403 Forbidden - critical error, don't retry
                        println!("❌ CurseForge API access forbidden (403) - Permission denied");
                        batch_error = Some(anyhow::anyhow!("CurseForge API access forbidden (403). The launcher does not have permission to access this content."));
                        break;
                    } else if status == 429 && attempt < max_retries {
                        // Rate limited - retry with exponential backoff
                        println!("⚠️ CurseForge API rate limited, retrying in {} seconds...", 2 * attempt * attempt);
                        let delay_ms = 2000 * attempt * attempt;
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                        continue;
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
pub async fn download_mods_with_failed_tracking<F>(
    manifest: &CurseForgeManifest, 
    instance_dir: &PathBuf,
    emit_progress: F,
    start_percentage: f32,
    end_percentage: f32,
    auth_token: Option<&str>,
) -> Result<Vec<serde_json::Value>>
where
    F: Fn(String, f32, String) + Send + Sync + 'static,
{
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
    
    let all_file_infos = match fetch_mod_files_batch(&file_ids, auth_token).await {
        Ok(infos) => infos,
        Err(e) => {
            emit_progress(
                format!("progress.curseforgeApiError|{}", e),
                start_percentage,
                "curseforge_api_error".to_string()
            );
            return Err(e);
        }
    };
    
    let mut failed_mods = Vec::new();
    let mut file_id_to_project: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    
    for manifest_file in &manifest.files {
        file_id_to_project.insert(manifest_file.file_id, manifest_file.project_id);
    }
    
    let total_mods = all_file_infos.len();
    let progress_range = end_percentage - start_percentage;
    
    for (index, file_info) in all_file_infos.iter().enumerate() {
        // Calculate proportional progress from start_percentage to end_percentage
        let mod_progress = start_percentage + (index as f32 / total_mods as f32) * progress_range;
        
        emit_progress(
            format!("downloading_modpack:{}:{}", index + 1, total_mods),
            mod_progress,
            "downloading_modpack_file".to_string()
        );
        
        let download_url = match &file_info.download_url {
            Some(url) if !url.is_empty() => url,
            _ => {
                let file_name = file_info.file_name.as_deref().unwrap_or("unknown_file");
                let mod_path = mods_dir.join(file_name);
                
                if verify_file_hash(&mod_path, &file_info.hashes) {
                    emit_progress(
                        format!("mod_exists:{}", file_name),
                        mod_progress,
                        "mod_already_exists".to_string()
                    );
                    continue;
                } else {
                    let project_id = file_id_to_project.get(&file_info.id).copied().unwrap_or(file_info.mod_id.unwrap_or(-1));
                    let failed_mod = serde_json::json!({
                        "projectId": project_id,
                        "fileId": file_info.id,
                        "fileName": file_name
                    });
                    failed_mods.push(failed_mod);
                    
                    emit_progress(
                        format!("mod_unavailable:{}", file_name),
                        mod_progress,
                        "mod_unavailable".to_string()
                    );
                    continue;
                }
            }
        };

        let file_name = match &file_info.file_name {
            Some(name) if !name.is_empty() => name,
            _ => continue,
        };
        
        let mod_path = mods_dir.join(file_name);
        
        // Check if file already exists with correct hash
        if verify_file_hash(&mod_path, &file_info.hashes) {
            emit_progress(
                format!("mod_exists:{}", file_name),
                mod_progress,
                "mod_already_exists".to_string()
            );
            continue;
        }
        
        emit_progress(
            format!("mod_name:{}", file_name),
            mod_progress,
            "downloading_mod_file".to_string()
        );
        
        // Download the file
        match download_file(download_url, &mod_path).await {
            Ok(_) => {
                if verify_file_hash(&mod_path, &file_info.hashes) {
                    let completed_progress = start_percentage + ((index + 1) as f32 / total_mods as f32) * progress_range;
                    emit_progress(
                        format!("mod_completed:{}", file_name),
                        completed_progress,
                        "mod_downloaded_verified".to_string()
                    );
                } else {
                    emit_progress(
                        format!("mod_error:{}", file_name),
                        mod_progress,
                        "mod_hash_mismatch".to_string()
                    );
                    if mod_path.exists() {
                        std::fs::remove_file(&mod_path).ok();
                    }
                }
            },
            Err(e) => {
                emit_progress(
                    format!("mod_download_error:{}:{}", file_name, e),
                    mod_progress,
                    "mod_download_error".to_string()
                );
            }
        }
    }
    
    Ok(failed_mods)
} 