use crate::{Modpack, InstanceMetadata, UserSettings, downloader, filesystem, minecraft, curseforge};
use anyhow::{Result, anyhow};
use std::path::PathBuf;
use dirs::data_dir;
use std::fs;

/// Install a modpack to the instances directory
pub async fn install_modpack(modpack: Modpack) -> Result<()> {
    let app_data_dir = data_dir()
        .ok_or_else(|| anyhow!("Failed to get app data directory"))?
        .join("LuminaKraftLauncher");
    
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

/// Install a modpack with full Minecraft setup using Lyceris
pub async fn install_modpack_with_minecraft(modpack: Modpack, settings: UserSettings) -> Result<()> {
    let app_data_dir = data_dir()
        .ok_or_else(|| anyhow!("Failed to get app data directory"))?
        .join("LuminaKraftLauncher");
    
    let instance_dir = app_data_dir.join("instances").join(&modpack.id);
    
    // Create instance directory
    if instance_dir.exists() {
        // Check if we need to update the instance
        if let Ok(Some(existing_metadata)) = filesystem::get_instance_metadata(&modpack.id).await {
            if !minecraft::check_instance_needs_update(&modpack, &existing_metadata).await {
                println!("Instance is up to date, skipping installation");
                return Ok(());
            }
            println!("Instance needs update, reinstalling...");
        }
        std::fs::remove_dir_all(&instance_dir)?;
    }
    std::fs::create_dir_all(&instance_dir)?;
    
    // Phase 1: Download and extract modpack (10% of total progress)
    println!("📦 Phase 1/3: Downloading modpack...");
    let temp_zip_path = app_data_dir.join("temp").join(format!("{}.zip", modpack.id));
    std::fs::create_dir_all(temp_zip_path.parent().unwrap())?;
    
    println!("Downloading modpack from: {}", modpack.url_modpack_zip);
    downloader::download_file(&modpack.url_modpack_zip, &temp_zip_path).await?;
    
    // Verificar si es un modpack de CurseForge
    let mut modloader = modpack.modloader.clone();
    let mut modloader_version = modpack.modloader_version.clone();
    
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
    
    // Si es un modpack de CurseForge, usar el procesador de CurseForge
    if is_curseforge_modpack {
        println!("📦 Detectado formato de modpack CurseForge");
        let (cf_modloader, cf_version) = curseforge::process_curseforge_modpack(&temp_zip_path, &instance_dir).await?;
        
        // Actualizar la información del modloader
        modloader = cf_modloader;
        modloader_version = cf_version;
        println!("✅ Modpack CurseForge procesado: {} {}", modloader, modloader_version);
    } else {
        // Si no es CurseForge, extraer normalmente
        println!("📦 Usando formato de modpack estándar");
        extract_zip(&temp_zip_path, &instance_dir)?;
    }
    
    // Clean up temporary file
    if temp_zip_path.exists() {
        std::fs::remove_file(&temp_zip_path)?;
    }
    if temp_extract_dir.exists() {
        fs::remove_dir_all(&temp_extract_dir)?;
    }
    
    println!("✅ Phase 1/3: Modpack downloaded and extracted successfully!");
    
    // Phase 2: Install Minecraft and mod loader using Lyceris (90% of total progress)
    println!("⚙️ Phase 2/3: Installing Minecraft and mod loader...");
    println!("Installing Minecraft {} with {} {}", 
             modpack.minecraft_version, modloader, modloader_version);
    
    // Crear copia del modpack con información actualizada para la instalación
    let updated_modpack = Modpack {
        modloader: modloader,
        modloader_version: modloader_version,
        ..modpack.clone()
    };
    
    minecraft::install_minecraft_with_lyceris(&updated_modpack, &settings, instance_dir.clone()).await?;
    
    println!("✅ Phase 2/3: Minecraft and mod loader installed successfully!");
    
    // Phase 3: Create instance metadata (final step)
    println!("📝 Phase 3/3: Saving instance metadata...");
    let metadata = InstanceMetadata {
        id: modpack.id.clone(),
        version: modpack.version.clone(),
        installed_at: chrono::Utc::now().to_rfc3339(),
        modloader: modpack.modloader.clone(),
        modloader_version: modpack.modloader_version.clone(),
        minecraft_version: modpack.minecraft_version.clone(),
    };
    
    filesystem::save_instance_metadata(&metadata).await?;
    
    println!("🎉 Complete modpack installation with Minecraft completed successfully!");
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