use crate::{Modpack, InstanceMetadata, UserSettings, filesystem, minecraft, meta::{MetaDirectories, InstanceDirectories}};
use crate::modpack::{extract_zip, curseforge};
use crate::utils::{cleanup_temp_file, download_file};
use anyhow::{Result, anyhow};
use dirs::data_dir;

use serde_json;

/// Install a modpack to the instances directory
pub async fn install_modpack(modpack: Modpack) -> Result<()> {
    let app_data_dir = data_dir()
        .ok_or_else(|| anyhow!("Failed to get app data directory"))?
        .join("LKLauncher");

    // Generate a unique, human-readable folder name based on the modpack name
    let folder_name = filesystem::generate_instance_folder_name(&modpack.name)?;
    let instance_dir = app_data_dir.join("instances").join(&folder_name);
    
    // Create instance directory
    if instance_dir.exists() {
        std::fs::remove_dir_all(&instance_dir)?;
    }
    std::fs::create_dir_all(&instance_dir)?;
    
    // Download modpack
    let temp_zip_path = app_data_dir.join("temp").join(format!("{}.zip", modpack.id));
    std::fs::create_dir_all(temp_zip_path.parent().unwrap())?;
    
    println!("Downloading instance files from: {}", modpack.url_modpack_zip);
    download_file(&modpack.url_modpack_zip, &temp_zip_path).await?;
    
    // Extract modpack
    println!("Extracting instance to: {}", instance_dir.display());
    extract_zip(&temp_zip_path, &instance_dir)?;
    
    // Clean up temporary file
    if temp_zip_path.exists() {
        std::fs::remove_file(&temp_zip_path)?;
    }
    
    // Create instance metadata
    let metadata = InstanceMetadata {
        id: modpack.id.clone(),
        name: modpack.name.clone(),
        version: modpack.version.clone(),
        installed_at: chrono::Utc::now().to_rfc3339(),
        modloader: modpack.modloader.clone(),
        modloader_version: modpack.modloader_version.clone(),
        minecraft_version: modpack.minecraft_version.clone(),
        recommended_ram: None,
        ram_allocation: Some("global".to_string()), // Use global RAM by default
        custom_ram: None,
        integrity: None, // No integrity tracking for this simple path
        category: None,  // No category for basic installs
        allow_custom_mods: true,  // Allow custom mods by default for basic installs
        allow_custom_resourcepacks: true,  // Allow custom resourcepacks by default for basic installs
    };
    
    filesystem::save_instance_metadata(&metadata).await?;
    
    println!("Instance installation completed successfully!");
    Ok(())
}

/// Validate modpack configuration before installation
pub fn validate_modpack(modpack: &Modpack) -> Result<()> {
    // Check if mod loader is supported
    if !modpack.modloader.is_empty() && !minecraft::is_loader_supported(&modpack.modloader) {
        return Err(anyhow!("Unsupported mod loader: {}", modpack.modloader));
    }
    
    // Check if Minecraft version is supported for the mod loader
    if !modpack.modloader.is_empty() {
        if !minecraft::is_version_supported(&modpack.minecraft_version, &modpack.modloader) {
            return Err(anyhow!(
                "Minecraft version {} is not supported for {} (minimum version: {})",
                modpack.minecraft_version,
                modpack.modloader,
                minecraft::get_min_forge_version()
            ));
        }
    }
    
    // Validate that required fields are not empty
    if modpack.id.is_empty() {
        return Err(anyhow!("Modpack ID cannot be empty"));
    }

    if modpack.minecraft_version.is_empty() {
        return Err(anyhow!("Minecraft version cannot be empty"));
    }

    Ok(())
}

