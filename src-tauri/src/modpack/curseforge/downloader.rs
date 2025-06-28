use anyhow::Result;
use std::path::PathBuf;
use std::fs;
use reqwest::Client;
use lyceris::util::hash::calculate_sha1;
use crate::utils::downloader::download_file;
use super::types::{CurseForgeManifest, ModFileInfo, ApiResponse, GetModFilesRequest, FileHash};



/// Fetch mod file information in batches from CurseForge API
pub async fn fetch_mod_files_batch(file_ids: &[i64]) -> Result<Vec<ModFileInfo>> {
    let client = Client::builder()
        .user_agent("LKLauncher")
        .timeout(std::time::Duration::from_secs(60))
        .build()?;
    
    let proxy_base_url = "https://api.luminakraft.com/v1/curseforge";
    const BATCH_SIZE: usize = 50;
    let mut all_file_infos = Vec::new();
    
    for chunk in file_ids.chunks(BATCH_SIZE) {
        let request_body = GetModFilesRequest {
            file_ids: chunk.to_vec(),
        };
        
        let max_retries = 3;
        let mut response = None;
        
        for attempt in 1..=max_retries {
            let batch_url = format!("{}/mods/files", proxy_base_url);
            
            match client.post(&batch_url)
                .json(&request_body)
                .send()
                .await {
                Ok(resp) => {
                    if resp.status().is_success() || resp.status() == 404 {
                        response = Some(resp);
                        break;
                    } else if resp.status() == 429 && attempt < max_retries {
                        let delay_ms = 2000 * attempt * attempt;
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    } else {
                        break;
                    }
                },
                Err(_) => {
                    if attempt < max_retries {
                        let delay_ms = 200 * attempt;
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    } else {
                        break;
                    }
                }
            }
        }
        
        if let Some(response) = response {
            if let Ok(response_text) = response.text().await {
                if let Ok(api_response) = serde_json::from_str::<ApiResponse<Vec<ModFileInfo>>>(&response_text) {
                    all_file_infos.extend(api_response.data);
                }
            }
        }
        
        // Delay between batches
        if chunk != file_ids.chunks(BATCH_SIZE).last().unwrap() {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
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
pub async fn download_mods_with_failed_tracking<F>(
    manifest: &CurseForgeManifest, 
    instance_dir: &PathBuf,
    emit_progress: F
) -> Result<Vec<serde_json::Value>>
where
    F: Fn(String, f32, String) + Send + Sync + 'static,
{
    let mods_dir = instance_dir.join("mods");
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir)?;
    }

    let file_ids: Vec<i64> = manifest.files.iter().map(|f| f.file_id).collect();
    let all_file_infos = fetch_mod_files_batch(&file_ids).await?;
    
    let mut failed_mods = Vec::new();
    let mut file_id_to_project: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    
    for manifest_file in &manifest.files {
        file_id_to_project.insert(manifest_file.file_id, manifest_file.project_id);
    }
    
    for (index, file_info) in all_file_infos.iter().enumerate() {
        let progress_percentage = 60.0 + (index as f32 / all_file_infos.len() as f32) * 30.0;
        
        emit_progress(
            format!("downloading_modpack:{}:{}", index + 1, all_file_infos.len()),
            progress_percentage,
            "downloading_modpack_file".to_string()
        );
        
        let download_url = match &file_info.download_url {
            Some(url) if !url.is_empty() => url,
            _ => {
                let file_name = file_info.file_name.as_deref().unwrap_or("archivo desconocido");
                let mod_path = mods_dir.join(file_name);
                
                if verify_file_hash(&mod_path, &file_info.hashes) {
                    emit_progress(
                        format!("mod_exists:{}", file_name),
                        progress_percentage + 5.0,
                        "mod_found_locally".to_string()
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
                        format!("⚠️ Mod no disponible: {}", file_name),
                        progress_percentage,
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
                progress_percentage + 5.0,
                "mod_already_exists".to_string()
            );
            continue;
        }
        
        emit_progress(
            format!("mod_name:{}", file_name),
            progress_percentage + 3.0,
            "downloading_mod_file".to_string()
        );
        
        // Download the file
        match download_file(download_url, &mod_path).await {
            Ok(_) => {
                if verify_file_hash(&mod_path, &file_info.hashes) {
                    emit_progress(
                        format!("mod_completed:{}", file_name),
                        progress_percentage + 5.0,
                        "mod_downloaded_verified".to_string()
                    );
                } else {
                    emit_progress(
                        format!("mod_error:{}", file_name),
                        progress_percentage + 5.0,
                        "mod_hash_mismatch".to_string()
                    );
                    if mod_path.exists() {
                        std::fs::remove_file(&mod_path).ok();
                    }
                }
            },
            Err(e) => {
                emit_progress(
                    format!("❌ Error al descargar {}: {}", file_name, e),
                    progress_percentage,
                    "error_downloading_mod".to_string()
                );
            }
        }
    }
    
    Ok(failed_mods)
} 