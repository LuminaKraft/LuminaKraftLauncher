use anyhow::{Result, anyhow};
use std::path::PathBuf;
use std::fs;
use super::manifest::{read_manifest, get_modloader_info, process_overrides};
use super::downloader::download_mods_with_filenames;
use crate::modpack::extraction::extract_zip;

/// Process a CurseForge modpack with progress tracking and failed mod detection
pub async fn process_curseforge_modpack_with_failed_tracking<F>(
    modpack_zip_path: &PathBuf,
    instance_dir: &PathBuf,
    emit_progress: F,
    auth_token: Option<&str>,
    anon_key: &str,
) -> Result<(String, String, Option<u32>, Vec<serde_json::Value>)>
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
    
    // Create temp directory for extraction with unique name to avoid conflicts
    let temp_dir = instance_dir.join(format!("temp_extract_{}", chrono::Utc::now().timestamp_millis()));
    
    // Remove any existing temp directories from previous runs
    if let Ok(entries) = fs::read_dir(instance_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.file_name().unwrap_or_default().to_string_lossy().starts_with("temp_extract") {
                let _ = fs::remove_dir_all(&path); // Best effort cleanup
            }
        }
    }
    
    fs::create_dir_all(&temp_dir)
        .map_err(|e| anyhow!("Failed to create temp directory {}: {}", temp_dir.display(), e))?;
    
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
    
    // Download mods - this also returns the expected filenames for cleanup
    emit_progress(
        "".to_string(),
        30.0,
        "preparing_mod_downloads".to_string()
    );
    
    let (failed_mods, expected_filenames) = download_mods_with_filenames(&manifest, instance_dir, emit_progress.clone(), 30.0, 95.0, auth_token, anon_key).await?;
    
    // Clean up mods that are no longer in the manifest (for updates)
    emit_progress(
        "progress.cleaningRemovedMods".to_string(),
        96.0,
        "cleaning_removed_mods".to_string()
    );
    cleanup_removed_mods(&expected_filenames, instance_dir)?;
    
    // Clean up temp directory
    emit_progress(
        "finalizing".to_string(),
        97.0,
        "finalizing".to_string()
    );
    fs::remove_dir_all(&temp_dir)?;
    
    // Get modloader info
    let (modloader, modloader_version) = get_modloader_info(&manifest)?;

    // Extract recommended RAM from manifest (optional field)
    let recommended_ram = manifest.minecraft.recommended_ram;

    emit_progress(
        "curseforge_completed".to_string(),
        100.0,
        "curseforge_completed".to_string()
    );

    Ok((modloader, modloader_version, recommended_ram, failed_mods))
}

/// Clean up mods that are no longer in the manifest (useful for updates)
/// Takes the list of expected mod filenames from the CurseForge API response
fn cleanup_removed_mods(expected_filenames: &std::collections::HashSet<String>, instance_dir: &PathBuf) -> Result<()> {
    let mods_dir = instance_dir.join("mods");
    
    if !mods_dir.exists() {
        return Ok(());
    }
    
    // Read all .jar files in the mods directory
    let entries = match fs::read_dir(&mods_dir) {
        Ok(entries) => entries,
        Err(e) => {
            eprintln!("⚠️ Failed to read mods directory: {}", e);
            return Ok(());
        }
    };
    
    let mut removed_count = 0;
    
    for entry in entries.flatten() {
        let path = entry.path();
        
        // Only process .jar files
        if let Some(ext) = path.extension() {
            if ext != "jar" {
                continue;
            }
        } else {
            continue;
        }
        
        // Get filename
        let filename = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        
        // If this file is NOT in the expected list, delete it
        if !expected_filenames.contains(&filename) {
            if let Err(e) = fs::remove_file(&path) {
                eprintln!("⚠️ Failed to remove old mod {}: {}", filename, e);
            } else {
                println!("🗑️ Removed old mod: {}", filename);
                removed_count += 1;
            }
        }
    }
    
    if removed_count > 0 {
        println!("🧹 Cleaned up {} old mod(s)", removed_count);
    }
    
    Ok(())
}