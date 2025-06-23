use crate::{Modpack, InstanceMetadata, UserSettings, downloader, filesystem, minecraft, curseforge};
use anyhow::{Result, anyhow};
use std::path::PathBuf;
use dirs::data_dir;
use std::fs;
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
    
    println!("Downloading modpack from: {}", modpack.url_modpack_zip);
    downloader::download_file(&modpack.url_modpack_zip, &temp_zip_path).await?;
    
    // Extract modpack
    println!("Extracting modpack to: {}", instance_dir.display());
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
    
    println!("Modpack installation completed successfully!");
    Ok(())
}

/// Install a modpack with full Minecraft setup using Lyceris with progress callbacks and failed mods tracking
pub async fn install_modpack_with_minecraft_and_failed_tracking<F>(
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
    
    let instance_dir = app_data_dir.join("instances").join(&modpack.id);
    
    // Check if instance already exists (update vs new installation)
    let is_update = instance_dir.exists();
    
    if is_update {
        emit_progress("Verificando si se necesita actualización...".to_string(), 5.0, "checking".to_string());
        
        // Para actualizaciones, verificar si realmente necesita actualización
        if let Ok(Some(existing_metadata)) = filesystem::get_instance_metadata(&modpack.id).await {
            if !minecraft::check_instance_needs_update(&modpack, &existing_metadata).await {
                emit_progress("La instancia ya está actualizada".to_string(), 100.0, "completed".to_string());
                println!("Instance is up to date, skipping installation");
                return Ok(Vec::new()); // No failed mods for up-to-date instances
            }
            println!("🔄 Actualizando modpack existente...");
            // Solo actualizar el modpack, no eliminar todo
            return update_modpack_only_with_failed_tracking(modpack, instance_dir, emit_progress).await;
        }
    }
    
    emit_progress("Iniciando instalación completa...".to_string(), 5.0, "initializing".to_string());
    
    // Nueva instalación - eliminar directorio si existe
    if instance_dir.exists() {
        std::fs::remove_dir_all(&instance_dir)?;
    }
    std::fs::create_dir_all(&instance_dir)?;
    
    println!("🚀 Instalación inicial completa del modpack...");
    
    // Phase 1: Install Minecraft and mod loader using Lyceris (70% of total progress)
    emit_progress("Instalando Minecraft y modloader...".to_string(), 10.0, "installing_minecraft".to_string());
    println!("⚙️ Phase 1/2: Installing Minecraft and mod loader...");
    
    // Para instalaciones iniciales necesitamos obtener la información del modloader del modpack
    let mut modloader = modpack.modloader.clone();
    let mut modloader_version = modpack.modloader_version.clone();
    
    // Si es un modpack de CurseForge, necesitamos procesar primero para obtener la info correcta
    if !modpack.url_modpack_zip.is_empty() {
        emit_progress("Preparando instalación...".to_string(), 15.0, "preparing_installation".to_string());
        
        // Download modpack temporarily to check type
        let temp_zip_path = app_data_dir.join("temp").join(format!("{}_check.zip", modpack.id));
        std::fs::create_dir_all(temp_zip_path.parent().unwrap())?;
        
        downloader::download_file(&modpack.url_modpack_zip, &temp_zip_path).await?;
        
        // Check if it's CurseForge
        let is_curseforge_modpack = {
            let file = fs::File::open(&temp_zip_path)?;
            let mut archive = zip::ZipArchive::new(file)?;
            
            let mut found_manifest = false;
            for i in 0..archive.len() {
                let file = archive.by_index(i)?;
                if file.name() == "manifest.json" {
                    found_manifest = true;
                    break;
                }
            }
            found_manifest
        };
        
        if is_curseforge_modpack {
            emit_progress("Verificando configuración del modpack...".to_string(), 20.0, "verifying_modpack_config".to_string());
            
            // Extract just the manifest to get loader info
            let temp_extract_dir = app_data_dir.join("temp").join(format!("check_{}", modpack.id));
            if temp_extract_dir.exists() {
                fs::remove_dir_all(&temp_extract_dir)?;
            }
            fs::create_dir_all(&temp_extract_dir)?;
            
            // Read manifest.json to get correct modloader info
            if let Ok((cf_modloader, cf_version)) = get_curseforge_modloader_info(&temp_zip_path).await {
                modloader = cf_modloader;
                modloader_version = cf_version;
                println!("✅ Información de modloader obtenida: {} {}", modloader, modloader_version);
            }
            
            // Clean up temp files
            if temp_extract_dir.exists() {
                fs::remove_dir_all(&temp_extract_dir)?;
            }
        }
        
        // Clean up temp file
        if temp_zip_path.exists() {
            std::fs::remove_file(&temp_zip_path)?;
        }
    }
    
    emit_progress("Configurando Minecraft y modloader...".to_string(), 25.0, "configuring_minecraft".to_string());
    println!("Installing Minecraft {} with {} {}", 
             modpack.minecraft_version, modloader, modloader_version);
    
    // Crear copia del modpack con información actualizada para la instalación
    let updated_modpack = Modpack {
        modloader: modloader,
        modloader_version: modloader_version,
        ..modpack.clone()
    };
    
    // Usar la función con progreso para mostrar detalles de Lyceris
    minecraft::install_minecraft_with_lyceris_progress(&updated_modpack, &settings, instance_dir.clone(), {
        let emit_progress = emit_progress.clone();
        let last_general_percentage = std::sync::Arc::new(std::sync::Mutex::new(30.0f32));
        let last_general_message = std::sync::Arc::new(std::sync::Mutex::new("Instalando Minecraft...".to_string()));
        
        move |message: String, percentage: f32, step: String| {
            let mut final_percentage = 30.0;
            
            // Solo actualizar porcentaje para progreso general (líneas "Progress:")
            if step == "downloading_minecraft_general" || message.starts_with("Progress:") {
                if percentage >= 0.0 {
                    final_percentage = 30.0 + (percentage * 0.4); // 40% del total dedicado a Lyceris (30% a 70%)
                    if let Ok(mut last) = last_general_percentage.lock() {
                        *last = final_percentage;
                    }
                    
                    // Parsear mensaje Progress para crear mensaje general más útil
                    if let Ok(mut last_msg) = last_general_message.lock() {
                        if let Some(parsed) = parse_progress_message(&message) {
                            *last_msg = parsed;
                        }
                    }
                }
            } else {
                // Para archivos individuales, mantener el último porcentaje general
                if let Ok(last) = last_general_percentage.lock() {
                    final_percentage = *last;
                }
            }
            
            emit_progress(message, final_percentage, step);
        }
    }).await?;
    
    emit_progress("Minecraft y modloader instalados".to_string(), 75.0, "minecraft_ready".to_string());
    println!("✅ Phase 1/2: Minecraft and mod loader installed successfully!");
    
    // Phase 2: Download and extract modpack (25% of total progress)
    let failed_mods = if !modpack.url_modpack_zip.is_empty() {
        emit_progress("Descargando archivos del modpack...".to_string(), 80.0, "downloading_modpack".to_string());
        println!("📦 Phase 2/2: Downloading and processing modpack...");
        let temp_zip_path = app_data_dir.join("temp").join(format!("{}.zip", modpack.id));
        std::fs::create_dir_all(temp_zip_path.parent().unwrap())?;
        
        println!("Downloading modpack from: {}", modpack.url_modpack_zip);
        downloader::download_file(&modpack.url_modpack_zip, &temp_zip_path).await?;
        
        emit_progress("Procesando archivos del modpack...".to_string(), 85.0, "processing_modpack".to_string());
        
        // Extraer el ZIP en una carpeta temporal para verificar si tiene manifest.json (indicando que es un modpack de CurseForge)
        let temp_extract_dir = app_data_dir.join("temp").join(format!("check_{}", modpack.id));
        if temp_extract_dir.exists() {
            fs::remove_dir_all(&temp_extract_dir)?;
        }
        fs::create_dir_all(&temp_extract_dir)?;
        
        // Extraer solo manifest.json para verificar
        let is_curseforge_modpack = {
            let file = fs::File::open(&temp_zip_path)?;
            let mut archive = zip::ZipArchive::new(file)?;
            
            // Buscar manifest.json en la raíz
            let mut found_manifest = false;
            for i in 0..archive.len() {
                let file = archive.by_index(i)?;
                if file.name() == "manifest.json" {
                    found_manifest = true;
                    break;
                }
            }
            
            found_manifest
        };
        
        println!("🔄 Procesando modpack para: {}", instance_dir.display());
        
        // Si es un modpack de CurseForge, usar el procesador de CurseForge con rastreo de failed mods
        if is_curseforge_modpack {
            let (_cf_modloader, _cf_version, failed_mods) = curseforge::process_curseforge_modpack_with_failed_tracking(&temp_zip_path, &instance_dir, {
                let emit_progress = emit_progress.clone();
                move |message: String, percentage: f32, step: String| {
                    let scaled_percentage = 85.0 + (percentage / 100.0) * 15.0;
                    emit_progress(message, scaled_percentage, step);
                }
            }).await?;
            
            failed_mods
        } else {
            // Es un modpack ZIP regular, extraer todo
            extract_zip(&temp_zip_path, &instance_dir)?;
            Vec::new() // No failed mods for regular ZIP files
        }
    } else {
        Vec::new() // No failed mods if no modpack URL
    };
    
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
    
    emit_progress("Instalación completada".to_string(), 100.0, "completed".to_string());
    println!("Modpack installation completed successfully!");
    Ok(failed_mods)
}

