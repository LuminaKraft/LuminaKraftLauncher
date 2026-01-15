use anyhow::{Result, anyhow};
use std::path::PathBuf;
use std::fs;
use std::collections::HashSet;
use super::manifest::{read_manifest, get_modloader_info, process_overrides, get_override_relative_paths};
use super::downloader::download_mods_with_filenames;
use crate::modpack::extraction::extract_zip;

/// Process a CurseForge modpack with progress tracking and failed mod detection
/// category: "official" | "partner" | "community" | None (imported)
/// allow_custom_mods: Whether to preserve user-added mods (default true)
/// allow_custom_resourcepacks: Whether to preserve user-added resourcepacks (default true)
/// old_installed_files: Files from previous version's integrity.file_hashes (for update comparison)
/// is_legacy_instance: If true, this is a migration from old launcher - do aggressive disk cleanup
pub async fn process_curseforge_modpack_with_failed_tracking<F>(
    modpack_zip_path: &PathBuf,
    instance_dir: &PathBuf,
    emit_progress: F,
    auth_token: Option<&str>,
    anon_key: &str,
    category: Option<&str>,
    allow_custom_mods: bool,
    allow_custom_resourcepacks: bool,
    old_installed_files: Option<HashSet<String>>,
    is_legacy_instance: bool,
    max_concurrent_downloads: Option<usize>,
) -> Result<(String, String, Option<u32>, Vec<serde_json::Value>, HashSet<String>)>
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
    
    // Get override filenames BEFORE downloading mods
    let override_paths = get_override_relative_paths(&manifest, &temp_dir);
    
    if !override_paths.is_empty() {
        println!("📦 Found {} files in overrides that will be available during download check", override_paths.len());
    }
    
    // Download mods - this also returns the expected filenames for cleanup
    emit_progress(
        "".to_string(),
        20.0,
        "preparing_mod_downloads".to_string()
    );
    
    let (failed_mods, expected_filenames) = download_mods_with_filenames(&manifest, instance_dir, emit_progress.clone(), 20.0, 90.0, auth_token, anon_key, &override_paths, max_concurrent_downloads).await?;
    
    // ===== UPDATE FLOW CLEANUP =====
    // This section ensures that mods/resourcepacks removed in new versions are deleted.
    //
    // Two modes:
    // 1. Legacy migration (is_legacy_instance=true): Compare DISK vs NEW MANIFEST
    //    - Deletes ALL files not in new manifest (including orphans from old updates)
    //    - May delete user-added mods, but this is a one-time migration
    // 2. Normal update (is_legacy_instance=false): Compare OLD INTEGRITY vs NEW MANIFEST
    //    - Only deletes files we previously installed that are no longer needed
    //    - User-added files are preserved (they're not in old_installed_files)
    
    // Build complete list of expected files (manifest + overrides)
    let mut all_new_expected: HashSet<String> = HashSet::new();
    
    // Add mods from expected_filenames (from CurseForge API)
    for filename in &expected_filenames {
        all_new_expected.insert(format!("mods/{}", filename));
    }
    
    // Add files from overrides
    for path in &override_paths {
        all_new_expected.insert(path.clone());
    }
    
    // Perform cleanup based on instance type
    if is_legacy_instance {
        // Legacy migration: aggressive cleanup - compare disk vs manifest
        emit_progress(
            "progress.cleaningRemovedMods".to_string(),
            91.0,
            "cleaning_removed_mods".to_string()
        );
        
        println!("🔄 Legacy instance migration: performing disk-vs-manifest cleanup");
        let removed = cleanup_disk_vs_manifest(instance_dir, &all_new_expected);
        println!("🧹 Legacy migration: removed {} old files", removed);
        
    } else if let Some(ref old_files) = old_installed_files {
        // Normal update: compare old integrity files vs new manifest
        if !old_files.is_empty() {
            emit_progress(
                "progress.cleaningRemovedMods".to_string(),
                91.0,
                "cleaning_removed_mods".to_string()
            );
            
            println!("🔄 Update flow: comparing {} old files vs {} new files", old_files.len(), all_new_expected.len());
            let removed = cleanup_old_vs_new(old_files, &all_new_expected, instance_dir);
            println!("🧹 Update cleanup: removed {} old files", removed);
        }
    }
    
    // Legacy cleanup for anti-cheat (when custom mods NOT allowed)
    // This is separate from update flow - it removes ALL unauthorized files
    let is_managed = category
        .map(|c| c == "official" || c == "partner")
        .unwrap_or(false);
    
    let should_cleanup_mods = is_managed && !allow_custom_mods;
    let should_cleanup_resourcepacks = is_managed && !allow_custom_resourcepacks;
    
    if should_cleanup_mods || should_cleanup_resourcepacks {
        println!("🛡️ Anti-cheat cleanup: mods={}, resourcepacks={}", should_cleanup_mods, should_cleanup_resourcepacks);
        cleanup_unauthorized_files(instance_dir, &all_new_expected, should_cleanup_mods, should_cleanup_resourcepacks)?;
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

    Ok((modloader, modloader_version, recommended_ram, failed_mods, all_new_expected))
}

/// Clean up files not in the new manifest (for managed modpacks)
fn cleanup_unauthorized_files(
    instance_dir: &PathBuf,
    expected_files: &HashSet<String>,
    cleanup_mods: bool,
    cleanup_resourcepacks: bool,
) -> Result<()> {
    let mut total_removed = 0;
    
    if cleanup_mods {
        total_removed += cleanup_directory_by_path(instance_dir, "mods", expected_files, "jar", false);
    }
    
    if cleanup_resourcepacks {
        total_removed += cleanup_directory_by_path(instance_dir, "resourcepacks", expected_files, "zip", false);
    }
    
    if total_removed > 0 {
        println!("🧹 Anti-cheat cleaned up {} unauthorized file(s) total", total_removed);
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
                                println!("🗑️ Removed unauthorized file: {}", rel_path);
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



/// Legacy migration cleanup: Remove ALL files from disk that are NOT in the new manifest
/// This is aggressive - it will remove user-added mods too, but is only used once for migration
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
                                    if let Ok(_) = fs::remove_file(&path) {
                                        println!("🗑️ [Legacy] Removed: {}", relative_path);
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
                                    if let Ok(_) = fs::remove_file(&path) {
                                        println!("🗑️ [Legacy] Removed: {}", relative_path);
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

/// Normal update cleanup: Remove files that were in the OLD manifest but are NOT in the NEW manifest
/// This preserves user-added files because they were never in old_installed_files
fn cleanup_old_vs_new(
    old_installed_files: &HashSet<String>,
    new_expected_files: &HashSet<String>,
    instance_dir: &PathBuf
) -> usize {
    let mut removed = 0;
    
    for old_file in old_installed_files {
        // Skip if file is in new manifest (still needed)
        if new_expected_files.contains(old_file) {
            continue;
        }
        
        // File was in old manifest but not in new - delete it
        let file_path = instance_dir.join(old_file);
        if file_path.exists() {
            if let Ok(_) = fs::remove_file(&file_path) {
                println!("🗑️ [Update] Removed: {}", old_file);
                removed += 1;
            }
        }
    }
    
    removed
}