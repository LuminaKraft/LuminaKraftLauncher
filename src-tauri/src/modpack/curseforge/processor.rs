use anyhow::{Result, anyhow};
use std::path::PathBuf;
use std::fs;
use super::types::CurseForgeManifest;
use super::manifest::{read_manifest, get_modloader_info, process_overrides};
use super::downloader::{download_mods_with_failed_tracking, fetch_mod_files_batch, verify_file_hash};
use crate::utils::downloader::download_file;
use crate::modpack::extraction::extract_zip;

/// Process a CurseForge modpack with progress tracking and failed mod detection
pub async fn process_curseforge_modpack_with_failed_tracking<F>(
    modpack_zip_path: &PathBuf,
    instance_dir: &PathBuf,
    emit_progress: F,
) -> Result<(String, String, Vec<serde_json::Value>)> 
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    emit_progress(
        "processing_curseforge".to_string(),
        0.0,
        "processing_curseforge".to_string()
    );
    
    // Ensure instance directory exists
    if let Err(e) = fs::create_dir_all(instance_dir) {
        return Err(anyhow!("Failed to create instance directory {}: {}", instance_dir.display(), e));
    }
    
    // Create temp directory for extraction
    let temp_dir = instance_dir.join("temp_extract");
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)?;
    }
    fs::create_dir_all(&temp_dir)?;
    
    emit_progress(
        "Extrayendo archivos del modpack".to_string(),
        5.0,
        "extracting_modpack".to_string()
    );
    
    // Extract ZIP to temp directory
    extract_zip(modpack_zip_path, &temp_dir)?;
    
    emit_progress(
        "Leyendo información del modpack".to_string(),
        10.0,
        "reading_manifest".to_string()
    );
    
    // Read manifest
    let manifest = read_manifest(&temp_dir)?;
    
    emit_progress(
        format!("Modpack: {} v{} (Minecraft {})", manifest.name, manifest.version, manifest.minecraft.version),
        15.0,
        "modpack_info".to_string()
    );
    
    // Process overrides first
    emit_progress(
        "processing_overrides".to_string(),
        20.0,
        "processing_overrides".to_string()
    );
    
    process_overrides(&manifest, &temp_dir, instance_dir, emit_progress.clone())?;
    
    // Download mods - internal progress will be 30% to 95% (maps to 70%-100% externally)
    emit_progress(
        "".to_string(),
        30.0,
        "preparing_mod_downloads".to_string()
    );
    
    let failed_mods = download_mods_with_failed_tracking(&manifest, instance_dir, emit_progress.clone(), 30.0, 95.0).await?;
    
    // Clean up temp directory
    emit_progress(
        "finalizing".to_string(),
        97.0,
        "finalizing".to_string()
    );
    fs::remove_dir_all(&temp_dir)?;
    
    // Get modloader info
    let (modloader, modloader_version) = get_modloader_info(&manifest)?;
    
    emit_progress(
        "curseforge_completed".to_string(),
        100.0,
        "curseforge_completed".to_string()
    );
    
    Ok((modloader, modloader_version, failed_mods))
}



/// Process a CurseForge modpack for update, checking existing mods
pub async fn process_curseforge_modpack_for_update<F>(
    modpack_zip_path: &PathBuf,
    temp_extract_dir: &PathBuf,
    existing_instance_dir: &PathBuf,
    emit_progress: F,
) -> Result<(String, String)> 
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    emit_progress(
        "Procesando modpack de CurseForge para actualización".to_string(),
        0.0,
        "processing_curseforge".to_string()
    );
    
    // Ensure temp_extract_dir exists
    if let Err(e) = fs::create_dir_all(temp_extract_dir) {
        return Err(anyhow!("Failed to create temp extraction directory {}: {}", temp_extract_dir.display(), e));
    }
    
    // Create nested temp directory
    let temp_dir = temp_extract_dir.join("temp_extract");
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)?;
    }
    fs::create_dir_all(&temp_dir)?;
    
    emit_progress(
        "extracting_modpack".to_string(),
        5.0,
        "extracting_modpack".to_string()
    );
    
    // Extract ZIP
    extract_zip(modpack_zip_path, &temp_dir)?;
    
    emit_progress(
        "reading_manifest".to_string(),
        10.0,
        "reading_manifest".to_string()
    );
    
    // Read manifest
    let manifest = read_manifest(&temp_dir)?;
    
    emit_progress(
        format!("Modpack: {} v{} (Minecraft {})", manifest.name, manifest.version, manifest.minecraft.version),
        15.0,
        "modpack_info".to_string()
    );
    
    // Process mods with update checking
    emit_progress(
        format!("Verificando {} mods para actualización", manifest.files.len()),
        20.0,
        "preparing_mods_update".to_string()
    );
    
    let (new_mod_filenames, api_errors_count) = download_mods_for_update(&manifest, temp_extract_dir, existing_instance_dir, emit_progress.clone()).await?;
    
    // Only remove obsolete mods if error rate is acceptable
    let total_mods = manifest.files.len();
    let error_percentage = (api_errors_count as f64 / total_mods as f64) * 100.0;
    let max_acceptable_error_rate = 5.0;
    
    if error_percentage < max_acceptable_error_rate {
        emit_progress(
            "Eliminando mods obsoletos...".to_string(),
            85.0,
            "removing_obsolete_mods".to_string()
        );
        
        remove_obsolete_mods(&new_mod_filenames, existing_instance_dir).await?;
    } else {
        emit_progress(
            format!("⚠️ Saltando eliminación de mods obsoletos - {} errores ({}% > {}%)", api_errors_count, error_percentage as u32, max_acceptable_error_rate as u32),
            85.0,
            "skipping_obsolete_removal".to_string()
        );
    }
    
    // Process overrides
    emit_progress(
        "Procesando archivos adicionales".to_string(),
        95.0,
        "processing_overrides".to_string()
    );
    
    process_overrides(&manifest, &temp_dir, temp_extract_dir, emit_progress.clone())?;
    
    // Clean up temp directory
    fs::remove_dir_all(&temp_dir)?;
    
    // Get modloader info
    let (modloader, modloader_version) = get_modloader_info(&manifest)?;
    
    emit_progress(
        "curseforge_completed".to_string(),
        100.0,
        "curseforge_completed".to_string()
    );
    
    Ok((modloader, modloader_version))
}