/// Install a modpack with full Minecraft setup using Lyceris with progress callbacks
pub async fn install_modpack_with_minecraft_progress<F>(
    modpack: Modpack, 
    settings: UserSettings,
    emit_progress: F
) -> Result<()> 
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    let _failed_mods = install_modpack_with_minecraft_and_failed_tracking(modpack, settings, emit_progress).await?;
    Ok(())
}

/// Update only the modpack files without reinstalling Minecraft/Lyceris with progress and failed mods tracking
async fn update_modpack_only_with_failed_tracking<F>(
    modpack: Modpack, 
    instance_dir: PathBuf,
    emit_progress: F
) -> Result<Vec<serde_json::Value>>
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    // Verificar primera si realmente se necesita actualización
    if let Ok(Some(existing_metadata)) = filesystem::get_instance_metadata(&modpack.id).await {
        if !minecraft::check_instance_needs_update(&modpack, &existing_metadata).await {
            emit_progress("La instancia ya está actualizada".to_string(), 100.0, "completed".to_string());
            
            // Actualizar metadata con fecha actual para marcar verificación
            let metadata = InstanceMetadata {
                id: modpack.id.clone(),
                version: modpack.version.clone(),
                installed_at: chrono::Utc::now().to_rfc3339(),
                modloader: modpack.modloader.clone(),
                modloader_version: modpack.modloader_version.clone(),
                minecraft_version: modpack.minecraft_version.clone(),
            };
            
            filesystem::save_instance_metadata(&metadata).await?;
            emit_progress("Actualización completada".to_string(), 100.0, "completed".to_string());
            return Ok(Vec::new()); // No failed mods for up-to-date instances
        }
    }
    
    let app_data_dir = data_dir()
        .ok_or_else(|| anyhow!("Failed to get app data directory"))?
        .join("LKLauncher");
    
    // Iniciar con progreso inicial para mostrar que la actualización ha comenzado
    emit_progress("Iniciando actualización...".to_string(), 5.0, "updating".to_string());
    
    // Phase 1: Download modpack
    emit_progress("Descargando nueva versión...".to_string(), 15.0, "downloading_update".to_string());
    let temp_zip_path = app_data_dir.join("temp").join(format!("{}_update.zip", modpack.id));
    std::fs::create_dir_all(temp_zip_path.parent().unwrap())?;
    
    downloader::download_file(&modpack.url_modpack_zip, &temp_zip_path).await?;
    
    // Phase 2: Process modpack files
    emit_progress("Procesando nuevos archivos...".to_string(), 30.0, "processing_update".to_string());
    
    // Verificar si es un modpack de CurseForge
    let is_curseforge_modpack = {
        let file = fs::File::open(&temp_zip_path)?;
        let mut archive = zip::ZipArchive::new(file)?;
        
        let mut found_manifest = false;
        for i in 0..archive.len() {
            let file = archive.by_index(i)?;
            if file.name() == "manifest.json" {
                found_manifest = true;
                break;
            }
        }
        
        found_manifest
    };
    
    let failed_mods = if is_curseforge_modpack {
        emit_progress("Actualizando mods de CurseForge...".to_string(), 40.0, "updating_curseforge_mods".to_string());
        
        // Crear directorio temporal para la nueva versión
        let temp_extract_dir = app_data_dir.join("temp").join(format!("update_{}", modpack.id));
        if temp_extract_dir.exists() {
            fs::remove_dir_all(&temp_extract_dir)?;
        }
        fs::create_dir_all(&temp_extract_dir)?;
        
        // Procesar la nueva versión del modpack CurseForge con progreso y verificación de existentes
        let (_modloader, _modloader_version) = curseforge::process_curseforge_modpack_for_update(&temp_zip_path, &temp_extract_dir, &instance_dir, {
            let emit_progress = emit_progress.clone();
            move |message: String, percentage: f32, step: String| {
                // Re-mapear el progreso de CurseForge (0-100%) al rango 40-60%
                let adjusted_percentage = 40.0 + (percentage * 0.2); // 20% del total para CurseForge en actualización
                emit_progress(message, adjusted_percentage, step);
            }
        }).await?;
        
        emit_progress("Reemplazando mods actualizados...".to_string(), 60.0, "replacing_mods".to_string());
        
        // La nueva función ya verificó hashes y solo descargó/copió los mods necesarios
        // Ahora solo necesitamos mover los mods del directorio temporal al final
        let old_mods_dir = instance_dir.join("mods");
        let new_mods_dir = temp_extract_dir.join("mods");
        
        // Crear directorio mods si no existe
        if !old_mods_dir.exists() {
            fs::create_dir_all(&old_mods_dir)?;
        }
        
        if new_mods_dir.exists() {
            emit_progress("Finalizando actualización de mods...".to_string(), 65.0, "finalizing_mods".to_string());
            
            // Eliminar la carpeta de mods antigua solo ahora que tenemos la nueva lista completa
            if old_mods_dir.exists() {
                fs::remove_dir_all(&old_mods_dir)?;
            }
            
            // Mover la nueva carpeta de mods (que ya contiene solo los mods necesarios)
            copy_dir_recursively(&new_mods_dir, &old_mods_dir)?;
            println!("✅ Mods actualizados exitosamente");
        }
        
        emit_progress("Actualizando configuraciones...".to_string(), 75.0, "updating_configs".to_string());
        
        // También actualizar overrides si existen
        for entry in fs::read_dir(&temp_extract_dir)? {
            let entry = entry?;
            let path = entry.path();
            let file_name = entry.file_name();
            
            // Ignorar la carpeta mods (ya la copiamos) y archivos de sistema
            if file_name == "mods" || file_name == "manifest.json" {
                continue;
            }
            
            let dest_path = instance_dir.join(&file_name);
            
            // Reemplazar archivos/carpetas de configuración
            if dest_path.exists() {
                if path.is_dir() {
                    fs::remove_dir_all(&dest_path)?;
                } else {
                    fs::remove_file(&dest_path)?;
                }
            }
            
            if path.is_dir() {
                copy_dir_recursively(&path, &dest_path)?;
            } else {
                fs::copy(&path, &dest_path)?;
            }
        }
        
        // Limpiar directorio temporal
        fs::remove_dir_all(&temp_extract_dir)?;
        
        Vec::new() // TODO: Obtener failed mods desde process_curseforge_modpack_for_update
        
    } else {
        emit_progress("Actualizando archivos del modpack estándar...".to_string(), 40.0, "updating_standard_modpack".to_string());
        
        // Para modpacks estándar, extraer nuevamente pero preservar archivos de Minecraft
        // Crear backup temporal de archivos importantes
        let backup_dirs = ["libraries", ".minecraft", "versions"];
        let temp_backup_dir = app_data_dir.join("temp").join(format!("backup_{}", modpack.id));
        
        if temp_backup_dir.exists() {
            fs::remove_dir_all(&temp_backup_dir)?;
        }
        fs::create_dir_all(&temp_backup_dir)?;
        
        emit_progress("Respaldando archivos de Minecraft...".to_string(), 50.0, "backing_up_minecraft".to_string());
        
        // Hacer backup de directorios importantes
        for dir_name in &backup_dirs {
            let src_dir = instance_dir.join(dir_name);
            let dest_dir = temp_backup_dir.join(dir_name);
            
            if src_dir.exists() {
                copy_dir_recursively(&src_dir, &dest_dir)?;
            }
        }
        
        emit_progress("Extrayendo nueva versión...".to_string(), 65.0, "extracting_new_version".to_string());
        
        // Extraer nueva versión
        extract_zip(&temp_zip_path, &instance_dir)?;
        
        emit_progress("Restaurando archivos de Minecraft...".to_string(), 80.0, "restoring_minecraft".to_string());
        
        // Restaurar archivos de Minecraft
        for dir_name in &backup_dirs {
            let src_dir = temp_backup_dir.join(dir_name);
            let dest_dir = instance_dir.join(dir_name);
            
            if src_dir.exists() {
                if dest_dir.exists() {
                    fs::remove_dir_all(&dest_dir)?;
                }
                copy_dir_recursively(&src_dir, &dest_dir)?;
            }
        }
        
        // Limpiar backup
        fs::remove_dir_all(&temp_backup_dir)?;
        
        Vec::new() // No failed mods for regular ZIP files
    };
    
    // Clean up temporary file
    if temp_zip_path.exists() {
        std::fs::remove_file(&temp_zip_path)?;
    }
    
    // Phase 3: Update metadata
    emit_progress("Finalizando actualización...".to_string(), 90.0, "finalizing_update".to_string());
    let metadata = InstanceMetadata {
        id: modpack.id.clone(),
        version: modpack.version.clone(),
        installed_at: chrono::Utc::now().to_rfc3339(),
        modloader: modpack.modloader.clone(),
        modloader_version: modpack.modloader_version.clone(),
        minecraft_version: modpack.minecraft_version.clone(),
    };
    
    filesystem::save_instance_metadata(&metadata).await?;
    
    emit_progress("Actualización completada exitosamente".to_string(), 100.0, "completed".to_string());
    Ok(failed_mods)
}

