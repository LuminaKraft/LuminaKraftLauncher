use std::path::{Path, PathBuf};
use std::fs;
use anyhow::{Result, anyhow, Context};
use serde::{Deserialize, Serialize};
use reqwest::Client;
use tokio::io::AsyncWriteExt;
use tokio::fs::File;
// Eliminamos las importaciones no utilizadas
// Agregar dependencias para calcular hashes
use lyceris::util::hash::calculate_sha1;

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
    download_url: Option<String>,
    #[allow(dead_code)]
    #[serde(rename = "fileDate", default)]
    file_date: Option<String>,
    #[serde(rename = "fileName", default)]
    file_name: Option<String>,
    #[allow(dead_code)]
    #[serde(rename = "fileLength", default)]
    file_length: Option<i64>,
    #[serde(default)]
    hashes: Vec<FileHash>,
    // Campos adicionales que pueden estar en la respuesta
    #[allow(dead_code)]
    #[serde(rename = "gameId", default)]
    game_id: Option<i64>,
    #[allow(dead_code)]
    #[serde(rename = "modId", default)]
    mod_id: Option<i64>,
    #[allow(dead_code)]
    #[serde(rename = "isAvailable", default)]
    is_available: Option<bool>,
    #[allow(dead_code)]
    #[serde(rename = "displayName", default)]
    display_name: Option<String>,
    #[allow(dead_code)]
    #[serde(rename = "releaseType", default)]
    release_type: Option<i32>,
    #[allow(dead_code)]
    #[serde(rename = "fileStatus", default)]
    file_status: Option<i32>,
    #[allow(dead_code)]
    #[serde(rename = "downloadCount", default)]
    download_count: Option<i64>,
    #[allow(dead_code)]
    #[serde(rename = "gameVersions", default)]
    game_versions: Option<Vec<String>>,
    #[allow(dead_code)]
    #[serde(rename = "sortableGameVersions", default)]
    sortable_game_versions: Option<serde_json::Value>,
    #[allow(dead_code)]
    #[serde(default)]
    dependencies: Option<Vec<serde_json::Value>>,
    #[allow(dead_code)]
    #[serde(rename = "alternateFileId", default)]
    alternate_file_id: Option<i64>,
    #[allow(dead_code)]
    #[serde(rename = "isServerPack", default)]
    is_server_pack: Option<bool>,
    #[allow(dead_code)]
    #[serde(rename = "fileFingerprint", default)]
    file_fingerprint: Option<i64>,
    #[allow(dead_code)]
    #[serde(default)]
    modules: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct FileHash {
    #[serde(default)]
    value: Option<String>,
    algo: i32, // 1 = SHA1, 2 = MD5
}

#[derive(Debug, Deserialize)]
struct ApiResponse<T> {
    data: T,
}

#[derive(serde::Serialize)]
struct GetModFilesRequest {
    #[serde(rename = "fileIds")]
    file_ids: Vec<i64>,
}

/// Extrae un archivo zip usando lyceris
fn extract_zip(zip_path: &PathBuf, extract_to: &PathBuf) -> Result<()> {
    lyceris::util::extract::extract_file(zip_path, extract_to)
        .map_err(|e| anyhow!("Failed to extract ZIP file: {}", e))
}

/// Extrae un archivo modpack de CurseForge y procesa su contenido
#[allow(dead_code)]
pub async fn process_curseforge_modpack(
    modpack_zip_path: &PathBuf,
    instance_dir: &PathBuf,
) -> Result<(String, String)> {
    process_curseforge_modpack_with_progress(modpack_zip_path, instance_dir, |_message, _percentage, _step| {}).await
}

/// Procesa un modpack de CurseForge con callback de progreso y retorna mods fallidos
pub async fn process_curseforge_modpack_with_progress<F>(
    modpack_zip_path: &PathBuf,
    instance_dir: &PathBuf,
    emit_progress: F,
) -> Result<(String, String)> 
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    let (modloader, modloader_version, _failed_mods) = process_curseforge_modpack_with_failed_tracking(modpack_zip_path, instance_dir, emit_progress).await?;
    Ok((modloader, modloader_version))
}

