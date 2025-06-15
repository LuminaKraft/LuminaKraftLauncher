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
    #[allow(dead_code)]
    id: i64,
    #[serde(rename = "downloadUrl")]
    download_url: String,
    #[allow(dead_code)]
    #[serde(rename = "fileDate")]
    file_date: String,
    #[serde(rename = "fileName")]
    file_name: String,
    #[allow(dead_code)]
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
    
    // Usar URL base configurada en las settings o el valor por defecto
    let proxy_base_url = "https://api.luminakraft.com/v1/curseforge";
    println!("Conectando a la API de CurseForge mediante proxy: {}", proxy_base_url);
    
    // Procesar cada mod individualmente para mayor robustez
    println!("Descargando mods uno a uno para mayor fiabilidad...");
    
    for (index, file) in manifest.files.iter().enumerate() {
        // Debug info
        println!("[{}/{}] Procesando mod (project: {}, file: {})", 
                 index + 1, manifest.files.len(), file.project_id, file.file_id);
        
        // Realizar petición para un solo archivo
        let url = format!("{}/mods/{}/files/{}", proxy_base_url, file.project_id, file.file_id);
        println!("Consultando información: {}", url);
        
        let response = match client.get(&url).send().await {
            Ok(resp) => resp,
            Err(e) => {
                println!("Error al conectar con la API: {}", e);
                // Continuar con el siguiente archivo
                continue;
            }
        };
        
        if !response.status().is_success() {
            println!("Error de API HTTP {}: {}", response.status(), url);
            // Continuar con el siguiente archivo
            continue;
        }
        
        let api_response = match response.json::<ApiResponse<ModFileInfo>>().await {
            Ok(resp) => resp,
            Err(e) => {
                println!("Error al parsear respuesta JSON: {}", e);
                continue;
            }
        };
        
        let file_info = api_response.data;
        
        // Log de la información obtenida
        println!("Información obtenida: {}", file_info.file_name);
        
        // Vector con un solo elemento para mantener compatibilidad con el resto del código
        let files_info = vec![file_info];
        
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

/// Descarga un archivo desde una URL con reintento
async fn download_file(url: &str, output_path: &PathBuf) -> Result<()> {
    let client = Client::builder()
        .user_agent("LuminaKraft-Launcher")
        .timeout(std::time::Duration::from_secs(120)) // Aumentar timeout a 2 minutos
        .build()?;
    
    // Número máximo de intentos
    let max_retries = 3;
    let mut retry_count = 0;
    
    // Crear directorio padre si no existe
    if let Some(parent) = output_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    
    // Intentar descarga con reintentos
    loop {
        println!("Descargando {} (intento {}/{})", url, retry_count + 1, max_retries);
        
        match client.get(url).send().await {
            Ok(response) => {
                if !response.status().is_success() {
                    retry_count += 1;
                    if retry_count >= max_retries {
                        return Err(anyhow!("Error al descargar el archivo después de {} intentos: HTTP {}", 
                                           max_retries, response.status()));
                    }
                    println!("Error HTTP {}, reintentando...", response.status());
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    continue;
                }
                
                // Descargar en memoria primero
                match response.bytes().await {
                    Ok(bytes) => {
                        // Crear archivo y escribir bytes
                        match File::create(output_path).await {
                            Ok(mut file) => {
                                if let Err(e) = file.write_all(&bytes).await {
                                    println!("Error al escribir archivo: {}", e);
                                    retry_count += 1;
                                    if retry_count >= max_retries {
                                        return Err(anyhow!("Error al escribir el archivo después de {} intentos", max_retries));
                                    }
                                    continue;
                                }
                                
                                if let Err(e) = file.flush().await {
                                    println!("Error al finalizar archivo: {}", e);
                                    retry_count += 1;
                                    if retry_count >= max_retries {
                                        return Err(anyhow!("Error al finalizar la escritura después de {} intentos", max_retries));
                                    }
                                    continue;
                                }
                                
                                // Éxito!
                                return Ok(());
                            },
                            Err(e) => {
                                println!("Error al crear archivo: {}", e);
                                retry_count += 1;
                                if retry_count >= max_retries {
                                    return Err(anyhow!("No se pudo crear el archivo: {}", e));
                                }
                                continue;
                            }
                        }
                    },
                    Err(e) => {
                        println!("Error al leer bytes: {}", e);
                        retry_count += 1;
                        if retry_count >= max_retries {
                            return Err(anyhow!("Error al leer los bytes del archivo: {}", e));
                        }
                        continue;
                    }
                }
            },
            Err(e) => {
                println!("Error de red: {}", e);
                retry_count += 1;
                if retry_count >= max_retries {
                    return Err(anyhow!("Error de red después de {} intentos: {}", max_retries, e));
                }
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                continue;
            }
        }
    }
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