/// Update only the modpack files without reinstalling Minecraft/Lyceris with progress
async fn update_modpack_only_with_progress<F>(
    modpack: Modpack, 
    instance_dir: PathBuf,
    emit_progress: F
) -> Result<()>
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    let _failed_mods = update_modpack_only_with_failed_tracking(modpack, instance_dir, emit_progress).await?;
    Ok(())
}

/// Copy a directory and its contents recursively
fn copy_dir_recursively(src: &PathBuf, dst: &PathBuf) -> Result<()> {
    if !src.is_dir() {
        return Err(anyhow!("{} no es un directorio", src.display()));
    }
    
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }
    
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        
        if src_path.is_dir() {
            copy_dir_recursively(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    
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

fn extract_zip(zip_path: &PathBuf, extract_to: &PathBuf) -> Result<()> {
    let file = std::fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = match file.enclosed_name() {
            Some(path) => extract_to.join(path),
            None => continue,
        };
        
        if (*file.name()).ends_with('/') {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p)?;
                }
            }
            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
        }
        
        // Get and Set permissions
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = file.unix_mode() {
                std::fs::set_permissions(&outpath, std::fs::Permissions::from_mode(mode))?;
            }
        }
    }
    
    Ok(())
}

/// Get modloader information from CurseForge manifest without full processing
async fn get_curseforge_modloader_info(zip_path: &PathBuf) -> Result<(String, String)> {
    let file = fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    
    // Find and read manifest.json
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        if file.name() == "manifest.json" {
            let mut contents = String::new();
            std::io::Read::read_to_string(&mut file, &mut contents)?;
            
            // Parse JSON
            let manifest: serde_json::Value = serde_json::from_str(&contents)?;
            
            // Extract modloader info
            if let Some(loaders) = manifest.get("minecraft").and_then(|mc| mc.get("modLoaders")) {
                if let Some(loader_array) = loaders.as_array() {
                    if let Some(first_loader) = loader_array.first() {
                        if let Some(id) = first_loader.get("id").and_then(|id| id.as_str()) {
                            // Parse the loader ID (e.g., "forge-47.3.0" -> ("forge", "47.3.0"))
                            if let Some(dash_pos) = id.find('-') {
                                let loader_name = &id[..dash_pos];
                                let loader_version = &id[dash_pos + 1..];
                                return Ok((loader_name.to_string(), loader_version.to_string()));
                            }
                        }
                    }
                }
            }
            
            // Fallback: try to get from manifestType
            if let Some(manifest_type) = manifest.get("manifestType").and_then(|mt| mt.as_str()) {
                if manifest_type == "minecraftModpack" {
                    // Default to forge if we can't determine
                    return Ok(("forge".to_string(), "latest".to_string()));
                }
            }
            
            break;
        }
    }
    
    Err(anyhow!("Could not extract modloader info from CurseForge manifest"))
}

