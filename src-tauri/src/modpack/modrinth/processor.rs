use anyhow::{Result, anyhow};
use std::path::PathBuf;
use std::fs;
use std::collections::HashSet;
use super::manifest::{read_manifest, get_modloader_info, process_overrides, get_override_relative_paths, get_minecraft_version};
use super::downloader::download_files_with_failed_tracking;
use crate::modpack::extraction::extract_zip;

/// Process a Modrinth modpack (.mrpack) with progress tracking and failed file detection
/// 
/// category: "official" | "partner" | "community" | None (imported)
/// allow_custom_mods: Whether to preserve user-added mods (default true)
/// allow_custom_resourcepacks: Whether to preserve user-added resourcepacks (default true)
/// allow_custom_configs: Whether to preserve user-added configs (default true)
/// old_installed_files: Files from previous version's integrity.file_hashes (for update comparison)
/// is_legacy_instance: If true, perform aggressive disk cleanup
pub async fn process_modrinth_modpack_with_failed_tracking<F>(
    modpack_zip_path: &PathBuf,
    instance_dir: &PathBuf,
    emit_progress: F,
    category: Option<&str>,
    allow_custom_mods: bool,
    allow_custom_resourcepacks: bool,
    allow_custom_configs: bool,
    old_installed_files: Option<HashSet<String>>,
    is_legacy_instance: bool,
    max_concurrent_downloads: Option<usize>,
) -> Result<(String, String, String, Option<u32>, Vec<serde_json::Value>, HashSet<String>)>
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
    
    // Get override relative paths BEFORE downloading files
    let override_paths = get_override_relative_paths(&temp_dir);
    
    if !override_paths.is_empty() {
        println!("📦 [Modrinth] Found {} files in overrides", override_paths.len());
    }
    
    // Download files from Modrinth CDN
    emit_progress(
        "".to_string(),
        20.0,
        "preparing_downloads".to_string()
    );
    
    let (failed_files, _expected_filenames) = download_files_with_failed_tracking(
        &manifest,
        instance_dir,
        emit_progress.clone(),
        20.0,
        90.0,
        &override_paths,
        max_concurrent_downloads,
    ).await?;
    
    // ===== UPDATE FLOW CLEANUP =====
    // Build complete list of expected files from manifest
    let mut all_new_expected: HashSet<String> = HashSet::new();
    
    // Add files from manifest (paths like "mods/sodium.jar")
    for file in &manifest.files {
        all_new_expected.insert(file.path.clone());
    }
    
    // Add files from overrides
    for path in &override_paths {
        all_new_expected.insert(path.clone());
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
    
    let should_cleanup_configs = is_managed && !allow_custom_configs;
    let should_cleanup_mods = is_managed && !allow_custom_mods;
    let should_cleanup_resourcepacks = is_managed && !allow_custom_resourcepacks;
    
    if should_cleanup_mods || should_cleanup_resourcepacks || should_cleanup_configs {
        println!("🛡️ [Modrinth] Anti-cheat cleanup: mods={}, resourcepacks={}, configs={}", should_cleanup_mods, should_cleanup_resourcepacks, should_cleanup_configs);
        cleanup_unauthorized_files(instance_dir, &all_new_expected, should_cleanup_mods, should_cleanup_resourcepacks, should_cleanup_configs)?;
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
    
    Ok((modloader, modloader_version, minecraft_version, recommended_ram, failed_files, all_new_expected))
}

/// Clean up files not in the new manifest (for managed modpacks)
fn cleanup_unauthorized_files(
    instance_dir: &PathBuf,
    expected_files: &HashSet<String>,
    cleanup_mods: bool,
    cleanup_resourcepacks: bool,
    cleanup_configs: bool,
) -> Result<()> {
    let mut total_removed = 0;
    
    if cleanup_mods {
        total_removed += cleanup_directory_by_path(instance_dir, "mods", expected_files, "jar", false);
    }
    
    if cleanup_resourcepacks {
        total_removed += cleanup_directory_by_path(instance_dir, "resourcepacks", expected_files, "zip", false);
    }

    if cleanup_configs {
        total_removed += cleanup_directory_by_path(instance_dir, "config", expected_files, "*", true);
        total_removed += cleanup_directory_by_path(instance_dir, "scripts", expected_files, "*", true);
    }
    
    if total_removed > 0 {
        println!("🧹 [Modrinth] Anti-cheat cleaned up {} unauthorized file(s) total", total_removed);
    }
    
    Ok(())
}

fn cleanup_directory_by_path(
    instance_dir: &PathBuf,
    dir_name: &str,
    expected_files: &HashSet<String>,
    ext_filter: &str,
    recursive: bool,
) -> usize {
    let root_path = instance_dir.join(dir_name);
    if !root_path.exists() {
        return 0;
    }

    fn walk_cleanup(
        current_path: PathBuf, 
        base_dir: &PathBuf, 
        prefix: &str,
        expected_files: &HashSet<String>,
        ext_filter: &str,
        recursive: bool,
    ) -> usize {
        let mut removed = 0;
        if let Ok(entries) = fs::read_dir(current_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() && recursive {
                    removed += walk_cleanup(path, base_dir, prefix, expected_files, ext_filter, recursive);
                } else if path.is_file() {
                    // Check extension if filter is not "*"
                    if ext_filter != "*" {
                        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                            if ext != ext_filter {
                                continue;
                            }
                        } else {
                            continue;
                        }
                    }

                    if let Ok(relative) = path.strip_prefix(base_dir) {
                        let rel_path = format!("{}/{}", prefix, relative.to_string_lossy());
                        if !expected_files.contains(&rel_path) {
                            if fs::remove_file(&path).is_ok() {
                                println!("🗑️ [Modrinth] Removed unauthorized file: {}", rel_path);
                                removed += 1;
                            }
                        }
                    }
                }
            }
        }
        removed
    }

    walk_cleanup(root_path.clone(), instance_dir, dir_name, expected_files, ext_filter, recursive)
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
