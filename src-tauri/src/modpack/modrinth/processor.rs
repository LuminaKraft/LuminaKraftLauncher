use anyhow::{Result, anyhow};
use std::path::PathBuf;
use std::fs;
use std::collections::HashSet;
use super::manifest::{read_manifest, get_modloader_info, process_overrides, get_override_filenames, get_minecraft_version};
use super::downloader::download_files_with_failed_tracking;
use crate::modpack::extraction::extract_zip;

/// Process a Modrinth modpack (.mrpack) with progress tracking and failed file detection
/// 
/// category: "official" | "partner" | "community" | None (imported)
/// allow_custom_mods: Whether to preserve user-added mods (default true)
/// allow_custom_resourcepacks: Whether to preserve user-added resourcepacks (default true)
/// old_installed_files: Files from previous version's integrity.file_hashes (for update comparison)
/// is_legacy_instance: If true, perform aggressive disk cleanup
pub async fn process_modrinth_modpack_with_failed_tracking<F>(
    modpack_zip_path: &PathBuf,
    instance_dir: &PathBuf,
    emit_progress: F,
    category: Option<&str>,
    allow_custom_mods: bool,
    allow_custom_resourcepacks: bool,
    old_installed_files: Option<HashSet<String>>,
    is_legacy_instance: bool,
) -> Result<(String, String, String, Option<u32>, Vec<serde_json::Value>)>
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    emit_progress(
        "processing_modrinth".to_string(),
        0.0,
        "processing_modrinth".to_string()
    );
    
    // Ensure instance directory exists
    if let Err(e) = fs::create_dir_all(instance_dir) {
        return Err(anyhow!("Failed to create instance directory {}: {}", instance_dir.display(), e));
    }
    
    // Create temp directory for extraction
    let temp_dir = instance_dir.join(format!("temp_extract_{}", chrono::Utc::now().timestamp_millis()));
    
    // Clean up old temp directories
    if let Ok(entries) = fs::read_dir(instance_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.file_name().unwrap_or_default().to_string_lossy().starts_with("temp_extract") {
                let _ = fs::remove_dir_all(&path);
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
        "Leyendo información del modpack Modrinth".to_string(),
        10.0,
        "reading_manifest".to_string()
    );
    
    // Read Modrinth manifest
    let manifest = read_manifest(&temp_dir)?;
    
    // Get Minecraft version from manifest
    let minecraft_version = get_minecraft_version(&manifest)?;
    
    emit_progress(
        format!("Modpack: {} v{} (Minecraft {})", manifest.name, manifest.version_id, minecraft_version),
        15.0,
        "modpack_info".to_string()
    );
    
    // Get override filenames BEFORE downloading files
    let override_filenames = get_override_filenames(&temp_dir);
    
    if !override_filenames.is_empty() {
        println!("📦 [Modrinth] Found {} files in overrides", override_filenames.len());
    }
    
    // Download files from Modrinth CDN
    emit_progress(
        "".to_string(),
        20.0,
        "preparing_downloads".to_string()
    );
    
    let (failed_files, expected_filenames) = download_files_with_failed_tracking(
        &manifest,
        instance_dir,
        emit_progress.clone(),
        20.0,
        90.0,
        &override_filenames,
    ).await?;
    
    // ===== UPDATE FLOW CLEANUP =====
    // Build complete list of expected files from manifest
    let mut all_new_expected: HashSet<String> = HashSet::new();
    
    // Add files from manifest (paths like "mods/sodium.jar")
    for file in &manifest.files {
        all_new_expected.insert(file.path.clone());
    }
    
    // Add files from overrides
    for filename in &override_filenames {
        if filename.ends_with(".jar") {
            all_new_expected.insert(format!("mods/{}", filename));
        } else if filename.ends_with(".zip") {
            all_new_expected.insert(format!("resourcepacks/{}", filename));
        }
    }
    
    // Perform cleanup based on instance type
    if is_legacy_instance {
        emit_progress(
            "progress.cleaningRemovedMods".to_string(),
            91.0,
            "cleaning_removed_mods".to_string()
        );
        
        println!("🔄 [Modrinth] Legacy migration: performing disk-vs-manifest cleanup");
        let removed = cleanup_disk_vs_manifest(instance_dir, &all_new_expected);
        println!("🧹 [Modrinth] Legacy migration: removed {} old files", removed);
        
    } else if let Some(ref old_files) = old_installed_files {
        if !old_files.is_empty() {
            emit_progress(
                "progress.cleaningRemovedMods".to_string(),
                91.0,
                "cleaning_removed_mods".to_string()
            );
            
            println!("🔄 [Modrinth] Update flow: comparing {} old files vs {} new files", old_files.len(), all_new_expected.len());
            let removed = cleanup_old_vs_new(old_files, &all_new_expected, instance_dir);
            println!("🧹 [Modrinth] Update cleanup: removed {} old files", removed);
        }
    }
    
    // Anti-cheat cleanup for managed modpacks
    let is_managed = category
        .map(|c| c == "official" || c == "partner")
        .unwrap_or(false);
    
    let should_cleanup_mods = is_managed && !allow_custom_mods;
    let should_cleanup_resourcepacks = is_managed && !allow_custom_resourcepacks;
    
    if should_cleanup_mods || should_cleanup_resourcepacks {
        println!("🛡️ [Modrinth] Anti-cheat cleanup: mods={}, resourcepacks={}", should_cleanup_mods, should_cleanup_resourcepacks);
        cleanup_removed_files_selective(&expected_filenames, instance_dir, should_cleanup_mods, should_cleanup_resourcepacks)?;
    }
    
    // Process overrides AFTER cleanup
    emit_progress(
        "processing_overrides".to_string(),
        95.0,
        "processing_overrides".to_string()
    );
    
    process_overrides(&temp_dir, instance_dir, emit_progress.clone())?;
    
    // Clean up temp directory
    emit_progress(
        "finalizing".to_string(),
        97.0,
        "finalizing".to_string()
    );
    fs::remove_dir_all(&temp_dir)?;
    
    // Get modloader info
    let (modloader, modloader_version) = get_modloader_info(&manifest)?;
    
    // Modrinth doesn't have recommendedRam in the manifest format
    // We could potentially parse it from pack metadata in the future
    let recommended_ram: Option<u32> = None;
    
    emit_progress(
        "modrinth_completed".to_string(),
        100.0,
        "modrinth_completed".to_string()
    );
    
    Ok((modloader, modloader_version, minecraft_version, recommended_ram, failed_files))
}