/// Parsea mensajes de "Progress:" para crear mensajes generales útiles
/// Ejemplo: "Progress: 3835/3855 - Java (99.48119%)" -> "Descargando Java... (3835/3855)"
/// Devuelve None si debe mantener el mensaje anterior (evita parpadeo)
fn parse_progress_message(message: &str) -> Option<String> {
    if !message.starts_with("Progress:") {
        return None;
    }
    
    // Cambiar "Progress:" por "Progreso:"
    let message = message.replacen("Progress:", "Progreso:", 1);
    
    // Ejemplo: "Progreso: 3835/3855 - Java (99.48119%)"
    if let Some(dash_pos) = message.find(" - ") {
        let progress_part = &message[9..dash_pos].trim(); // Quitar "Progreso: "
        let after_dash = &message[dash_pos + 3..];
        
        if let Some(paren_pos) = after_dash.find(" (") {
            let component_name = &after_dash[..paren_pos];
            
            // Traducir nombres de componentes
            let translated_name = match component_name {
                "Java" | "java" => "Java",
                "Asset" | "Assets" | "asset" | "assets" => "Assets",
                "Library" | "Libraries" | "library" | "libraries" => "Librerías", 
                "Native" | "Natives" | "native" | "natives" => "Nativos",
                _ => "Archivos"
            };
            
            return Some(format!("Descargando {}... ({})", translated_name, progress_part));
        }
    }
    
    Some("Instalando Minecraft...".to_string())
} 