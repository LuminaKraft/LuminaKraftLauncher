use anyhow::{Result, anyhow, Context};
use std::path::{Path, PathBuf};
use std::fs;
use super::types::CurseForgeManifest;

/// Get modloader information from CurseForge manifest without full processing
pub async fn get_curseforge_modloader_info(zip_path: &PathBuf) -> Result<(String, String)> {
    // Read manifest.json using lyceris
    let contents = lyceris::util::extract::read_file_from_jar(zip_path, "manifest.json")
        .map_err(|e| anyhow!("Could not read manifest.json: {}", e))?;
    
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
    
    Err(anyhow!("Could not extract modloader info from CurseForge manifest"))
}

/// Read manifest from extracted directory
pub fn read_manifest(temp_dir: &PathBuf) -> Result<CurseForgeManifest> {
    let manifest_path = temp_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err(anyhow!("El archivo manifest.json no existe en el modpack"));
    }
    
    let manifest_content = fs::read_to_string(&manifest_path)
        .context("No se pudo leer el archivo manifest.json")?;
    
    let manifest: CurseForgeManifest = serde_json::from_str(&manifest_content)
        .context("Error al parsear manifest.json")?;
    
    Ok(manifest)
}

/// Extract modloader information from manifest
pub fn get_modloader_info(manifest: &CurseForgeManifest) -> Result<(String, String)> {
    // Buscar el modloader primario
    for loader in &manifest.minecraft.mod_loaders {
        if loader.primary {
            return parse_loader_id(&loader.id);
        }
    }
    
    // Si no se encuentra un modloader primario, usar el primer modloader disponible
    if let Some(loader) = manifest.minecraft.mod_loaders.first() {
        return parse_loader_id(&loader.id);
    }
    
    Err(anyhow!("No se encontró información del modloader en el manifest"))
}

fn parse_loader_id(loader_id: &str) -> Result<(String, String)> {
    // El formato típico es "forge-40.2.0" o "forge-47.4.0"
    let parts: Vec<&str> = loader_id.split('-').collect();
    if parts.len() >= 2 {
        let modloader_name = parts[0].to_lowercase();
        let modloader_version = parts[1].to_string();
        Ok((modloader_name, modloader_version))
    } else {
        Err(anyhow!("Invalid loader ID format: {}", loader_id))
    }
}

/// Process overrides from the manifest
pub fn process_overrides<F>(
    manifest: &CurseForgeManifest, 
    temp_dir: &PathBuf, 
    instance_dir: &PathBuf,
    emit_progress: F
) -> Result<()> 
where
    F: Fn(String, f32, String) + Send + Sync + 'static,
{
    let overrides_dir = temp_dir.join(&manifest.overrides);
    
    if overrides_dir.exists() && overrides_dir.is_dir() {
        emit_progress(
            "Procesando archivos adicionales...".to_string(),
            97.0,
            "processing_overrides".to_string()
        );
        
        copy_dir_recursively(&overrides_dir, instance_dir)?;
        
        emit_progress(
            "Archivos adicionales procesados correctamente".to_string(),
            99.0,
            "overrides_completed".to_string()
        );
    } else {
        emit_progress(
            "No se encontraron archivos adicionales en el modpack".to_string(),
            99.0,
            "no_overrides_found".to_string()
        );
    }
    
    Ok(())
}

/// Copy a directory and its contents recursively
fn copy_dir_recursively(src: &Path, dst: &Path) -> Result<()> {
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