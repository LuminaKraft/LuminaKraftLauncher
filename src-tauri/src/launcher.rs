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
    
    let instance_dir = app_data_dir.join("instances").join(&modpack.id);
    
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
        version: modpack.version.clone(),
        installed_at: chrono::Utc::now().to_rfc3339(),
        modloader: modpack.modloader.clone(),
        modloader_version: modpack.modloader_version.clone(),
        minecraft_version: modpack.minecraft_version.clone(),
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
    
    if modpack.url_modpack_zip.is_empty() {
        return Err(anyhow!("Modpack download URL cannot be empty"));
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
    let app_data_dir = data_dir()
        .ok_or_else(|| anyhow!("Failed to get app data directory"))?
        .join("LKLauncher");

    // Initialize meta and instance directories
    let meta_dirs = MetaDirectories::init().await?;
    let instance_dirs = InstanceDirectories::new(&modpack.id)?;

    emit_progress("Inicializando...".to_string(), 5.0, "initializing".to_string());

    // Check if instance already exists
    let is_update = instance_dirs.instance_dir.exists();
    
    if is_update {
        emit_progress("Verificando actualización...".to_string(), 10.0, "checking".to_string());
        
        if let Ok(Some(existing_metadata)) = filesystem::get_instance_metadata(&modpack.id).await {
            if !minecraft::check_instance_needs_update(&modpack, &existing_metadata).await {
                emit_progress("Instancia actualizada".to_string(), 100.0, "completed".to_string());
                return Ok(Vec::new());
            }
        }
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
    
    let failed_mods = if !modpack.url_modpack_zip.is_empty() {
        // Download and extract modpack
        let temp_zip_path = app_data_dir.join("temp").join(format!("{}.zip", modpack.id));
        std::fs::create_dir_all(temp_zip_path.parent().unwrap())?;
        
        emit_progress("progress.downloadingModpackFiles".to_string(), 75.0, "downloading_modpack".to_string());
        download_file(&modpack.url_modpack_zip, &temp_zip_path).await?;
        
        // Check if it's a CurseForge modpack
        let is_curseforge_modpack = match lyceris::util::extract::read_file_from_jar(&temp_zip_path, "manifest.json") {
            Ok(_) => true,
            Err(_) => false,
        };
        
        if is_curseforge_modpack {
            emit_progress("progress.processingCurseforge".to_string(), 70.0, "processing_curseforge".to_string());
            
            // Prepare auth token for CurseForge API calls
            let auth_token = if let Some(microsoft_account) = &settings.microsoft_account {
                Some(format!("Bearer {}", microsoft_account.access_token))
            } else {
                settings.client_token.clone()
            };
            
            let (_cf_modloader, _cf_version, failed_mods) = curseforge::process_curseforge_modpack_with_failed_tracking(
                &temp_zip_path, 
                &instance_dirs.instance_dir,
                {
                    let emit_progress = emit_progress.clone();
                    move |message: String, percentage: f32, step: String| {
                        let final_percentage = 70.0 + (percentage * 0.30); // 30% del total para CurseForge (70% to 100%)
                        emit_progress(message, final_percentage, step);
                    }
                },
                auth_token.as_deref()
            ).await?;
    
            // Clean up temp file
            cleanup_temp_file(&temp_zip_path);
            failed_mods
        } else {
            // Regular ZIP modpack
            emit_progress("Extrayendo modpack...".to_string(), 85.0, "extracting_modpack".to_string());
            extract_zip(&temp_zip_path, &instance_dirs.instance_dir)?;
            cleanup_temp_file(&temp_zip_path);
            Vec::new()
        }
    } else {
        Vec::new()
    };

    // Finalization steps after modpack processing
    emit_progress("Guardando configuración de la instancia...".to_string(), 96.0, "saving_instance_config".to_string());

    // Save instance metadata
    let metadata = InstanceMetadata {
        id: modpack.id.clone(),
        version: modpack.version.clone(),
        installed_at: chrono::Utc::now().to_rfc3339(),
        modloader: modpack.modloader.clone(),
        modloader_version: modpack.modloader_version.clone(),
        minecraft_version: modpack.minecraft_version.clone(),
    };
    
    filesystem::save_instance_metadata(&metadata).await?;
    
    emit_progress("Finalizando instalación...".to_string(), 98.0, "finalizing_installation".to_string());
    
    emit_progress("Instalación completada".to_string(), 100.0, "completed".to_string());
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
    let (cache_size, icons_cache_size, screenshots_cache_size) = meta_dirs.get_cache_size_breakdown().await?;
    let minecraft_versions_count = meta_dirs.get_minecraft_versions_count().await?;
    let java_installations_count = meta_dirs.get_java_installations_count().await?;
    
    Ok(serde_json::json!({
        "total_size": total_size,
        "total_size_formatted": format_bytes(total_size),
        "cache_size": cache_size,
        "cache_size_formatted": format_bytes(cache_size),
        "icons_size": icons_cache_size,
        "icons_size_formatted": format_bytes(icons_cache_size),
        "screenshots_size": screenshots_cache_size,
        "screenshots_size_formatted": format_bytes(screenshots_cache_size),
        "meta_path": meta_dirs.meta_dir.display().to_string(),
        "minecraft_versions_count": minecraft_versions_count,
        "java_installations_count": java_installations_count
    }))
}

/// Clean up meta storage by removing unused resources
pub async fn cleanup_meta_storage() -> Result<Vec<String>> {
    let meta_dirs = MetaDirectories::init().await?;
    
    let mut cleaned_items = Vec::new();
    
    // Clean up unused libraries, assets, versions, etc.
    // This would require analyzing what's currently in use by active instances
    
    // For now, just clean up cache
    if let Ok(_) = meta_dirs.clear_all_cache().await {
        cleaned_items.push("Cache cleared".to_string());
    }
    
    Ok(cleaned_items)
}

/// Cache modpack images automatically when loading from API
pub async fn cache_modpack_images(modpacks: Vec<serde_json::Value>) -> Result<()> {
    let meta_dirs = MetaDirectories::init().await?;
    
    for modpack in modpacks {
        let modpack_id = modpack.get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        
        // Cache icon if available
        if let Some(icon_url) = modpack.get("icon").and_then(|v| v.as_str()) {
            if !icon_url.is_empty() {
                match meta_dirs.cache_image(icon_url, "icon", modpack_id).await {
                    Ok(_) => {},
                    Err(e) => eprintln!("Failed to cache icon for {}: {}", modpack_id, e),
                }
            }
        }
        
        // Cache screenshots if available
        if let Some(screenshots) = modpack.get("screenshots").and_then(|v| v.as_array()) {
            for (i, screenshot) in screenshots.iter().enumerate() {
                if let Some(screenshot_url) = screenshot.as_str() {
                    if !screenshot_url.is_empty() {
                        let screenshot_id = format!("{}_screenshot_{}", modpack_id, i);
                        match meta_dirs.cache_image(screenshot_url, "screenshot", &screenshot_id).await {
                            Ok(_) => {},
                            Err(e) => eprintln!("Failed to cache screenshot {} for {}: {}", i, modpack_id, e),
                        }
                    }
                }
            }
        }
        
        // Cache gallery images if available
        if let Some(gallery) = modpack.get("gallery").and_then(|v| v.as_array()) {
            for (i, gallery_item) in gallery.iter().enumerate() {
                if let Some(gallery_url) = gallery_item.get("url").and_then(|v| v.as_str()) {
                    if !gallery_url.is_empty() {
                        let gallery_id = format!("{}_gallery_{}", modpack_id, i);
                        match meta_dirs.cache_image(gallery_url, "screenshot", &gallery_id).await {
                            Ok(_) => {},
                            Err(e) => eprintln!("Failed to cache gallery image {} for {}: {}", i, modpack_id, e),
                        }
                    }
                }
            }
        }
    }
    
    Ok(())
}

/// Clear only modpack icons cache
pub async fn clear_icons_cache() -> Result<Vec<String>> {
    let meta_dirs = MetaDirectories::init().await?;
    
    match meta_dirs.clear_icons_cache().await {
        Ok(_) => Ok(vec!["Icons cache cleared".to_string()]),
        Err(e) => Err(anyhow::anyhow!("Failed to clear icons cache: {}", e)),
    }
}

/// Clear only modpack screenshots cache
pub async fn clear_screenshots_cache() -> Result<Vec<String>> {
    let meta_dirs = MetaDirectories::init().await?;
    
    match meta_dirs.clear_screenshots_cache().await {
        Ok(_) => Ok(vec!["Screenshots cache cleared".to_string()]),
        Err(e) => Err(anyhow::anyhow!("Failed to clear screenshots cache: {}", e)),
    }
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