/// Procesa un modpack de CurseForge con callback de progreso y retorna mods fallidos
pub async fn process_curseforge_modpack_with_failed_tracking<F>(
    modpack_zip_path: &PathBuf,
    instance_dir: &PathBuf,
    emit_progress: F,
) -> Result<(String, String, Vec<serde_json::Value>)> 
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    emit_progress(
        "Procesando modpack de CurseForge".to_string(),
        0.0,
        "processing_curseforge".to_string()
    );
    
    // Crear un directorio temporal para extraer el modpack
    let temp_dir = instance_dir.join("temp_extract");
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)?;
    }
    fs::create_dir_all(&temp_dir)?;
    
    emit_progress(
        "Extrayendo archivos del modpack".to_string(),
        5.0,
        "extracting_modpack".to_string()
    );
    
    // Extraer el archivo ZIP al directorio temporal
    extract_zip(modpack_zip_path, &temp_dir)?;
    
    // Leer el manifest desde el directorio temporal
    let manifest_path = temp_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err(anyhow!("El archivo manifest.json no existe en el modpack"));
    }
    
    emit_progress(
        "Leyendo información del modpack".to_string(),
        10.0,
        "reading_manifest".to_string()
    );
    
    let manifest_content = fs::read_to_string(&manifest_path)
        .context("No se pudo leer el archivo manifest.json")?;
    
    let manifest: CurseForgeManifest = serde_json::from_str(&manifest_content)
        .context("Error al parsear manifest.json")?;
    
    emit_progress(
        format!("Modpack: {} v{} (Minecraft {})", manifest.name, manifest.version, manifest.minecraft.version),
        15.0,
        "modpack_info".to_string()
    );
    
    // Procesar los overrides PRIMERO para que estén disponibles al verificar mods
    emit_progress(
        "Procesando archivos adicionales del modpack".to_string(),
        20.0,
        "processing_overrides".to_string()
    );
    
    process_overrides_with_progress(&manifest, &temp_dir, instance_dir, emit_progress.clone())?;
    
    // Procesar los mods DESPUÉS de los overrides
    emit_progress(
        format!("Preparando descarga de {} mods", manifest.files.len()),
        25.0,
        "preparing_mods_download".to_string()
    );
    
    let failed_mods = download_mods_with_failed_tracking(&manifest, instance_dir, emit_progress.clone()).await?;
    
    // Eliminar el directorio temporal
    fs::remove_dir_all(&temp_dir)?;
    
    // Extraer la información del modloader
    let (modloader, modloader_version) = get_modloader_info(&manifest)?;
    
    emit_progress(
        "Modpack de CurseForge procesado exitosamente".to_string(),
        100.0,
        "curseforge_completed".to_string()
    );
    
    // Devolver la información necesaria para la instalación
    Ok((modloader, modloader_version, failed_mods))
}

/// Descarga los mods listados en el manifest
#[allow(dead_code)]
async fn download_mods(manifest: &CurseForgeManifest, instance_dir: &PathBuf) -> Result<()> {
    download_mods_with_progress(manifest, instance_dir, |_message, _percentage, _step| {}).await
}

/// Descarga los mods listados en el manifest con callback de progreso
#[allow(dead_code)]
async fn download_mods_with_progress<F>(
    manifest: &CurseForgeManifest, 
    instance_dir: &PathBuf,
    emit_progress: F
) -> Result<()>
where
    F: Fn(String, f32, String) + Send + Sync + 'static,
{
    let _failed_mods = download_mods_with_failed_tracking(manifest, instance_dir, emit_progress).await?;
    Ok(())
}