/// Install a modpack (always uses meta storage like Modrinth)
pub async fn install_modpack_with_shared_storage<F>(
    modpack: Modpack,
    settings: UserSettings,
    emit_progress: F
) -> Result<Vec<serde_json::Value>>
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    // Validate URL is present for installation
    if modpack.url_modpack_zip.is_empty() {
        return Err(anyhow!("Modpack download URL cannot be empty for installation"));
    }

    let app_data_dir = data_dir()
        .ok_or_else(|| anyhow!("Failed to get app data directory"))?
        .join("LKLauncher");

    // Initialize meta and instance directories
    let meta_dirs = MetaDirectories::init().await?;
    let instance_dirs = InstanceDirectories::new(&modpack.id)?;

    emit_progress("progress.initializing".to_string(), 5.0, "initializing".to_string());

    // Check if instance already exists
    let is_update = instance_dirs.instance_dir.exists();

    if is_update {
        emit_progress("progress.checking".to_string(), 10.0, "checking".to_string());
        // Note: Old mods/resourcepacks that are no longer in the manifest will be cleaned up
        // after processing the new manifest (see cleanup_removed_mods below)
    } else {
        // Create instance directories
        instance_dirs.ensure_directories().await?;
    }

    emit_progress("progress.installingMinecraft".to_string(), 15.0, "installing_minecraft".to_string());

    // Install Minecraft to meta storage if not already installed
    if !meta_dirs.is_version_installed(&modpack.minecraft_version).await {
        emit_progress("progress.downloadingMinecraft".to_string(), 20.0, "downloading_minecraft".to_string());
        
        minecraft::install_minecraft_with_lyceris_progress(&modpack, &settings, meta_dirs.meta_dir.clone(), {
            let emit_progress = emit_progress.clone();
            move |message: String, percentage: f32, step: String| {
                let final_percentage = 20.0 + (percentage * 0.4); // 40% del total para Minecraft
                emit_progress(message, final_percentage, step);
            }
        }).await?;

        // Mark version as installed
        meta_dirs.mark_libraries_installed(&modpack.minecraft_version).await?;
    } else {
        emit_progress("Minecraft ya instalado".to_string(), 60.0, "minecraft_already_installed".to_string());
    }

    // Previously we created symlinks/junctions from the instance to the shared meta storage.
    // That logic has been removed: Lyceris is now configured to read libraries/assets directly
    // from the meta directory, so no additional linking or copying is necessary here.

    // Install modpack files
    emit_progress("progress.installingModpackFiles".to_string(), 70.0, "installing_modpack_files".to_string());
    
    // Variable to store recommended RAM from manifest
    // Variable to store recommended RAM from manifest
    let mut recommended_ram_from_manifest: Option<u32> = None;
    
    // Process modpack (download, extract, install) and get failed mods + zip hash
    let (failed_mods, zip_hash) = if !modpack.url_modpack_zip.is_empty() {
        // Download and extract modpack
        let temp_zip_path = app_data_dir.join("temp").join(format!("{}.zip", modpack.id));
        std::fs::create_dir_all(temp_zip_path.parent().unwrap())?;

        // Check if it's a local file path or remote URL
        let is_local_file = !modpack.url_modpack_zip.starts_with("http://") &&
                           !modpack.url_modpack_zip.starts_with("https://");

        if is_local_file {
            // It's a local file, just copy it
            emit_progress("progress.copyingModpack".to_string(), 75.0, "copying_modpack".to_string());
            std::fs::copy(&modpack.url_modpack_zip, &temp_zip_path)?;
        } else {
            // It's a remote URL, download it
            emit_progress("progress.downloadingModpackFiles".to_string(), 75.0, "downloading_modpack".to_string());
            download_file(&modpack.url_modpack_zip, &temp_zip_path).await?;
        }

        // Verify ZIP SHA256 if expected hash is provided (for all modpacks)
        if let Some(expected_sha256) = &modpack.file_sha256 {
            emit_progress("progress.verifyingDownload".to_string(), 78.0, "verifying_download".to_string());
            
            match crate::modpack::integrity::hash_file(&temp_zip_path) {
                Ok(actual_sha256) => {
                    if actual_sha256 != *expected_sha256 {
                        // Clean up the corrupted file
                        let _ = std::fs::remove_file(&temp_zip_path);
                        return Err(anyhow!(
                            "Descarga corrupta: el hash SHA256 no coincide.\nEsperado: {}...\nRecibido: {}...\n\nPor favor, vuelve a intentar la descarga.",
                            &expected_sha256[..16.min(expected_sha256.len())],
                            &actual_sha256[..16.min(actual_sha256.len())]
                        ));
                    }
                    println!("✅ ZIP SHA256 verified: {}...", &actual_sha256[..16.min(actual_sha256.len())]);
                }
                Err(e) => {
                    eprintln!("⚠️ Could not verify ZIP SHA256: {}", e);
                    // Continue anyway - don't block installation for verification failures
                }
            }
        }
        
        // Calculate ZIP hash for integrity data (if official/partner)
        let calculated_zip_hash = if modpack.category.as_ref().map(|c| c == "official" || c == "partner").unwrap_or(false) {
             match crate::modpack::integrity::hash_file(&temp_zip_path) {
                Ok(hash) => {
                    println!("🔐 Calculated ZIP hash: {}...", &hash[0..8.min(hash.len())]);
                    Some(hash)
                },
                Err(e) => {
                    eprintln!("⚠️ Warning: Failed to calculate ZIP hash: {}", e);
                    None
                }
            }
        } else {
            None
        };

        // Check if it's a CurseForge modpack
        let is_curseforge_modpack = match lyceris::util::extract::read_file_from_jar(&temp_zip_path, "manifest.json") {
            Ok(_) => true,
            Err(_) => false,
        };

        let result_failed_mods = if is_curseforge_modpack {
            emit_progress("progress.processingCurseforge".to_string(), 70.0, "processing_curseforge".to_string());
            
            let anon_key = settings.supabase_anon_key.as_deref().unwrap_or("").trim_matches('"');
            let auth_token = if let Some(supabase_token) = &settings.supabase_access_token {
                Some(format!("Bearer {}", supabase_token))
            } else {
                Some(format!("Bearer {}", anon_key))
            };

            let (_cf_modloader, _cf_version, recommended_ram, failed_mods) = curseforge::process_curseforge_modpack_with_failed_tracking(
                &temp_zip_path,
                &instance_dirs.instance_dir,
                {
                    let emit_progress = emit_progress.clone();
                    move |message: String, percentage: f32, step: String| {
                        let final_percentage = 70.0 + (percentage * 0.30);
                        emit_progress(message, final_percentage, step);
                    }
                },
                auth_token.as_deref(),
                anon_key,
                modpack.category.as_deref(),
                modpack.allow_custom_mods,
                modpack.allow_custom_resourcepacks,
            ).await?;

            recommended_ram_from_manifest = recommended_ram;
            failed_mods
        } else {
            // Regular ZIP modpack
            emit_progress("progress.extractingModpack".to_string(), 85.0, "extracting_modpack".to_string());
            extract_zip(&temp_zip_path, &instance_dirs.instance_dir)?;
            Vec::new()
        };
        
        // Cleanup strictly AFTER processing and hashing
        cleanup_temp_file(&temp_zip_path);
        
        (result_failed_mods, calculated_zip_hash)
    } else {
        (Vec::new(), None)
    };

    // Finalization steps after modpack processing
    emit_progress("progress.savingInstanceConfig".to_string(), 96.0, "saving_instance_config".to_string());

    // Calculate integrity data (using the zip hash we calculated earlier)
    let integrity_data = if modpack.category.as_ref()
        .map(|c| c == "official" || c == "partner")
        .unwrap_or(false)
    {
        emit_progress("progress.calculatingIntegrity".to_string(), 97.0, "calculating_integrity".to_string());
        match crate::modpack::integrity::create_integrity_data(&instance_dirs.instance_dir, zip_hash) {
            Ok(data) => {
                println!("🔐 Integrity data calculated: {} files tracked", data.file_hashes.len());
                Some(data)
            }
            Err(e) => {
                eprintln!("⚠️ Warning: Failed to calculate integrity data: {}", e);
                None
            }
        }
    } else {
        None
    };

    // Save instance metadata
    let metadata = InstanceMetadata {
        id: modpack.id.clone(),
        name: modpack.name.clone(),
        version: modpack.version.clone(),
        installed_at: chrono::Utc::now().to_rfc3339(),
        modloader: modpack.modloader.clone(),
        modloader_version: modpack.modloader_version.clone(),
        minecraft_version: modpack.minecraft_version.clone(),
        recommended_ram: recommended_ram_from_manifest,
        ram_allocation: Some("recommended".to_string()), // Default to recommended RAM
        custom_ram: None,
        integrity: integrity_data,
        category: modpack.category.clone(),
        allow_custom_mods: modpack.allow_custom_mods,
        allow_custom_resourcepacks: modpack.allow_custom_resourcepacks,
    };
    
    filesystem::save_instance_metadata(&metadata).await?;

    // Save rich modpack metadata for UI display (non-fatal if fails)
    if let Err(e) = filesystem::save_modpack_metadata(&modpack).await {
        eprintln!("⚠️  Warning: Failed to save modpack metadata cache: {}", e);
    }

    emit_progress("progress.finalizingInstallation".to_string(), 98.0, "finalizing_installation".to_string());

    emit_progress("progress.installationCompleted".to_string(), 100.0, "completed".to_string());
    println!("✅ Instance installation completed successfully!");
    
    Ok(failed_mods)
}



