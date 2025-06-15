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
    #[serde(rename = "downloadUrl", default)]
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
    
    // Crear un directorio temporal para extraer el modpack
    let temp_dir = instance_dir.join("temp_extract");
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)?;
    }
    fs::create_dir_all(&temp_dir)?;
    
    // Extraer el archivo ZIP al directorio temporal
    extract_zip(modpack_zip_path, &temp_dir)?;
    
    // Leer el manifest desde el directorio temporal
    let manifest_path = temp_dir.join("manifest.json");
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
    
    // Procesar los overrides desde el directorio temporal
    process_overrides(&manifest, &temp_dir, instance_dir)?;
    
    // Eliminar el directorio temporal
    fs::remove_dir_all(&temp_dir)?;
    
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
    
    // Usar el proxy API de LuminaKraft
    let proxy_base_url = "https://api.luminakraft.com/v1/curseforge";
    println!("Conectando al proxy API de CurseForge");
    println!("Verificando conexión con la API...");
    
    // Obtener información de los mods
    println!("Obteniendo información de los mods...");
    
    let mut download_info = Vec::new();
    
    // Procesar cada mod individualmente
    for (index, file) in manifest.files.iter().enumerate() {
        println!("Procesando mod {}/{} (project_id: {}, file_id: {})", 
                index + 1, manifest.files.len(), file.project_id, file.file_id);
        
        // Primero obtenemos la información del archivo
        let file_info_url = format!("{}/mods/{}/files/{}", proxy_base_url, file.project_id, file.file_id);
        
        println!("Consultando información: {}", file_info_url);
        
        // Realizar la petición para obtener la información del archivo
        let response = match client.get(&file_info_url)
            .send()
            .await {
            Ok(resp) => resp,
            Err(e) => {
                println!("❌ Error al conectar con la API: {}", e);
                continue;
            }
        };
        
        if !response.status().is_success() {
            println!("❌ Error de API HTTP {}: {}", response.status(), file_info_url);
            continue;
        }
        
        // Parsear la respuesta para obtener la información del archivo
        match response.json::<ApiResponse<ModFileInfo>>().await {
            Ok(api_response) => {
                let file_info = api_response.data;
                if !file_info.download_url.is_empty() {
                    println!("✅ URL de descarga obtenida para mod {}", index + 1);
                    download_info.push((file_info.file_name.clone(), file_info.download_url.clone()));
                } else {
                    // No hay URL disponible para este mod
                    println!("⚠️ No se pudo obtener URL de descarga para el mod #{}", index + 1);
                }
            },
            Err(e) => {
                println!("❌ Error al parsear respuesta JSON: {}", e);
            }
        }
    }
    
    let mut all_files_info = Vec::new();
    
    // Convertir la información de descarga al formato esperado
    for (file_name, download_url) in download_info {
        all_files_info.push(ModFileInfo {
            id: 0,
            download_url,
            file_date: String::new(),
            file_name,
            file_length: 0,
        });
    }
    
    // Si no se pudo obtener información de ningún mod, retornar error
    if all_files_info.is_empty() {
        return Err(anyhow!("No se pudo obtener información de ningún mod"));
    }
    
    println!("Se obtuvo información de {}/{} mods", all_files_info.len(), manifest.files.len());
    
    // Descargar cada mod
    for (index, file_info) in all_files_info.iter().enumerate() {
        let mod_path = mods_dir.join(&file_info.file_name);
        
        println!("Descargando mod {}/{}: {}", index + 1, all_files_info.len(), file_info.file_name);
        
        // Descargar el archivo
        match download_file(&file_info.download_url, &mod_path).await {
            Ok(_) => {
                println!("✅ Descargado: {}", file_info.file_name);
            },
            Err(e) => {
                println!("❌ Error al descargar {}: {}", file_info.file_name, e);
            }
        }
    }
    
    println!("Todos los mods descargados correctamente");
    Ok(())
}

/// Procesa la carpeta overrides del modpack
fn process_overrides(manifest: &CurseForgeManifest, temp_dir: &PathBuf, instance_dir: &PathBuf) -> Result<()> {
    let overrides_dir = temp_dir.join(&manifest.overrides);
    
    if overrides_dir.exists() && overrides_dir.is_dir() {
        println!("Procesando overrides...");
        
        // Recorrer la carpeta overrides y mover su contenido a la raíz
        copy_dir_recursively(&overrides_dir, instance_dir)?;
        
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
    // Verificar que la URL no está vacía
    if url.is_empty() {
        return Err(anyhow!("URL de descarga vacía"));
    }
    
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(180)) // Aumentar timeout a 3 minutos
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
        if retry_count > 0 {
            println!("Reintentando descarga (intento {}/{})", retry_count + 1, max_retries);
        }
        
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