/// Clean up files not in the new manifest (for managed modpacks)
fn cleanup_removed_files_selective(
    expected_filenames: &HashSet<String>,
    instance_dir: &PathBuf,
    cleanup_mods: bool,
    cleanup_resourcepacks: bool
) -> Result<()> {
    let mut total_removed = 0;
    
    if cleanup_mods {
        total_removed += cleanup_directory(
            &instance_dir.join("mods"),
            expected_filenames,
            "jar",
            "mod"
        );
    }
    
    if cleanup_resourcepacks {
        total_removed += cleanup_directory(
            &instance_dir.join("resourcepacks"),
            expected_filenames,
            "zip",
            "resourcepack"
        );
    }
    
    if total_removed > 0 {
        println!("🧹 [Modrinth] Cleaned up {} old file(s) total", total_removed);
    }
    
    Ok(())
}

fn cleanup_directory(
    dir: &PathBuf,
    expected_filenames: &HashSet<String>,
    extension: &str,
    file_type: &str
) -> usize {
    if !dir.exists() {
        return 0;
    }
    
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => {
            eprintln!("⚠️ [Modrinth] Failed to read {} directory: {}", file_type, e);
            return 0;
        }
    };
    
    let mut removed_count = 0;
    
    for entry in entries.flatten() {
        let path = entry.path();
        
        if let Some(ext) = path.extension() {
            if ext != extension {
                continue;
            }
        } else {
            continue;
        }
        
        let filename = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        
        if !expected_filenames.contains(&filename) {
            if let Err(e) = fs::remove_file(&path) {
                eprintln!("⚠️ [Modrinth] Failed to remove old {} {}: {}", file_type, filename, e);
            } else {
                println!("🗑️ [Modrinth] Removed old {}: {}", file_type, filename);
                removed_count += 1;
            }
        }
    }
    
    removed_count
}

fn cleanup_disk_vs_manifest(instance_dir: &PathBuf, new_expected_files: &HashSet<String>) -> usize {
    let mut removed = 0;
    
    // Clean mods directory
    let mods_dir = instance_dir.join("mods");
    if mods_dir.exists() {
        if let Ok(entries) = fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        if ext == "jar" {
                            if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                                let relative_path = format!("mods/{}", filename);
                                if !new_expected_files.contains(&relative_path) {
                                    if fs::remove_file(&path).is_ok() {
                                        println!("🗑️ [Modrinth][Legacy] Removed: {}", relative_path);
                                        removed += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Clean resourcepacks directory
    let resourcepacks_dir = instance_dir.join("resourcepacks");
    if resourcepacks_dir.exists() {
        if let Ok(entries) = fs::read_dir(&resourcepacks_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        if ext == "zip" {
                            if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                                let relative_path = format!("resourcepacks/{}", filename);
                                if !new_expected_files.contains(&relative_path) {
                                    if fs::remove_file(&path).is_ok() {
                                        println!("🗑️ [Modrinth][Legacy] Removed: {}", relative_path);
                                        removed += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    removed
}

fn cleanup_old_vs_new(
    old_installed_files: &HashSet<String>,
    new_expected_files: &HashSet<String>,
    instance_dir: &PathBuf
) -> usize {
    let mut removed = 0;
    
    for old_file in old_installed_files {
        if new_expected_files.contains(old_file) {
            continue;
        }
        
        let file_path = instance_dir.join(old_file);
        if file_path.exists() {
            if fs::remove_file(&file_path).is_ok() {
                println!("🗑️ [Modrinth][Update] Removed: {}", old_file);
                removed += 1;
            }
        }
    }
    
    removed
}
