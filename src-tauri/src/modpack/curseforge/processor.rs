use anyhow::{Result, anyhow};
use std::path::PathBuf;
use std::fs;
use super::manifest::{read_manifest, get_modloader_info, process_overrides, get_override_filenames};
use super::downloader::download_mods_with_filenames;
use crate::modpack::extraction::extract_zip;

/// Process a CurseForge modpack with progress tracking and failed mod detection
/// category: "official" | "partner" | "community" | None (imported)
/// allow_custom_mods: Whether to preserve user-added mods (default true)
/// allow_custom_resourcepacks: Whether to preserve user-added resourcepacks (default true)
pub async fn process_curseforge_modpack_with_failed_tracking<F>(
    modpack_zip_path: &PathBuf,
    instance_dir: &PathBuf,
    emit_progress: F,
    auth_token: Option<&str>,
    anon_key: &str,
    category: Option<&str>,
    allow_custom_mods: bool,
    allow_custom_resourcepacks: bool,
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
    
    // Download mods - this also returns the expected filenames for cleanup
    emit_progress(
        "".to_string(),
        20.0,
        "preparing_mod_downloads".to_string()
    );
    
    let (failed_mods, expected_filenames) = download_mods_with_filenames(&manifest, instance_dir, emit_progress.clone(), 20.0, 90.0, auth_token, anon_key).await?;
    
    // Determine cleanup behavior based on category and allow_custom flags
    // - official/partner: Cleanup enabled by default, respects allow_custom flags
    // - community/imported: No cleanup, preserve user's custom files
    let is_managed = category
        .map(|c| c == "official" || c == "partner")
        .unwrap_or(false);
    
    // Only do cleanup for managed modpacks (official/partner)
    // Cleanup mods if: is managed AND NOT allow_custom_mods
    // Cleanup resourcepacks if: is managed AND NOT allow_custom_resourcepacks
    let should_cleanup_mods = is_managed && !allow_custom_mods;
    let should_cleanup_resourcepacks = is_managed && !allow_custom_resourcepacks;
    
    if should_cleanup_mods || should_cleanup_resourcepacks {
        emit_progress(
            "progress.cleaningRemovedMods".to_string(),
            91.0,
            "cleaning_removed_mods".to_string()
        );
        
        // Get override filenames to preserve them during cleanup
        let override_filenames = get_override_filenames(&manifest, &temp_dir);
        
        // Merge expected_filenames with override filenames
        let mut all_expected_filenames = expected_filenames.clone();
        all_expected_filenames.extend(override_filenames);
        
        println!("🔍 Expected filenames ({}):", all_expected_filenames.len());
        for name in &all_expected_filenames {
            println!("  ✓ {}", name);
        }
        cleanup_removed_files_selective(&all_expected_filenames, instance_dir, should_cleanup_mods, should_cleanup_resourcepacks)?;
        println!("🛡️ Anti-cheat cleanup: mods={}, resourcepacks={} (category: {})", 
            should_cleanup_mods, should_cleanup_resourcepacks, category.unwrap_or("unknown"));
    } else {
        println!("📦 Preserving user files (category: {}, allow_mods: {}, allow_resourcepacks: {})", 
            category.unwrap_or("imported"), allow_custom_mods, allow_custom_resourcepacks);
    }
    
    // Process overrides AFTER cleanup - files from overrides will not be deleted
    emit_progress(
        "processing_overrides".to_string(),
        95.0,
        "processing_overrides".to_string()
    );
    
    process_overrides(&manifest, &temp_dir, instance_dir, emit_progress.clone())?;
    
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

/// Clean up mods and resourcepacks that are no longer in the manifest (useful for updates)
/// Takes the list of expected filenames from the CurseForge API response
/// Cleans .jar files from mods/ and .zip files from resourcepacks/
/// With selective cleanup based on allow_custom flags
fn cleanup_removed_files_selective(
    expected_filenames: &std::collections::HashSet<String>,
    instance_dir: &PathBuf,
    cleanup_mods: bool,
    cleanup_resourcepacks: bool
) -> Result<()> {
    let mut total_removed = 0;
    
    // Clean up mods directory (.jar files) only if cleanup_mods is true
    if cleanup_mods {
        total_removed += cleanup_directory(
            &instance_dir.join("mods"),
            expected_filenames,
            "jar",
            "mod"
        );
    }
    
    // Clean up resourcepacks directory (.zip files) only if cleanup_resourcepacks is true
    if cleanup_resourcepacks {
        total_removed += cleanup_directory(
            &instance_dir.join("resourcepacks"),
            expected_filenames,
            "zip",
            "resourcepack"
        );
    }
    
    if total_removed > 0 {
        println!("🧹 Cleaned up {} old file(s) total", total_removed);
    }
    
    Ok(())
}

/// Helper function to clean up a specific directory
fn cleanup_directory(
    dir: &PathBuf,
    expected_filenames: &std::collections::HashSet<String>,
    extension: &str,
    file_type: &str
) -> usize {
    if !dir.exists() {
        return 0;
    }
    
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => {
            eprintln!("⚠️ Failed to read {} directory: {}", file_type, e);
            return 0;
        }
    };
    
    let mut removed_count = 0;
    
    for entry in entries.flatten() {
        let path = entry.path();
        
        // Only process files with the specified extension
        if let Some(ext) = path.extension() {
            if ext != extension {
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
                eprintln!("⚠️ Failed to remove old {} {}: {}", file_type, filename, e);
            } else {
                println!("🗑️ Removed old {}: {}", file_type, filename);
                removed_count += 1;
            }
        }
    }
    
    removed_count
}