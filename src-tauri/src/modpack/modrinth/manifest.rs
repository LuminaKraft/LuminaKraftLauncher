use anyhow::{Result, anyhow, Context};
use std::path::{Path, PathBuf};
use std::fs;
use super::types::{
    ModrinthManifest, 
    DEPENDENCY_MINECRAFT, 
    DEPENDENCY_FORGE, 
    DEPENDENCY_NEOFORGE, 
    DEPENDENCY_FABRIC_LOADER, 
    DEPENDENCY_QUILT_LOADER
};

/// Read manifest from extracted Modrinth modpack directory
pub fn read_manifest(temp_dir: &PathBuf) -> Result<ModrinthManifest> {
    let manifest_path = temp_dir.join("modrinth.index.json");
    if !manifest_path.exists() {
        return Err(anyhow!("El archivo modrinth.index.json no existe en el modpack"));
    }
    
    let manifest_content = fs::read_to_string(&manifest_path)
        .context("No se pudo leer el archivo modrinth.index.json")?;
    
    let manifest: ModrinthManifest = serde_json::from_str(&manifest_content)
        .context("Error al parsear modrinth.index.json")?;
    
    // Validate that this is a Minecraft modpack
    if manifest.game != "minecraft" {
        return Err(anyhow!("Este modpack no es para Minecraft (game: {})", manifest.game));
    }
    
    Ok(manifest)
}

/// Extract modloader information from manifest dependencies
/// Returns (modloader_name, modloader_version)
pub fn get_modloader_info(manifest: &ModrinthManifest) -> Result<(String, String)> {
    // Check for each modloader type in order of priority
    if let Some(version) = manifest.dependencies.get(DEPENDENCY_FORGE) {
        return Ok(("forge".to_string(), version.clone()));
    }
    
    if let Some(version) = manifest.dependencies.get(DEPENDENCY_NEOFORGE) {
        return Ok(("neoforge".to_string(), version.clone()));
    }
    
    if let Some(version) = manifest.dependencies.get(DEPENDENCY_FABRIC_LOADER) {
        return Ok(("fabric".to_string(), version.clone()));
    }
    
    if let Some(version) = manifest.dependencies.get(DEPENDENCY_QUILT_LOADER) {
        return Ok(("quilt".to_string(), version.clone()));
    }
    
    Err(anyhow!("No se encontró información del modloader en el manifest de Modrinth"))
}

/// Get Minecraft version from manifest dependencies
pub fn get_minecraft_version(manifest: &ModrinthManifest) -> Result<String> {
    manifest.dependencies
        .get(DEPENDENCY_MINECRAFT)
        .cloned()
        .ok_or_else(|| anyhow!("No se encontró la versión de Minecraft en el manifest"))
}

/// Process overrides from the Modrinth modpack
/// Modrinth uses "overrides" and "client-overrides" folders
pub fn process_overrides<F>(
    temp_dir: &PathBuf, 
    instance_dir: &PathBuf,
    emit_progress: F
) -> Result<()> 
where
    F: Fn(String, f32, String) + Send + Sync + 'static,
{
    // Process main overrides folder
    let overrides_dir = temp_dir.join("overrides");
    if overrides_dir.exists() && overrides_dir.is_dir() {
        emit_progress(
            "progress.processingAdditionalFiles".to_string(),
            97.0,
            "processing_overrides".to_string()
        );
        
        copy_dir_recursively(&overrides_dir, instance_dir)?;
    }
    
    // Process client-overrides folder (client-side only files)
    let client_overrides_dir = temp_dir.join("client-overrides");
    if client_overrides_dir.exists() && client_overrides_dir.is_dir() {
        emit_progress(
            "progress.processingClientOverrides".to_string(),
            98.0,
            "processing_client_overrides".to_string()
        );
        
        copy_dir_recursively(&client_overrides_dir, instance_dir)?;
    }
    
    emit_progress(
        "progress.additionalFilesCompleted".to_string(),
        99.0,
        "overrides_completed".to_string()
    );
    
    Ok(())
}

/// Get relative paths from overrides/ and client-overrides/ recursively
pub fn get_override_relative_paths(temp_dir: &PathBuf) -> std::collections::HashSet<String> {
    let mut paths = std::collections::HashSet::new();
    
    // Check both overrides and client-overrides
    for override_folder in &["overrides", "client-overrides"] {
        let overrides_dir = temp_dir.join(override_folder);
        
        if !overrides_dir.exists() || !overrides_dir.is_dir() {
            continue;
        }
        
        // Walk recursively to collect all file paths relative to the override folder
        fn walk(current_path: PathBuf, base_dir: &PathBuf, paths: &mut std::collections::HashSet<String>) {
            if let Ok(entries) = fs::read_dir(current_path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        walk(path, base_dir, paths);
                    } else if path.is_file() {
                        if let Ok(relative) = path.strip_prefix(base_dir) {
                            paths.insert(relative.to_string_lossy().into_owned());
                        }
                    }
                }
            }
        }
        
        walk(overrides_dir.clone(), &overrides_dir, &mut paths);
    }
    
    if !paths.is_empty() {
        println!("📦 [Modrinth] Found {} files in overrides/client-overrides", paths.len());
    }
    
    paths
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