/// Launch a modpack (always uses meta storage like Modrinth) with token refresh support
pub async fn launch_modpack_with_shared_storage_and_token_refresh(
    modpack: Modpack,
    settings: UserSettings,
    app: tauri::AppHandle,
) -> Result<()> {
    minecraft::launch_minecraft_with_token_refresh(modpack, settings, app).await
}

/// Get meta storage information for the UI
pub async fn get_meta_storage_info() -> Result<serde_json::Value> {
    let meta_dirs = MetaDirectories::init().await?;
    
    let total_size = meta_dirs.get_meta_size().await?;
    let minecraft_versions_count = meta_dirs.get_minecraft_versions_count().await?;
    let java_installations_count = meta_dirs.get_java_installations_count().await?;
    
    Ok(serde_json::json!({
        "total_size": total_size,
        "total_size_formatted": format_bytes(total_size),
        "meta_path": meta_dirs.meta_dir.display().to_string(),
        "minecraft_versions_count": minecraft_versions_count,
        "java_installations_count": java_installations_count
    }))
}

/// Clean up meta storage by removing unused resources
pub async fn cleanup_meta_storage() -> Result<Vec<String>> {
    // This would require analyzing what's currently in use by active instances
    // For now, just return an empty list (no cache to clear)
    Ok(Vec::new())
}

/// Return list of Minecraft versions stored in meta
pub async fn list_minecraft_versions() -> Result<Vec<String>> {
    let meta_dirs = MetaDirectories::init().await?;
    meta_dirs.get_minecraft_versions_list().await
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;
    
    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }
    
    if unit_index == 0 {
        format!("{} {}", bytes, UNITS[unit_index])
    } else {
        format!("{:.1} {}", size, UNITS[unit_index])
    }
} 