/// Descarga los mods listados en el manifest con callback de progreso y retorna mods fallidos
async fn download_mods_with_failed_tracking<F>(
    manifest: &CurseForgeManifest, 
    instance_dir: &PathBuf,
    emit_progress: F
) -> Result<Vec<serde_json::Value>>
where
    F: Fn(String, f32, String) + Send + Sync + 'static,
{
    emit_progress(
        format!("Descargando {} mods desde CurseForge...", manifest.files.len()),
        25.0,
        "downloading_mods".to_string()
    );
    
    // Vector para rastrear mods fallidos
    let mut failed_mods = Vec::new();
    
    // Crear directorio de mods si no existe
    let mods_dir = instance_dir.join("mods");
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir)?;
    }

    let client = Client::builder()
        .user_agent("LKLauncher")
        .timeout(std::time::Duration::from_secs(60))
        .build()?;
    
    // Usar el proxy API de LuminaKraft
    let proxy_base_url = "https://api.luminakraft.com/v1/curseforge";
    emit_progress(
        "Conectando al proxy API de CurseForge".to_string(),
        30.0,
        "connecting_api".to_string()
    );
    
    let mut api_errors_count = 0;
    
    // 🚀 BATCH REQUEST: Obtener información de TODOS los mods en una sola petición
    emit_progress(
        format!("Obteniendo información de {} mods en batch...", manifest.files.len()),
        35.0,
        "batch_requesting_mods".to_string()
    );
    
    // Extraer todos los file_ids
    let file_ids: Vec<i64> = manifest.files.iter().map(|f| f.file_id).collect();
    
    // Dividir en chunks de 50 (límite de la API)
    const BATCH_SIZE: usize = 50;
    let mut all_file_infos = Vec::new();
    
    for (chunk_index, chunk) in file_ids.chunks(BATCH_SIZE).enumerate() {
        let progress = 35.0 + (chunk_index as f32 / file_ids.chunks(BATCH_SIZE).count() as f32) * 25.0;
        
        emit_progress(
            format!("Batch request {}/{} ({} mods)", 
                   chunk_index + 1, 
                   file_ids.chunks(BATCH_SIZE).count(),
                   chunk.len()),
            progress,
            "batch_api_request".to_string()
        );
        
        // Crear el request body
        let request_body = GetModFilesRequest {
            file_ids: chunk.to_vec(),
        };
        
        // Retry logic para el batch request
        let mut batch_response = None;
        let max_retries = 3;
        
        for attempt in 1..=max_retries {
            let batch_url = format!("{}/mods/files", proxy_base_url);
            
            match client.post(&batch_url)
                .json(&request_body)
                .send()
                .await {
                Ok(resp) => {
                    if resp.status().is_success() || resp.status() == 404 {
                        // Tratar 404 como válido - significa archivos no encontrados, pero es respuesta válida
                        batch_response = Some(resp);
                        break;
                    } else if resp.status() == 429 && attempt < max_retries {
                        let delay_ms = 2000 * attempt * attempt; // Delay mucho más agresivo: 2s, 8s, 18s
                        println!("⏳ Rate limited (429) en batch request - Reintentando en {}ms (intento {}/{})", 
                               delay_ms, attempt, max_retries);
                        emit_progress(
                            format!("⏳ Rate limited - esperando {}s antes de reintentar...", delay_ms / 1000),
                            progress,
                            "rate_limited_waiting".to_string()
                        );
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    } else {
                        println!("❌ Error HTTP {} en batch request - agregando {} errores", resp.status(), chunk.len());
                        api_errors_count += chunk.len(); // Contar todos los mods del chunk como errores
                        break;
                    }
                },
                Err(e) => {
                    if attempt < max_retries {
                        let delay_ms = 200 * attempt;
                        println!("⏳ Error de conexión en batch request - Reintentando en {}ms (intento {}/{})", 
                               delay_ms, attempt, max_retries);
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    } else {
                        println!("❌ Error de API en batch request: {} - agregando {} errores", e, chunk.len());
                        api_errors_count += chunk.len();
                        break;
                    }
                }
            }
        }
        
        // Procesar la respuesta del batch
        if let Some(response) = batch_response {
            // Primero obtener el texto de la respuesta para debug
            let response_text = match response.text().await {
                Ok(text) => text,
                Err(e) => {
                    println!("❌ Error al leer texto de respuesta: {} - agregando {} errores", e, chunk.len());
                    api_errors_count += chunk.len();
                    continue;
                }
            };
            
            // Debug: mostrar las primeras líneas de la respuesta
            let preview = if response_text.len() > 200 {
                &response_text[..200]
            } else {
                &response_text
            };
            println!("🔍 Respuesta API preview: {}...", preview);
            
            // Intentar parsear el JSON
            match serde_json::from_str::<ApiResponse<Vec<ModFileInfo>>>(&response_text) {
                Ok(api_response) => {
                    let data_len = api_response.data.len();
                    all_file_infos.extend(api_response.data);
                    println!("✅ Batch {}/{} completado - {} mods procesados", 
                           chunk_index + 1, 
                           file_ids.chunks(BATCH_SIZE).count(),
                           data_len);
                },
                Err(e) => {
                    // Verificar si es un error 404 (archivos no encontrados)
                    if response_text.contains("\"status\":404") || response_text.contains("\"status\": 404") {
                        println!("⚠️ Algunos archivos no encontrados (404) - esto es normal en modpacks con archivos obsoletos");
                        // No incrementar api_errors_count para 404s
                    } else {
                        println!("❌ Error JSON en batch response: {} - agregando {} errores", e, chunk.len());
                        api_errors_count += chunk.len();
                    }
                }
            }
        } else {
            // Si no hay respuesta, incrementar errores solo si no fue un 404
            println!("⚠️ No se recibió respuesta del batch request");
        }
        
        // Delay más largo entre batches para evitar rate limiting
        if chunk_index < file_ids.chunks(BATCH_SIZE).count() - 1 {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    }
    
    emit_progress(
        format!("✅ Información obtenida para {} mods", all_file_infos.len()),
        60.0,
        "batch_completed".to_string()
    );
    
    // Debug: mostrar estadísticas antes de la verificación final
    println!("📊 ESTADÍSTICAS FINALES:");
    println!("   • Total archivos en manifest: {}", manifest.files.len());
    println!("   • Total archivos obtenidos: {}", all_file_infos.len());
    println!("   • Errores de API contados: {}", api_errors_count);
    println!("   • Umbral de error (75%): {}", manifest.files.len() * 3 / 4);
    
    // Verificar si hay demasiados errores (pero ser más tolerante con 404s)
    if api_errors_count > manifest.files.len() * 3 / 4 {
        return Err(anyhow!("🚨 FALLO CRÍTICO: Demasiados errores de API ({}/{}) - requiere reparación", 
                          api_errors_count, manifest.files.len()));
    }
    
    // Ahora procesar cada mod individualmente para verificar y descargar
    // Crear un mapa de file_id -> manifest file para poder obtener project_id
    let mut file_id_to_project: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    for manifest_file in &manifest.files {
        file_id_to_project.insert(manifest_file.file_id, manifest_file.project_id);
    }
    
    for (index, file_info) in all_file_infos.iter().enumerate() {
        let progress_percentage = 60.0 + (index as f32 / all_file_infos.len() as f32) * 30.0;
        
        // Mostrar progreso general del modpack (arriba)
        emit_progress(
            format!("downloading_modpack:{}:{}", index + 1, all_file_infos.len()),
            progress_percentage,
            "downloading_modpack_file".to_string()
        );
        
        // Verificar que tenemos información válida del batch request
        let download_url = match &file_info.download_url {
            Some(url) if !url.is_empty() => url,
            _ => {
                // Debug adicional para URLs vacías
                let file_name = file_info.file_name.as_deref().unwrap_or("archivo desconocido");
                let is_available = file_info.is_available.unwrap_or(false);
                let file_status = file_info.file_status.unwrap_or(-1);
                let display_name = file_info.display_name.as_deref().unwrap_or("N/A");
                
                println!("⚠️ ADVERTENCIA: URL vacía para {} - Detalles:", file_name);
                println!("   • Display Name: {}", display_name);
                println!("   • Available: {}", is_available);
                println!("   • File Status: {}", file_status);
                println!("   • Project ID: {}", file_info.mod_id.unwrap_or(-1));
                println!("   • File ID: {}", file_info.id);
                
                // Si el archivo no está disponible, es normal que no tenga URL
                if !is_available {
                    println!("   → Archivo marcado como NO DISPONIBLE en CurseForge");
                } else {
                    println!("   → Archivo disponible pero sin URL - posible error de API");
                }
                
                // Verificar si el archivo ya existe en la carpeta mods (puede estar en overrides)
                let mod_path = mods_dir.join(file_name);
                if verify_file_hash(&mod_path, &file_info.hashes) {
                    println!("   → ✅ Mod encontrado localmente con hash correcto (posiblemente de overrides)");
                    emit_progress(
                        format!("mod_exists:{}", file_name),
                        progress_percentage + 5.0,
                        "mod_found_locally".to_string()
                    );
                    continue;
                } else {
                    println!("   → ❌ Mod no encontrado localmente - agregando a lista de fallidos");
                    
                    // Agregar a la lista de mods fallidos solo si no existe localmente
                    let project_id = file_id_to_project.get(&file_info.id).copied().unwrap_or(file_info.mod_id.unwrap_or(-1));
                    let failed_mod = serde_json::json!({
                        "projectId": project_id,
                        "fileId": file_info.id,
                        "fileName": file_name
                    });
                    failed_mods.push(failed_mod);
                    
                    emit_progress(
                        format!("⚠️ Mod no disponible: {}", file_name),
                        progress_percentage,
                        "mod_unavailable".to_string()
                    );
                    continue;
                }
            }
        };

        let file_name = match &file_info.file_name {
            Some(name) if !name.is_empty() => name,
            _ => {
                println!("⚠️ ADVERTENCIA: Nombre de archivo vacío - saltando");
                continue;
            }
        };
        
        let mod_path = mods_dir.join(file_name);
        
        // Verificar si el archivo ya existe y tiene el hash correcto
        if verify_file_hash(&mod_path, &file_info.hashes) {
            // Mostrar que el mod ya existe (abajo)
            emit_progress(
                format!("mod_exists:{}", file_name),
                progress_percentage + 5.0,
                "mod_already_exists".to_string()
            );
            continue;
        }
        
        // Si llegamos aquí, necesitamos descargar el mod - mostrar solo el nombre del archivo (abajo)
        emit_progress(
            format!("mod_name:{}", file_name),
            progress_percentage + 3.0,
            "downloading_mod_file".to_string()
        );
        
        // Descargar el archivo
        match download_file(download_url, &mod_path).await {
            Ok(_) => {
                // Verificar el hash después de la descarga
                if verify_file_hash(&mod_path, &file_info.hashes) {
                    emit_progress(
                        format!("mod_completed:{}", file_name),
                        progress_percentage + 5.0,
                        "mod_downloaded_verified".to_string()
                    );
                } else {
                    emit_progress(
                        format!("mod_error:{}", file_name),
                        progress_percentage + 5.0,
                        "mod_hash_mismatch".to_string()
                    );
                    // Eliminar archivo corrupto
                    if mod_path.exists() {
                        std::fs::remove_file(&mod_path).ok();
                    }
                }
            },
            Err(e) => {
                emit_progress(
                    format!("❌ Error al descargar {}: {}", file_name, e),
                    progress_percentage,
                    "error_downloading_mod".to_string()
                );
            }
        }
    }
    
    emit_progress(
        "✅ Proceso de descarga de mods completado".to_string(),
        90.0,
        "mods_download_completed".to_string()
    );
    Ok(failed_mods)
}

