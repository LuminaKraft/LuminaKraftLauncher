use anyhow::{Result, anyhow, Context};
use std::path::{Path, PathBuf};
use std::fs;
use super::types::CurseForgeManifest;



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
            "progress.processingAdditionalFiles".to_string(),
            97.0,
            "processing_overrides".to_string()
        );
        
        copy_dir_recursively(&overrides_dir, instance_dir)?;
        
        emit_progress(
            "progress.additionalFilesCompleted".to_string(),
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