/// Download mods for update, checking existing files
async fn download_mods_for_update<F>(
    manifest: &CurseForgeManifest, 
    temp_extract_dir: &PathBuf,
    existing_instance_dir: &PathBuf,
    emit_progress: F
) -> Result<(std::collections::HashSet<String>, usize)> 
where
    F: Fn(String, f32, String) + Send + Sync + 'static,
{
    let temp_mods_dir = temp_extract_dir.join("mods");
    if !temp_mods_dir.exists() {
        fs::create_dir_all(&temp_mods_dir)?;
    }
    
    let existing_mods_dir = existing_instance_dir.join("mods");

    let file_ids: Vec<i64> = manifest.files.iter().map(|f| f.file_id).collect();
    let all_file_infos = fetch_mod_files_batch(&file_ids).await?;
    
    let mut new_mod_filenames = std::collections::HashSet::new();
    let api_errors_count = 0; // Simplified for now
    
    let total_mods = all_file_infos.len();
    
    for (index, file_info) in all_file_infos.iter().enumerate() {
        // Progress from 40% to 90% proportionally for mod updates
        let progress_percentage = 40.0 + (index as f32 / total_mods as f32) * 50.0;
        
        emit_progress(
            format!("downloading_modpack:{}:{}", index + 1, total_mods),
            progress_percentage,
            "downloading_modpack_file".to_string()
        );
        
        let download_url = match &file_info.download_url {
            Some(url) if !url.is_empty() => url,
            _ => {
                let file_name = file_info.file_name.as_deref().unwrap_or("unknown_file");
                emit_progress(
                    format!("mod_unavailable:{}", file_name),
                    progress_percentage,
                    "mod_unavailable".to_string()
                );
                continue;
            }
        };

        let file_name = match &file_info.file_name {
            Some(name) if !name.is_empty() => name,
            _ => continue,
        };
        
        new_mod_filenames.insert(file_name.clone());
        
        let existing_mod_path = existing_mods_dir.join(file_name);
        let temp_mod_path = temp_mods_dir.join(file_name);
        
        // Check if file exists in current instance with correct hash
        if verify_file_hash(&existing_mod_path, &file_info.hashes) {
            // Copy from existing instance to temp
            fs::copy(&existing_mod_path, &temp_mod_path)?;
            
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
        
        // Download to temp directory
        match download_file(download_url, &temp_mod_path).await {
            Ok(_) => {
                if verify_file_hash(&temp_mod_path, &file_info.hashes) {
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
                    if temp_mod_path.exists() {
                        std::fs::remove_file(&temp_mod_path).ok();
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
    
    Ok((new_mod_filenames, api_errors_count))
}

/// Remove obsolete mods that are not in the new modpack
async fn remove_obsolete_mods(
    new_mod_filenames: &std::collections::HashSet<String>,
    existing_instance_dir: &PathBuf,
) -> Result<()> {
    let existing_mods_dir = existing_instance_dir.join("mods");
    
    if !existing_mods_dir.exists() {
        return Ok(());
    }
    
    let mut obsolete_mods = Vec::new();
    
    for entry in fs::read_dir(&existing_mods_dir)? {
        let entry = entry?;
        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy();
        
        // Only process .jar files
        if file_name_str.ends_with(".jar") {
            if !new_mod_filenames.contains(file_name_str.as_ref()) {
                obsolete_mods.push((entry.path(), file_name_str.to_string()));
            }
        }
    }
    
    // Remove obsolete mods
    for (mod_path, _mod_name) in obsolete_mods.iter() {
        if let Err(_e) = fs::remove_file(mod_path) {
            // Silently continue if removal fails
        }
    }
    
    Ok(())
} 