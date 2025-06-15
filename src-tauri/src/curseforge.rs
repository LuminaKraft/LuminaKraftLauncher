use std::path::{Path, PathBuf};
use std::fs;
use anyhow::{Result, anyhow, Context};
use serde::{Deserialize, Serialize};
use reqwest::Client;
use tokio::io::AsyncWriteExt;
use tokio::fs::File;
// Eliminamos las importaciones no utilizadas

#[derive(Debug, Deserialize, Serialize)]
struct CurseForgeManifest {
    minecraft: MinecraftInfo,
    #[serde(rename = "manifestType")]
    manifest_type: String,
    #[serde(rename = "manifestVersion")]
    manifest_version: i32,
    name: String,
    version: String,
    #[serde(default)]
    author: String,
    files: Vec<CurseForgeFile>,
    overrides: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct MinecraftInfo {
    version: String,
    #[serde(rename = "modLoaders")]
    mod_loaders: Vec<ModLoader>,
    #[serde(rename = "recommendedRam", default)]
    recommended_ram: Option<u32>,
}

#[derive(Debug, Deserialize, Serialize)]
struct ModLoader {
    id: String,
    primary: bool,
}

#[derive(Debug, Deserialize, Serialize)]
struct CurseForgeFile {
    #[serde(rename = "projectID")]
    project_id: i64,
    #[serde(rename = "fileID")]
    file_id: i64,
    required: bool,
}

#[derive(Debug, Deserialize)]
struct ModFileInfo {
    id: i64,
    #[serde(rename = "downloadUrl")]
    download_url: String,
    #[serde(rename = "fileDate")]
    file_date: String,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "fileLength")]
    file_length: i64,
}

#[derive(Debug, Deserialize)]
struct ApiResponse<T> {
    data: T,
}

/// Extrae un archivo zip
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

/// Extrae un archivo modpack de CurseForge y procesa su contenido
pub async fn process_curseforge_modpack(
    modpack_zip_path: &PathBuf,
    instance_dir: &PathBuf,
) -> Result<(String, String)> {
    println!("Procesando modpack de CurseForge");
    
    // Extraer el archivo ZIP
    extract_zip(modpack_zip_path, instance_dir)?;
    
    // Leer el manifest
    let manifest_path = instance_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err(anyhow!("El archivo manifest.json no existe en el modpack"));
    }
    
    println!("Leyendo manifest.json");
    let manifest_content = fs::read_to_string(&manifest_path)
        .context("No se pudo leer el archivo manifest.json")?;
    
    let manifest: CurseForgeManifest = serde_json::from_str(&manifest_content)
        .context("Error al parsear manifest.json")?;
    
    println!("Nombre del modpack: {}", manifest.name);
    println!("Versión del modpack: {}", manifest.version);
    println!("Versión de Minecraft: {}", manifest.minecraft.version);
    
    // Si hay RAM recomendada, mostrarla
    if let Some(ram) = manifest.minecraft.recommended_ram {
        println!("RAM recomendada: {} MB", ram);
    }
    
    // Procesar los mods
    println!("Descargando {} mods", manifest.files.len());
    download_mods(&manifest, instance_dir).await?;
    
    // Procesar los overrides
    process_overrides(&manifest, instance_dir)?;
    
    // Extraer la información del modloader
    let (modloader, modloader_version) = get_modloader_info(&manifest)?;
    
    // Devolver la información necesaria para la instalación
    Ok((modloader, modloader_version))
}

