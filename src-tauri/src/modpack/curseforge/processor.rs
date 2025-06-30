use anyhow::{Result, anyhow};
use std::path::PathBuf;
use std::fs;
use super::manifest::{read_manifest, get_modloader_info, process_overrides};
use super::downloader::download_mods_with_failed_tracking;
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



 