/// Procesa la carpeta overrides del modpack
#[allow(dead_code)]
fn process_overrides(manifest: &CurseForgeManifest, temp_dir: &PathBuf, instance_dir: &PathBuf) -> Result<()> {
    process_overrides_with_progress(manifest, temp_dir, instance_dir, |_message, _percentage, _step| {})
}

/// Procesa la carpeta overrides del modpack con callback de progreso
fn process_overrides_with_progress<F>(
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
        
        // Recorrer la carpeta overrides y mover su contenido a la raíz
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
                    if response.status() == 429 {
                        // Rate limiting específico - delay más largo
                        let delay_secs = 5 * (retry_count + 1); // 5s, 10s, 15s
                        println!("Rate limited (429) al descargar archivo - esperando {}s...", delay_secs);
                        tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs)).await;
                    } else {
                        // Otros errores HTTP - delay estándar
                        println!("Error HTTP {} al descargar archivo, reintentando...", response.status());
                        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    }
                    
                    retry_count += 1;
                    if retry_count >= max_retries {
                        return Err(anyhow!("Error al descargar el archivo después de {} intentos: HTTP {}", 
                                           max_retries, response.status()));
                    }
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

/// Calcula el hash SHA1 de un archivo usando lyceris
fn calculate_sha1_hash(file_path: &PathBuf) -> Result<String> {
    calculate_sha1(file_path).map_err(|e| anyhow!("Error calculating SHA1: {}", e))
}