/// Descarga los mods listados en el manifest
async fn download_mods(manifest: &CurseForgeManifest, instance_dir: &PathBuf) -> Result<()> {
    println!("Descargando {} mods desde CurseForge...", manifest.files.len());
    
    // Crear directorio de mods si no existe
    let mods_dir = instance_dir.join("mods");
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir)?;
    }
    
    let client = Client::builder()
        .user_agent("LuminaKraft-Launcher")
        .timeout(std::time::Duration::from_secs(60))
        .build()?;
    
    let proxy_base_url = "https://api.luminakraft.com/v1/curseforge";
    
    // Procesar los mods en lotes para mayor eficiencia
    let batch_size = 25;
    for chunk in manifest.files.chunks(batch_size) {
        // Crear la lista de IDs de archivo para la petición por lotes
        let file_ids: Vec<i64> = chunk.iter().map(|file| file.file_id).collect();
        
        // Realizar petición por lotes
        let url = format!("{}/mods/files", proxy_base_url);
        let response = client
            .post(&url)
            .json(&serde_json::json!({ "fileIds": file_ids }))
            .send()
            .await?;
        
        if !response.status().is_success() {
            return Err(anyhow!("Error al obtener información de los archivos: {}", response.status()));
        }
        
        let api_response: ApiResponse<Vec<ModFileInfo>> = response.json().await?;
        let files_info = api_response.data;
        
        // Descargar cada mod
        for file_info in files_info {
            let mod_path = mods_dir.join(&file_info.file_name);
            
            // Descargar el archivo
            download_file(&file_info.download_url, &mod_path).await?;
            println!("Descargado: {}", file_info.file_name);
        }
    }
    
    println!("Todos los mods descargados correctamente");
    Ok(())
}

/// Procesa la carpeta overrides del modpack
fn process_overrides(manifest: &CurseForgeManifest, instance_dir: &PathBuf) -> Result<()> {
    let overrides_dir = instance_dir.join(&manifest.overrides);
    
    if overrides_dir.exists() && overrides_dir.is_dir() {
        println!("Procesando overrides...");
        
        // Recorrer la carpeta overrides y mover su contenido a la raíz
        copy_dir_recursively(&overrides_dir, instance_dir)?;
        
        // Eliminar la carpeta overrides
        fs::remove_dir_all(&overrides_dir)?;
        
        println!("Overrides procesados correctamente");
    } else {
        println!("No se encontraron overrides en el modpack");
    }
    
    Ok(())
}

/// Copia una carpeta y su contenido de forma recursiva
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

/// Descarga un archivo desde una URL
async fn download_file(url: &str, output_path: &PathBuf) -> Result<()> {
    let client = Client::new();
    
    let response = client
        .get(url)
        .send()
        .await
        .context("Error al descargar el archivo")?;
    
    if !response.status().is_success() {
        return Err(anyhow!("Error al descargar el archivo: HTTP {}", response.status()));
    }
    
    let mut file = File::create(output_path)
        .await
        .context("Error al crear el archivo")?;
    
    let bytes = response
        .bytes()
        .await
        .context("Error al leer los bytes del archivo")?;
    
    file.write_all(&bytes)
        .await
        .context("Error al escribir el archivo")?;
    
    file.flush()
        .await
        .context("Error al finalizar la escritura del archivo")?;
    
    Ok(())
}

/// Extrae la información del modloader del manifest
fn get_modloader_info(manifest: &CurseForgeManifest) -> Result<(String, String)> {
    // Buscar el modloader primario
    for loader in &manifest.minecraft.mod_loaders {
        if loader.primary {
            // El formato típico es "forge-40.2.0" o "forge-47.4.0" como en tu ejemplo
            let parts: Vec<&str> = loader.id.split('-').collect();
            if parts.len() >= 2 {
                let modloader_name = parts[0].to_lowercase();
                let modloader_version = parts[1].to_string();
                
                println!("Encontrado modloader primario: {} {}", modloader_name, modloader_version);
                return Ok((modloader_name, modloader_version));
            }
        }
    }
    
    // Si no se encuentra un modloader primario, usar el primer modloader disponible
    if let Some(loader) = manifest.minecraft.mod_loaders.first() {
        let parts: Vec<&str> = loader.id.split('-').collect();
        if parts.len() >= 2 {
            let modloader_name = parts[0].to_lowercase();
            let modloader_version = parts[1].to_string();
            
            println!("Usando primer modloader disponible: {} {}", modloader_name, modloader_version);
            return Ok((modloader_name, modloader_version));
        }
    }
    
    // Si no hay modloaders, asumir vanilla
    println!("No se encontró información de modloader, asumiendo vanilla.");
    Err(anyhow!("No se encontró información del modloader en el manifest"))
} 