/// Verifica si un archivo existe y tiene el hash correcto
fn verify_file_hash(file_path: &PathBuf, expected_hashes: &[FileHash]) -> bool {
    if !file_path.exists() {
        return false;
    }

    if expected_hashes.is_empty() {
        return false; // Si no hay hashes, mejor descargar
    }

    for hash in expected_hashes.iter() {
        let calculated_hash = match hash.algo {
            1 => { // SHA1
                match calculate_sha1_hash(file_path) {
                    Ok(h) => h,
                    Err(_) => continue,
                }
            },
            // Por ahora solo soportamos SHA1, MD5 se puede agregar después
            _ => continue,
        };
        
        if let Some(expected_value) = &hash.value {
            if calculated_hash.to_lowercase() == expected_value.to_lowercase() {
                return true;
            }
        }
    }

    false
}

/// Procesa un modpack de CurseForge para actualización, verificando mods existentes
pub async fn process_curseforge_modpack_for_update<F>(
    modpack_zip_path: &PathBuf,
    temp_extract_dir: &PathBuf,
    existing_instance_dir: &PathBuf,
    emit_progress: F,
) -> Result<(String, String)> 
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    emit_progress(
        "Procesando modpack de CurseForge para actualización".to_string(),
        0.0,
        "processing_curseforge".to_string()
    );
    
    // Crear un directorio temporal para extraer el modpack
    let temp_dir = temp_extract_dir.join("temp_extract");
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)?;
    }
    fs::create_dir_all(&temp_dir)?;
    
    emit_progress(
        "Extrayendo archivos del modpack".to_string(),
        5.0,
        "extracting_modpack".to_string()
    );
    
    // Extraer el archivo ZIP al directorio temporal
    extract_zip(modpack_zip_path, &temp_dir)?;
    
    // Leer el manifest desde el directorio temporal
    let manifest_path = temp_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err(anyhow!("El archivo manifest.json no existe en el modpack"));
    }
    
    emit_progress(
        "Leyendo información del modpack".to_string(),
        10.0,
        "reading_manifest".to_string()
    );
    
    let manifest_content = fs::read_to_string(&manifest_path)
        .context("No se pudo leer el archivo manifest.json")?;

    let manifest: CurseForgeManifest = serde_json::from_str(&manifest_content)
        .context("Error al parsear manifest.json")?;
    
    emit_progress(
        format!("Modpack: {} v{} (Minecraft {})", manifest.name, manifest.version, manifest.minecraft.version),
        15.0,
        "modpack_info".to_string()
    );
    
    // Procesar los mods con verificación de existentes
    emit_progress(
        format!("Verificando {} mods para actualización", manifest.files.len()),
        20.0,
        "preparing_mods_update".to_string()
    );
    
    let (new_mod_filenames, api_errors_count) = download_mods_for_update_batch(&manifest, temp_extract_dir, existing_instance_dir, emit_progress.clone()).await?;
    
    // Solo eliminar mods obsoletos si el porcentaje de errores es aceptable (< 5%)
    let total_mods = manifest.files.len();
    let error_percentage = (api_errors_count as f64 / total_mods as f64) * 100.0;
    let max_acceptable_error_rate = 5.0; // 5% de errores máximo (más estricto)
    
    if error_percentage < max_acceptable_error_rate {
        emit_progress(
            "Eliminando mods obsoletos...".to_string(),
            85.0,
            "removing_obsolete_mods".to_string()
        );
        
        remove_obsolete_mods_with_filenames(&new_mod_filenames, existing_instance_dir, emit_progress.clone()).await?;
        println!("✅ Eliminación de mods obsoletos completada - {} errores ({}%)", api_errors_count, error_percentage as u32);
    } else {
        emit_progress(
            format!("⚠️ Saltando eliminación de mods obsoletos - {} errores ({}% > {}%)", api_errors_count, error_percentage as u32, max_acceptable_error_rate as u32),
            85.0,
            "skipping_obsolete_removal".to_string()
        );
        println!("🛡️ SEGURIDAD: No se eliminarán mods obsoletos - tasa de errores demasiado alta ({}%)", error_percentage as u32);
    }
    
    // Procesar los overrides desde el directorio temporal
    emit_progress(
        "Procesando archivos adicionales".to_string(),
        95.0,
        "processing_overrides".to_string()
    );
    
    process_overrides_with_progress(&manifest, &temp_dir, temp_extract_dir, emit_progress.clone())?;
    
    // Eliminar el directorio temporal
    fs::remove_dir_all(&temp_dir)?;
    
    // Extraer la información del modloader
    let (modloader, modloader_version) = get_modloader_info(&manifest)?;
    
    emit_progress(
        "Modpack de CurseForge procesado exitosamente".to_string(),
        100.0,
        "curseforge_completed".to_string()
    );
    
    // Devolver la información necesaria para la instalación
    Ok((modloader, modloader_version))
}

/// Descarga mods para actualización, verificando archivos existentes en la instancia actual
/// Retorna el conjunto de nombres de archivo de los mods del nuevo manifest
async fn download_mods_for_update_batch<F>(
    manifest: &CurseForgeManifest, 
    temp_extract_dir: &PathBuf,
    existing_instance_dir: &PathBuf,
    emit_progress: F
) -> Result<(std::collections::HashSet<String>, usize)> 
where
    F: Fn(String, f32, String) + Send + Sync + 'static,
{
    emit_progress(
        format!("Verificando {} mods para actualización desde CurseForge...", manifest.files.len()),
        0.0,
        "downloading_mods".to_string()
    );
    
    // Crear directorio de mods si no existe en temp
    let temp_mods_dir = temp_extract_dir.join("mods");
    if !temp_mods_dir.exists() {
        fs::create_dir_all(&temp_mods_dir)?;
    }
    
    // Obtener directorio de mods existente
    let existing_mods_dir = existing_instance_dir.join("mods");

    let client = Client::builder()
        .user_agent("LKLauncher")
        .timeout(std::time::Duration::from_secs(60))
        .build()?;
    
    // Usar el proxy API de LuminaKraft
    let proxy_base_url = "https://api.luminakraft.com/v1/curseforge";
    emit_progress(
        "Conectando al proxy API de CurseForge".to_string(),
        5.0,
        "connecting_api".to_string()
    );
    
    // Conjunto para rastrear los nombres de archivo del nuevo manifest
    let mut new_mod_filenames = std::collections::HashSet::new();
    let mut api_errors_count = 0;
    
    // 🚀 BATCH REQUEST: Obtener información de TODOS los mods en una sola petición
    emit_progress(
        format!("Obteniendo información de {} mods en batch...", manifest.files.len()),
        10.0,
        "batch_requesting_mods".to_string()
    );
    
    // Extraer todos los file_ids
    let file_ids: Vec<i64> = manifest.files.iter().map(|f| f.file_id).collect();
    
    // Dividir en chunks de 50 (límite de la API)
    const BATCH_SIZE: usize = 50;
    let mut all_file_infos = Vec::new();
    
    for (chunk_index, chunk) in file_ids.chunks(BATCH_SIZE).enumerate() {
        let progress = 10.0 + (chunk_index as f32 / file_ids.chunks(BATCH_SIZE).count() as f32) * 30.0;
        
        emit_progress(
            format!("Batch request {}/{} ({} mods)", 
                   chunk_index + 1, 
                   file_ids.chunks(BATCH_SIZE).count(),
                   chunk.len()),
            progress,
            "batch_api_request".to_string()
        );
        
        // Crear el request body
        let request_body = GetModFilesRequest {
            file_ids: chunk.to_vec(),
        };
        
        // Retry logic para el batch request
        let mut batch_response = None;
        let max_retries = 3;
        
        for attempt in 1..=max_retries {
            let batch_url = format!("{}/mods/files", proxy_base_url);
            
            match client.post(&batch_url)
                .json(&request_body)
                .send()
                .await {
                Ok(resp) => {
                    if resp.status().is_success() || resp.status() == 404 {
                        // Tratar 404 como válido - significa archivos no encontrados, pero es respuesta válida
                        batch_response = Some(resp);
                        break;
                    } else if resp.status() == 429 && attempt < max_retries {
                        let delay_ms = 2000 * attempt * attempt; // Delay mucho más agresivo: 2s, 8s, 18s
                        println!("⏳ Rate limited (429) en batch request - Reintentando en {}ms (intento {}/{})", 
                               delay_ms, attempt, max_retries);
                        emit_progress(
                            format!("⏳ Rate limited - esperando {}s antes de reintentar...", delay_ms / 1000),
                            progress,
                            "rate_limited_waiting".to_string()
                        );
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    } else {
                        println!("❌ Error HTTP {} en batch request", resp.status());
                        api_errors_count += chunk.len(); // Contar todos los mods del chunk como errores
                        break;
                    }
                },
                Err(e) => {
                    if attempt < max_retries {
                        let delay_ms = 200 * attempt;
                        println!("⏳ Error de conexión en batch request - Reintentando en {}ms (intento {}/{})", 
                               delay_ms, attempt, max_retries);
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    } else {
                        println!("❌ Error de API en batch request: {}", e);
                        api_errors_count += chunk.len();
                        break;
                    }
                }
            }
        }
        
        // Procesar la respuesta del batch
        if let Some(response) = batch_response {
            // Primero obtener el texto de la respuesta para debug
            let response_text = match response.text().await {
                Ok(text) => text,
                Err(e) => {
                    println!("❌ Error al leer texto de respuesta (update): {}", e);
                    api_errors_count += chunk.len();
                    continue;
                }
            };
            
            // Debug: mostrar las primeras líneas de la respuesta
            let preview = if response_text.len() > 200 {
                &response_text[..200]
            } else {
                &response_text
            };
            println!("🔍 Respuesta API preview (update): {}...", preview);
            
            // Intentar parsear el JSON
            match serde_json::from_str::<ApiResponse<Vec<ModFileInfo>>>(&response_text) {
                Ok(api_response) => {
                    let data_len = api_response.data.len();
                    all_file_infos.extend(api_response.data);
                    println!("✅ Batch {}/{} completado - {} mods procesados", 
                           chunk_index + 1, 
                           file_ids.chunks(BATCH_SIZE).count(),
                           data_len);
                },
                Err(e) => {
                    // Verificar si es un error 404 (archivos no encontrados)
                    if response_text.contains("\"status\":404") || response_text.contains("\"status\": 404") {
                        println!("⚠️ Algunos archivos no encontrados (404) - esto es normal en modpacks con archivos obsoletos");
                        // No incrementar api_errors_count para 404s
                    } else {
                        println!("❌ Error JSON en batch response (update): {}", e);
                        api_errors_count += chunk.len();
                    }
                }
            }
        }
        
        // Delay más largo entre batches para evitar rate limiting
        if chunk_index < file_ids.chunks(BATCH_SIZE).count() - 1 {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    }
    
    emit_progress(
        format!("✅ Información obtenida para {} mods", all_file_infos.len()),
        40.0,
        "batch_completed".to_string()
    );
    
    // Ahora procesar cada mod individualmente para verificar y descargar
    for (index, file_info) in all_file_infos.iter().enumerate() {
        let progress_percentage = 40.0 + (index as f32 / all_file_infos.len() as f32) * 50.0;
        
        // Mostrar progreso general del modpack (arriba)
        emit_progress(
            format!("downloading_modpack:{}:{}", index + 1, all_file_infos.len()),
            progress_percentage,
            "downloading_modpack_file".to_string()
        );
        
        // Verificar que tenemos información válida del batch request
        let download_url = match &file_info.download_url {
            Some(url) if !url.is_empty() => url,
            _ => {
                // Debug adicional para URLs vacías
                let file_name = file_info.file_name.as_deref().unwrap_or("archivo desconocido");
                let is_available = file_info.is_available.unwrap_or(false);
                let file_status = file_info.file_status.unwrap_or(-1);
                let display_name = file_info.display_name.as_deref().unwrap_or("N/A");
                
                println!("⚠️ ADVERTENCIA: URL vacía para {} - Detalles:", file_name);
                println!("   • Display Name: {}", display_name);
                println!("   • Available: {}", is_available);
                println!("   • File Status: {}", file_status);
                println!("   • Project ID: {}", file_info.mod_id.unwrap_or(-1));
                println!("   • File ID: {}", file_info.id);
                

                
                // Si el archivo no está disponible, es normal que no tenga URL
                if !is_available {
                    println!("   → Archivo marcado como NO DISPONIBLE en CurseForge");
                } else {
                    println!("   → Archivo disponible pero sin URL - posible error de API");
                }
                
                emit_progress(
                    format!("⚠️ Mod no disponible: {}", file_name),
                    progress_percentage,
                    "mod_unavailable".to_string()
                );
                continue;
            }
        };

        let file_name = match &file_info.file_name {
            Some(name) if !name.is_empty() => name,
            _ => {
                println!("⚠️ ADVERTENCIA: Nombre de archivo vacío - saltando");
                continue;
            }
        };
        
        // Añadir el nombre del archivo al conjunto para rastreo
        new_mod_filenames.insert(file_name.clone());
        
        // Verificar primero en la ubicación existente, luego en temp
        let existing_mod_path = existing_mods_dir.join(file_name);
        let temp_mod_path = temp_mods_dir.join(file_name);
        
                 // Verificar si el archivo ya existe en la instancia actual y tiene el hash correcto
         if verify_file_hash(&existing_mod_path, &file_info.hashes) {
             println!("✅ Mod {} ya verificado - reutilizando", file_name);
             
             // Copiar desde la instancia actual al temp (evitar descarga)
             fs::copy(&existing_mod_path, &temp_mod_path)?;
             
             emit_progress(
                 format!("mod_exists:{}", file_name),
                 progress_percentage + 5.0,
                 "mod_already_exists".to_string()
             );
             continue;
         } else {
             println!("Descargando mod: {}", file_name);
         }
        
        // Si llegamos aquí, necesitamos descargar el mod
        emit_progress(
            format!("mod_name:{}", file_name),
            progress_percentage + 3.0,
            "downloading_mod_file".to_string()
        );
        
        // Descargar el archivo al directorio temporal
        match download_file(download_url, &temp_mod_path).await {
            Ok(_) => {
                // Verificar el hash después de la descarga
                if verify_file_hash(&temp_mod_path, &file_info.hashes) {
                    emit_progress(
                        format!("mod_completed:{}", file_name),
                        progress_percentage + 5.0,
                        "mod_downloaded_verified".to_string()
                    );
                } else {
                    emit_progress(
                        format!("mod_error:{}", file_name),
                        progress_percentage + 5.0,
                        "mod_hash_mismatch".to_string()
                    );
                    // Eliminar archivo corrupto
                    if temp_mod_path.exists() {
                        std::fs::remove_file(&temp_mod_path).ok();
                    }
                }
            },
            Err(e) => {
                emit_progress(
                    format!("❌ Error al descargar {}: {}", file_name, e),
                    progress_percentage,
                    "error_downloading_mod".to_string()
                );
            }
        }
    }
    
    emit_progress(
        "✅ Proceso de verificación/actualización de mods completado".to_string(),
        95.0,
        "mods_update_completed".to_string()
    );
    
    // Verificar si hay demasiados errores de API para considerar la operación fallida
    let total_files = all_file_infos.len() + api_errors_count;
    let failure_threshold = 20.0; // 20% de errores = fallo crítico
    let critical_error_percentage = (api_errors_count as f64 / total_files as f64) * 100.0;
    
    if critical_error_percentage >= failure_threshold {
        emit_progress(
            format!("❌ FALLO CRÍTICO: {}% de errores de API ({}/{})", 
                   critical_error_percentage as u32, api_errors_count, total_files),
            0.0,
            "critical_api_failure".to_string()
        );
        println!("🚨 FALLO CRÍTICO: Demasiados errores de rate limiting - requiere reparación");
        return Err(anyhow::anyhow!(
            "Rate limiting crítico: {}% de errores ({}/{}) - Use 'Reparar' para reintentar", 
            critical_error_percentage as u32, api_errors_count, total_files
        ));
    }
    
    // Advertir sobre errores de API que pueden afectar la detección de mods obsoletos
    if api_errors_count > 0 {
        println!("⚠️ ADVERTENCIA: {} errores de API durante la verificación de mods", api_errors_count);
        emit_progress(
            format!("⚠️ {} errores de API - saltando eliminación de mods obsoletos para seguridad", api_errors_count),
            98.0,
            "api_errors_detected".to_string()
        );
    }
    
    Ok((new_mod_filenames, api_errors_count))
}

/// Elimina mods obsoletos usando una lista preexistente de nombres de archivo
async fn remove_obsolete_mods_with_filenames<F>(
    new_mod_filenames: &std::collections::HashSet<String>,
    existing_instance_dir: &PathBuf,
    emit_progress: F,
) -> Result<()>
where
    F: Fn(String, f32, String) + Send + Sync + 'static,
{
    let existing_mods_dir = existing_instance_dir.join("mods");
    
    if !existing_mods_dir.exists() {
        return Ok(());
    }
    
    emit_progress(
        format!("Verificando {} mods nuevos vs existentes", new_mod_filenames.len()),
        0.0,
        "comparing_mods".to_string()
    );
    
    // DEBUG: Imprimir los nombres de los mods del nuevo manifest
    println!("🔍 DEBUG: Mods del nuevo manifest ({}):", new_mod_filenames.len());
    for (i, filename) in new_mod_filenames.iter().enumerate() {
        if i < 10 { // Solo mostrar los primeros 10 para no saturar
            println!("  ✅ {}", filename);
        } else if i == 10 {
            println!("  ... y {} más", new_mod_filenames.len() - 10);
            break;
        }
    }
    
    // Revisar los archivos existentes en la carpeta mods
    let mut obsolete_mods = Vec::new();
    
    for entry in fs::read_dir(&existing_mods_dir)? {
        let entry = entry?;
        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy();
        
        // Solo procesar archivos .jar
        if file_name_str.ends_with(".jar") {
            if !new_mod_filenames.contains(file_name_str.as_ref()) {
                println!("⚠️ DEBUG: Marcando como obsoleto: {}", file_name_str);
                obsolete_mods.push((entry.path(), file_name_str.to_string()));
            } else {
                println!("✅ DEBUG: Mod válido encontrado: {}", file_name_str);
            }
        }
    }
    
    if obsolete_mods.is_empty() {
        emit_progress(
            "No hay mods obsoletos para eliminar".to_string(),
            100.0,
            "no_obsolete_mods".to_string()
        );
        println!("✅ No hay mods obsoletos");
        return Ok(());
    }
    
    emit_progress(
        format!("Eliminando {} mods obsoletos", obsolete_mods.len()),
        50.0,
        "removing_mods".to_string()
    );
    
    // Eliminar los mods obsoletos
    for (i, (mod_path, mod_name)) in obsolete_mods.iter().enumerate() {
        let progress = 50.0 + (i as f32 / obsolete_mods.len() as f32) * 50.0;
        
        emit_progress(
            format!("Eliminando mod obsoleto: {}", mod_name),
            progress,
            "removing_obsolete_mod".to_string()
        );
        
        match fs::remove_file(mod_path) {
            Ok(_) => {
                println!("🗑️ Eliminado mod obsoleto: {}", mod_name);
            },
            Err(e) => {
                println!("⚠️ Error eliminando {}: {}", mod_name, e);
            }
        }
    }
    
    emit_progress(
        format!("Eliminados {} mods obsoletos exitosamente", obsolete_mods.len()),
        100.0,
        "obsolete_mods_removed".to_string()
    );
    
    Ok(())
} 