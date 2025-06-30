// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Emitter};
use serde::{Deserialize, Serialize};
use anyhow::Result;

mod launcher;
mod meta;
mod filesystem;
mod minecraft;
mod modpack;
mod utils;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Modpack {
    pub id: String,
    pub nombre: String,
    pub descripcion: String,
    pub version: String,
    #[serde(rename = "minecraftVersion")]
    pub minecraft_version: String,
    pub modloader: String,
    #[serde(rename = "modloaderVersion")]
    pub modloader_version: String,
    #[serde(rename = "urlIcono")]
    pub url_icono: String,
    #[serde(rename = "urlModpackZip")]
    pub url_modpack_zip: String,
    pub changelog: String,
    #[serde(rename = "jvmArgsRecomendados")]
    pub jvm_args_recomendados: String,
    
    // Campos adicionales que aparecen en el TypeScript pero no estaban en Rust
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub gamemode: String,
    #[serde(rename = "isNew", default)]
    pub is_new: bool,
    #[serde(rename = "isActive", default)]
    pub is_active: bool,
    #[serde(rename = "isComingSoon", default)]
    pub is_coming_soon: bool,
    #[serde(default)]
    pub images: Vec<String>,
    #[serde(default)]
    pub logo: String,
    #[serde(rename = "featureIcons", default)]
    pub feature_icons: Vec<String>,
    #[serde(default)]
    pub collaborators: Vec<Collaborator>,
    #[serde(rename = "youtubeEmbed", default)]
    pub youtube_embed: Option<String>,
    #[serde(rename = "tiktokEmbed", default)]
    pub tiktok_embed: Option<String>,
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(rename = "leaderboardPath", default)]
    pub leaderboard_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Collaborator {
    pub name: String,
    pub logo: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MicrosoftAccount {
    pub xuid: String,
    pub exp: u64,
    pub uuid: String,
    pub username: String,
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
    #[serde(rename = "clientId")]
    pub client_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserSettings {
    pub username: String,
    #[serde(rename = "allocatedRam")]
    pub allocated_ram: u32,
    #[serde(rename = "javaPath")]
    pub java_path: Option<String>,
    #[serde(rename = "launcherDataUrl")]
    pub launcher_data_url: String,
    #[serde(rename = "authMethod")]
    pub auth_method: String, // "offline" or "microsoft"
    #[serde(rename = "microsoftAccount")]
    pub microsoft_account: Option<MicrosoftAccount>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstanceMetadata {
    pub id: String,
    pub version: String,
    #[serde(rename = "installedAt")]
    pub installed_at: String,
    pub modloader: String,
    #[serde(rename = "modloaderVersion")]
    pub modloader_version: String,
    #[serde(rename = "minecraftVersion")]
    pub minecraft_version: String,
}

#[tauri::command]
async fn get_instance_metadata(modpack_id: String) -> Result<Option<String>, String> {
    match filesystem::get_instance_metadata(&modpack_id).await {
        Ok(metadata) => {
            if let Some(metadata) = metadata {
                match serde_json::to_string(&metadata) {
                    Ok(json) => Ok(Some(json)),
                    Err(e) => Err(format!("Failed to serialize metadata: {}", e)),
                }
            } else {
                Ok(None)
            }
        }
        Err(e) => Err(format!("Failed to get instance metadata: {}", e)),
    }
}

#[tauri::command]
async fn install_modpack(modpack: Modpack) -> Result<(), String> {
    // Validate modpack before installation
    if let Err(e) = launcher::validate_modpack(&modpack) {
        return Err(format!("Invalid modpack configuration: {}", e));
    }
    
    match launcher::install_modpack(modpack).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to install modpack: {}", e)),
    }
}

#[tauri::command]
async fn install_modpack_with_minecraft(app: tauri::AppHandle, modpack: Modpack, settings: UserSettings) -> Result<(), String> {
    // Validate modpack before installation
    if let Err(e) = launcher::validate_modpack(&modpack) {
        return Err(format!("Invalid modpack configuration: {}", e));
    }
    
    // Crear un closure para emitir eventos de progreso con mensajes general y detallado
    let emit_progress = {
        let app = app.clone();
        let modpack_id = modpack.id.clone();
        
        // Estado para mantener el último detailMessage válido
        let last_detail_message = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let last_general_message = std::sync::Arc::new(std::sync::Mutex::new("Instalando...".to_string()));
        
        move |message: String, percentage: f32, step: String| {
            // Determinar el mensaje general y detallado basado en el tipo de mensaje
            let (general_message, detail_message) = if message.starts_with("Progress:") {
                // Para líneas Progress, parsear para crear mensaje general útil
                if let Some(parsed_general) = parse_progress_line(&message) {
                    // Actualizar el último mensaje general válido
                    if let Ok(mut last) = last_general_message.lock() {
                        *last = parsed_general.clone();
                    }
                    
                    // Mantener el último detailMessage válido en lugar de enviar vacío
                    let preserved_detail = if let Ok(last) = last_detail_message.lock() {
                        last.clone()
                    } else {
                        "".to_string()
                    };
                    
                    (parsed_general, preserved_detail) // Mantener detalle anterior para Progress
                } else {
                    // Mantener el último mensaje general válido
                    let preserved_general = if let Ok(last) = last_general_message.lock() {
                        last.clone()
                    } else {
                        "Instalando...".to_string()
                    };
                    
                    // Mantener el último detailMessage válido
                    let preserved_detail = if let Ok(last) = last_detail_message.lock() {
                        last.clone()
                    } else {
                        "".to_string()
                    };
                    
                    (preserved_general, preserved_detail)
                }
            } else if message.starts_with("Descargando ") && step == "downloading_minecraft_file" {
                // Para líneas de descarga individual de Minecraft, remover "Descargando " y determinar estado
                let file_name = message.strip_prefix("Descargando ").unwrap_or(&message);
                
                // Determinar el estado del archivo basado en su contenido
                let detail_msg = if file_name.contains("completado") || file_name.contains("✅") {
                    format!("✅ {}", file_name.replace("completado", "").replace("✅", "").trim())
                } else if file_name.contains("error") || file_name.contains("❌") {
                    format!("❌ {}", file_name.replace("error", "").replace("❌", "").trim())
                } else {
                    // Archivo en proceso de descarga
                    file_name.to_string()
                };
                
                // Actualizar el último mensaje válido
                if let Ok(mut last) = last_detail_message.lock() {
                    *last = detail_msg.clone();
                }
                
                ("".to_string(), detail_msg)
            } else if message.starts_with("downloading_modpack:") {
                // Formato: "downloading_modpack:current:total" - mantener último detailMessage válido
                let parts: Vec<&str> = message.split(':').collect();
                if parts.len() >= 3 {
                    let current = parts[1];
                    let total = parts[2];
                    let general_msg = format!("Descargando modpack... ({}/{})", current, total);
                    
                    // Mantener el último detailMessage válido en lugar de enviar vacío
                    let preserved_detail = if let Ok(last) = last_detail_message.lock() {
                        last.clone()
                    } else {
                        "".to_string()
                    };
                    
                    (general_msg, preserved_detail)
                } else {
                    ("Descargando mods...".to_string(), "".to_string())
                }
            } else if message.starts_with("mod_name:") {
                // Para archivos individuales de mods: "mod_name:filename"
                let file_name = message.strip_prefix("mod_name:").unwrap_or(&message);
                let detail_msg = format!("mod_name:{}", file_name);
                
                // Actualizar el último detailMessage válido
                if let Ok(mut last) = last_detail_message.lock() {
                    *last = detail_msg.clone();
                }
                
                // Mantener el último mensaje general válido
                let preserved_general = if let Ok(last) = last_general_message.lock() {
                    last.clone()
                } else {
                    "Descargando mods...".to_string()
                };
                
                (preserved_general, detail_msg)
            } else if message.starts_with("mod_completed:") {
                // Para mods completados: "mod_completed:filename"
                let file_name = message.strip_prefix("mod_completed:").unwrap_or(&message);
                let detail_msg = format!("mod_completed:{}", file_name);
                
                // Actualizar el último detailMessage válido
                if let Ok(mut last) = last_detail_message.lock() {
                    *last = detail_msg.clone();
                }
                
                // Mantener el último mensaje general válido
                let preserved_general = if let Ok(last) = last_general_message.lock() {
                    last.clone()
                } else {
                    "Descargando mods...".to_string()
                };
                
                (preserved_general, detail_msg)
            } else if message.starts_with("mod_exists:") {
                // Para mods que ya existen: "mod_exists:filename"
                let file_name = message.strip_prefix("mod_exists:").unwrap_or(&message);
                let detail_msg = format!("mod_exists:{}", file_name);
                
                // Actualizar el último detailMessage válido
                if let Ok(mut last) = last_detail_message.lock() {
                    *last = detail_msg.clone();
                }
                
                // Mantener el último mensaje general válido
                let preserved_general = if let Ok(last) = last_general_message.lock() {
                    last.clone()
                } else {
                    "Descargando mods...".to_string()
                };
                
                (preserved_general, detail_msg)
            } else if message.starts_with("mod_unavailable:") {
                // Para mods no disponibles: "mod_unavailable:filename"
                let file_name = message.strip_prefix("mod_unavailable:").unwrap_or(&message);
                let detail_msg = format!("mod_unavailable:{}", file_name);
                
                // Actualizar el último detailMessage válido
                if let Ok(mut last) = last_detail_message.lock() {
                    *last = detail_msg.clone();
                }
                
                // Mantener el último mensaje general válido
                let preserved_general = if let Ok(last) = last_general_message.lock() {
                    last.clone()
                } else {
                    "Descargando mods...".to_string()
                };
                
                (preserved_general, detail_msg)
            } else if message.starts_with("mod_error:") || message.starts_with("mod_download_error:") {
                // Para errores de mods: "mod_error:filename" o "mod_download_error:filename:error"
                let error_parts: Vec<&str> = message.split(':').collect();
                let file_name = if error_parts.len() >= 2 {
                    error_parts[1]
                } else {
                    "archivo desconocido"
                };
                let detail_msg = format!("mod_error:{}", file_name);
                
                // Actualizar el último detailMessage válido
                if let Ok(mut last) = last_detail_message.lock() {
                    *last = detail_msg.clone();
                }
                
                // Mantener el último mensaje general válido
                let preserved_general = if let Ok(last) = last_general_message.lock() {
                    last.clone()
                } else {
                    "Descargando mods...".to_string()
                };
                
                (preserved_general, detail_msg)
            } else if message == "preparing_mod_downloads" || step == "preparing_mod_downloads" {
                // Let the frontend handle translation via step
                ("".to_string(), "".to_string())
            } else {
                // Para otros mensajes, determinar basado en el step
                let general = match step.as_str() {
                    "preparing_installation" | "verifying_modpack_config" | "configuring_minecraft" => "Preparando Minecraft...",
                    "downloading_minecraft" | "installing_minecraft" => "Instalando Minecraft...",
                    "downloading_modpack" | "processing_modpack" | "processing_curseforge" | "extracting_modpack" | "reading_manifest" | "processing_overrides" => "Procesando modpack...",
                    "updating" | "downloading_update" | "processing_update" | "updating_curseforge_mods" | 
                    "replacing_mods" | "updating_configs" | "removing_old_mods" | "copying_new_mods" |
                    "backing_up_minecraft" | "extracting_new_version" | "restoring_minecraft" |
                    "finalizing_update" => "Actualizando modpack...",
                    "downloading_mods" | "downloading_modpack_file" | "downloading_mod_file" | "preparing_mod_downloads" | 
                    "mod_already_exists" | "mod_unavailable" | "mod_downloaded_verified" | "mod_hash_mismatch" | "mod_download_error" => "Descargando mods...",
                    "finalizing" | "completed" | "curseforge_completed" | "saving_instance_config" | "finalizing_installation" => "Finalizando...",
                    _ => "Instalando...",
                };
                (general.to_string(), "".to_string())
            };
            
            // ETA será calculado en el frontend por ahora
            
            let _ = app.emit(&format!("modpack_progress_{}", modpack_id), serde_json::json!({
                "message": message,
                "percentage": percentage,
                "step": step,
                "generalMessage": general_message,
                "detailMessage": detail_message,
                "eta": ""
            }));
        }
    };
    
    match launcher::install_modpack_with_shared_storage(modpack, settings, emit_progress).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to install modpack: {}", e)),
    }
}

#[tauri::command]
async fn install_modpack_with_shared_storage(app: tauri::AppHandle, modpack: Modpack, settings: UserSettings) -> Result<Vec<serde_json::Value>, String> {
    // Validate modpack before installation
    if let Err(e) = launcher::validate_modpack(&modpack) {
        return Err(format!("Invalid modpack configuration: {}", e));
    }
    
    let emit_progress = {
        let app = app.clone();
        let modpack_id = modpack.id.clone();
        
        move |message: String, percentage: f32, step: String| {
            let _ = app.emit("install-progress", serde_json::json!({
                "modpackId": modpack_id,
                "message": message,
                "percentage": percentage,
                "step": step
            }));
        }
    };
    
    match launcher::install_modpack_with_shared_storage(modpack, settings, emit_progress).await {
        Ok(failed_mods) => Ok(failed_mods),
        Err(e) => Err(format!("Failed to install modpack: {}", e)),
    }
}

#[tauri::command]
async fn install_modpack_with_failed_tracking(app: tauri::AppHandle, modpack: Modpack, settings: UserSettings) -> Result<Vec<serde_json::Value>, String> {
    // Validate modpack before installation
    if let Err(e) = launcher::validate_modpack(&modpack) {
        return Err(format!("Invalid modpack configuration: {}", e));
    }
    
    // Crear un closure para emitir eventos de progreso con mensajes general y detallado
    let emit_progress = {
        let app = app.clone();
        let modpack_id = modpack.id.clone();
        
        // Estado para mantener el último detailMessage válido
        let last_detail_message = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let last_general_message = std::sync::Arc::new(std::sync::Mutex::new("Instalando...".to_string()));
        
        move |message: String, percentage: f32, step: String| {
            // Determinar el mensaje general y detallado basado en el tipo de mensaje
            let (general_message, detail_message) = if message.starts_with("Progress:") {
                // Para líneas Progress, parsear para crear mensaje general útil
                if let Some(parsed_general) = parse_progress_line(&message) {
                    // Actualizar el último mensaje general válido
                    if let Ok(mut last) = last_general_message.lock() {
                        *last = parsed_general.clone();
                    }
                    
                    // Mantener el último detailMessage válido en lugar de enviar vacío
                    let preserved_detail = if let Ok(last) = last_detail_message.lock() {
                        last.clone()
                    } else {
                        "".to_string()
                    };
                    
                    (parsed_general, preserved_detail) // Mantener detalle anterior para Progress
                } else {
                    // Mantener el último mensaje general válido
                    let preserved_general = if let Ok(last) = last_general_message.lock() {
                        last.clone()
                    } else {
                        "Instalando...".to_string()
                    };
                    
                    // Mantener el último detailMessage válido
                    let preserved_detail = if let Ok(last) = last_detail_message.lock() {
                        last.clone()
                    } else {
                        "".to_string()
                    };
                    
                    (preserved_general, preserved_detail)
                }
            } else if message.starts_with("Descargando ") && step == "downloading_minecraft_file" {
                // Para líneas de descarga individual de Minecraft, remover "Descargando " y determinar estado
                let file_name = message.strip_prefix("Descargando ").unwrap_or(&message);
                
                // Determinar el estado del archivo basado en su contenido
                let detail_msg = if file_name.contains("completado") || file_name.contains("✅") {
                    format!("✅ {}", file_name.replace("completado", "").replace("✅", "").trim())
                } else if file_name.contains("error") || file_name.contains("❌") {
                    format!("❌ {}", file_name.replace("error", "").replace("❌", "").trim())
                } else {
                    file_name.to_string()
                };
                
                // Actualizar el último detailMessage válido
                if let Ok(mut last) = last_detail_message.lock() {
                    *last = detail_msg.clone();
                }
                
                // Mantener el último mensaje general válido
                let preserved_general = if let Ok(last) = last_general_message.lock() {
                    last.clone()
                } else {
                    "Instalando Minecraft...".to_string()
                };
                
                (preserved_general, detail_msg)
            } else if message.starts_with("downloading_modpack:") {
                // Para contador de mods: "downloading_modpack:current:total"
                let parts: Vec<&str> = message.split(':').collect();
                if parts.len() == 3 {
                    let current = parts[1];
                    let total = parts[2];
                    let general_msg = format!("Descargando modpack... ({}/{})", current, total);
                    
                    // Actualizar el último mensaje general válido
                    if let Ok(mut last) = last_general_message.lock() {
                        *last = general_msg.clone();
                    }
                    
                    // Mantener el último detailMessage válido
                    let preserved_detail = if let Ok(last) = last_detail_message.lock() {
                        last.clone()
                    } else {
                        "".to_string()
                    };
                    
                    (general_msg, preserved_detail)
                } else {
                    // Fallback - mantener mensajes anteriores
                    let preserved_general = if let Ok(last) = last_general_message.lock() {
                        last.clone()
                    } else {
                        "Descargando modpack...".to_string()
                    };
                    
                    let preserved_detail = if let Ok(last) = last_detail_message.lock() {
                        last.clone()
                    } else {
                        "".to_string()
                    };
                    
                    (preserved_general, preserved_detail)
                }
            } else if message.starts_with("mod_name:") {
                // Para archivos individuales de mods: "mod_name:filename"
                let file_name = message.strip_prefix("mod_name:").unwrap_or(&message);
                let detail_msg = format!("mod_name:{}", file_name);
                
                // Actualizar el último detailMessage válido
                if let Ok(mut last) = last_detail_message.lock() {
                    *last = detail_msg.clone();
                }
                
                // Mantener el último mensaje general válido
                let preserved_general = if let Ok(last) = last_general_message.lock() {
                    last.clone()
                } else {
                    "Descargando mods...".to_string()
                };
                
                (preserved_general, detail_msg)
            } else if message.starts_with("mod_completed:") {
                // Para mods completados: "mod_completed:filename"
                let file_name = message.strip_prefix("mod_completed:").unwrap_or(&message);
                let detail_msg = format!("mod_completed:{}", file_name);
                
                // Actualizar el último detailMessage válido
                if let Ok(mut last) = last_detail_message.lock() {
                    *last = detail_msg.clone();
                }
                
                // Mantener el último mensaje general válido
                let preserved_general = if let Ok(last) = last_general_message.lock() {
                    last.clone()
                } else {
                    "Descargando mods...".to_string()
                };
                
                (preserved_general, detail_msg)
            } else if message.starts_with("mod_exists:") {
                // Para mods que ya existen: "mod_exists:filename"
                let file_name = message.strip_prefix("mod_exists:").unwrap_or(&message);
                let detail_msg = format!("mod_exists:{}", file_name);
                
                // Actualizar el último detailMessage válido
                if let Ok(mut last) = last_detail_message.lock() {
                    *last = detail_msg.clone();
                }
                
                // Mantener el último mensaje general válido
                let preserved_general = if let Ok(last) = last_general_message.lock() {
                    last.clone()
                } else {
                    "Descargando mods...".to_string()
                };
                
                (preserved_general, detail_msg)
            } else if message.starts_with("mod_unavailable:") {
                // Para mods no disponibles: "mod_unavailable:filename"
                let file_name = message.strip_prefix("mod_unavailable:").unwrap_or(&message);
                let detail_msg = format!("mod_unavailable:{}", file_name);
                
                // Actualizar el último detailMessage válido
                if let Ok(mut last) = last_detail_message.lock() {
                    *last = detail_msg.clone();
                }
                
                // Mantener el último mensaje general válido
                let preserved_general = if let Ok(last) = last_general_message.lock() {
                    last.clone()
                } else {
                    "Descargando mods...".to_string()
                };
                
                (preserved_general, detail_msg)
            } else if message.starts_with("mod_error:") || message.starts_with("mod_download_error:") {
                // Para errores de mods: "mod_error:filename" o "mod_download_error:filename:error"
                let error_parts: Vec<&str> = message.split(':').collect();
                let file_name = if error_parts.len() >= 2 {
                    error_parts[1]
                } else {
                    "archivo desconocido"
                };
                let detail_msg = format!("mod_error:{}", file_name);
                
                // Actualizar el último detailMessage válido
                if let Ok(mut last) = last_detail_message.lock() {
                    *last = detail_msg.clone();
                }
                
                // Mantener el último mensaje general válido
                let preserved_general = if let Ok(last) = last_general_message.lock() {
                    last.clone()
                } else {
                    "Descargando mods...".to_string()
                };
                
                (preserved_general, detail_msg)
            } else {
                // Para otros mensajes, tratarlos como generales y actualizar tanto general como detalle
                // Actualizar ambos mensajes
                if let Ok(mut last_general) = last_general_message.lock() {
                    *last_general = message.clone();
                }
                if let Ok(mut last_detail) = last_detail_message.lock() {
                    *last_detail = "".to_string(); // Limpiar detalle para mensajes generales
                }
                
                (message.clone(), "".to_string())
            };
            
            // Emitir el evento con los mensajes determinados
            let _ = app.emit(&format!("modpack-progress-{}", modpack_id), serde_json::json!({
                "generalMessage": general_message,
                "detailMessage": detail_message,
                "percentage": percentage,
                "step": step
            }));
        }
    };
    
    match launcher::install_modpack_with_shared_storage(modpack, settings, emit_progress).await {
        Ok(failed_mods) => Ok(failed_mods),
        Err(e) => Err(format!("Failed to install modpack: {}", e)),
    }
}

#[tauri::command]
async fn launch_modpack(modpack: Modpack, settings: UserSettings) -> Result<(), String> {
    // Validate modpack before launching
    if let Err(e) = launcher::validate_modpack(&modpack) {
        return Err(format!("Invalid modpack configuration: {}", e));
    }
    
    match launcher::launch_modpack_with_shared_storage(modpack, settings).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to launch modpack: {}", e)),
    }
}

#[tauri::command]
async fn delete_instance(modpack_id: String) -> Result<(), String> {
    match filesystem::delete_instance(&modpack_id).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to delete instance: {}", e)),
    }
}

#[tauri::command]
async fn get_launcher_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
async fn get_platform() -> Result<String, String> {
    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    Ok(platform.to_string())
}

#[tauri::command]
async fn check_java() -> Result<bool, String> {
    match minecraft::check_java_availability().await {
        Ok(available) => Ok(available),
        Err(e) => Err(format!("Failed to check Java: {}", e)),
    }
}

#[tauri::command]
async fn get_supported_loaders() -> Result<Vec<String>, String> {
    Ok(minecraft::get_supported_loaders().iter().map(|s| s.to_string()).collect())
}

#[tauri::command]
async fn validate_modpack_config(modpack: Modpack) -> Result<bool, String> {
    match launcher::validate_modpack(&modpack) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false), // Return false instead of error for validation check
    }
}

#[tauri::command]
async fn check_instance_needs_update(modpack: Modpack) -> Result<bool, String> {
    match filesystem::get_instance_metadata(&modpack.id).await {
        Ok(Some(metadata)) => {
            Ok(minecraft::check_instance_needs_update(&modpack, &metadata).await)
        }
        Ok(None) => Ok(true), // No instance exists, needs "update" (install)
        Err(e) => Err(format!("Failed to check instance metadata: {}", e)),
    }
}

#[tauri::command]
async fn check_curseforge_modpack(modpack_url: String) -> Result<bool, String> {
    use dirs::data_dir;
    use std::fs;
    
    let app_data_dir = data_dir()
        .ok_or_else(|| "Failed to get app data directory".to_string())?;
    
    let temp_dir = app_data_dir
        .join("LKLauncher")
        .join("temp");
    
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    }
    
    let temp_file = temp_dir.join("temp_check_curseforge.zip");
    
    // Descargar el archivo
            match utils::downloader::download_file(&modpack_url, &temp_file).await {
        Ok(_) => {
            // Verificar si contiene manifest.json usando lyceris
            let is_curseforge = match lyceris::util::extract::read_file_from_jar(&temp_file, "manifest.json") {
                Ok(_) => true,  // Si se puede leer manifest.json, es un modpack de CurseForge
                Err(_) => false, // Si no se encuentra, no es un modpack de CurseForge
            };
            
            // Limpiar el archivo temporal
            if temp_file.exists() {
                let _ = fs::remove_file(&temp_file);
            }
            
            Ok(is_curseforge)
        },
        Err(e) => Err(format!("Failed to download modpack: {}", e)),
    }
}

#[tauri::command]
async fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    match app.opener().open_url(url, None::<&str>) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to open URL: {}", e)),
    }
}

#[tauri::command]
async fn create_microsoft_auth_link() -> Result<String, String> {
    match lyceris::auth::microsoft::create_link() {
        Ok(url) => Ok(url),
        Err(e) => Err(format!("Failed to create Microsoft auth link: {}", e)),
    }
}

#[tauri::command]
async fn authenticate_microsoft(code: String) -> Result<MicrosoftAccount, String> {
    let client = reqwest::Client::new();
    match lyceris::auth::microsoft::authenticate(code, &client).await {
        Ok(account) => Ok(MicrosoftAccount {
            xuid: account.xuid,
            exp: account.exp,
            uuid: account.uuid,
            username: account.username,
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            client_id: account.client_id,
        }),
        Err(e) => Err(format!("Failed to authenticate with Microsoft: {}", e)),
    }
}

#[tauri::command]
async fn refresh_microsoft_token(refresh_token: String) -> Result<MicrosoftAccount, String> {
    let client = reqwest::Client::new();
    match lyceris::auth::microsoft::refresh(refresh_token, &client).await {
        Ok(account) => Ok(MicrosoftAccount {
            xuid: account.xuid,
            exp: account.exp,
            uuid: account.uuid,
            username: account.username,
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            client_id: account.client_id,
        }),
        Err(e) => Err(format!("Failed to refresh Microsoft token: {}", e)),
    }
}

#[tauri::command]
async fn validate_microsoft_token(exp: u64) -> Result<bool, String> {
    Ok(lyceris::auth::microsoft::validate(exp))
}

#[tauri::command]
async fn open_microsoft_auth_and_get_url() -> Result<String, String> {
    // Create Microsoft auth URL and open it
    let auth_url = match lyceris::auth::microsoft::create_link() {
        Ok(url) => url,
        Err(e) => return Err(format!("Failed to create auth URL: {}", e)),
    };

    Ok(auth_url)
}

#[tauri::command]
async fn extract_code_from_redirect_url(url: String) -> Result<String, String> {
    // Extract code from the URL
    if let Some(code) = url.split("code=").nth(1).and_then(|s| s.split('&').next()) {
        Ok(code.to_string())
    } else if url.contains("error=") {
        let error = url.split("error=").nth(1)
            .and_then(|s| s.split('&').next())
            .unwrap_or("Authentication failed");
        Err(format!("Microsoft authentication error: {}", error))
    } else {
        Err("No authorization code found in URL".to_string())
    }
}

#[tauri::command]
async fn open_microsoft_auth_modal(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::{WebviewWindowBuilder, WebviewUrl};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;
    
    // Create Microsoft auth URL
    let auth_url = match lyceris::auth::microsoft::create_link() {
        Ok(url) => url,
        Err(e) => return Err(format!("Failed to create auth URL: {}", e)),
    };

    // Store the result
    let result = Arc::new(Mutex::new(None::<Result<String, String>>));

    // Create a new webview window for authentication
    let auth_window = WebviewWindowBuilder::new(
        &app,
        "microsoft-auth",
        WebviewUrl::External(auth_url.parse().map_err(|e| format!("Invalid URL: {}", e))?),
    )
    .title("Microsoft Authentication")
    .inner_size(600.0, 800.0)
    .center()
    .resizable(true)
    .minimizable(false)
    .maximizable(true)
    .always_on_top(false)
    .build()
    .map_err(|e| format!("Failed to create auth window: {}", e))?;


    
    // Monitor the window URL directly using a polling approach
    let result_check = Arc::clone(&result);
    let window_check = auth_window.clone();
    
    tokio::spawn(async move {
        loop {
            // Get current URL from the window
            if let Ok(current_url) = window_check.url() {
                let url_str = current_url.as_str();
                
                // Check if URL contains code parameter or is the redirect URL
                if url_str.contains("code=") || url_str.contains("login.live.com/oauth20_desktop.srf") {
                    if let Some(code) = url_str.split("code=").nth(1).and_then(|s| s.split('&').next()) {
                        if let Ok(mut result_guard) = result_check.lock() {
                            *result_guard = Some(Ok(code.to_string()));
                        }
                        let _ = window_check.close();
                        break;
                    } else if url_str.contains("error=") {
                        let error = url_str.split("error=").nth(1)
                            .and_then(|s| s.split('&').next())
                            .unwrap_or("Authentication failed");
                        if let Ok(mut result_guard) = result_check.lock() {
                            *result_guard = Some(Err(format!("Microsoft authentication error: {}", error)));
                        }
                        let _ = window_check.close();
                        break;
                    }
                }
            }
            
            // Check if window is still visible
            if !window_check.is_visible().unwrap_or(false) {
                break;
            }
            
            // Wait 100ms before next check
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    });

    // Wait for the result with timeout
    let start_time = std::time::Instant::now();
    let timeout = Duration::from_secs(300); // 5 minutes timeout

    loop {
        // Check if we have a result
        if let Ok(result_guard) = result.lock() {
            if let Some(auth_result) = result_guard.as_ref() {
                return auth_result.clone();
            }
        }

        // Check for timeout
        if start_time.elapsed() > timeout {
            let _ = auth_window.close();
            return Err("Authentication timeout".to_string());
        }

        // Check if window is still open
        if !auth_window.is_visible().unwrap_or(false) {
            return Err("Authentication window was closed".to_string());
        }

        // Wait a bit before checking again
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

#[tauri::command]
async fn remove_modpack(modpack_id: String) -> Result<(), String> {
    println!("🔧 Backend: Removing modpack with ID: {}", modpack_id);
    match filesystem::remove_modpack_completely(&modpack_id).await {
        Ok(_) => {
            println!("✅ Backend: Modpack {} removed successfully", modpack_id);
            Ok(())
        },
        Err(e) => {
            println!("❌ Backend: Failed to remove modpack {}: {}", modpack_id, e);
            Err(format!("Failed to remove modpack: {}", e))
        }
    }
}

#[tauri::command]
async fn open_instance_folder(modpack_id: String) -> Result<(), String> {
    println!("📂 Opening instance folder for: {}", modpack_id);
    
    let app_data_dir = dirs::data_dir()
        .ok_or_else(|| "Failed to get app data directory".to_string())?;
    
    let instance_dir = app_data_dir
        .join("LKLauncher")
        .join("instances")
        .join(&modpack_id);
    
    if !instance_dir.exists() {
        return Err("La instancia no existe".to_string());
    }
    
    // Usar el comando apropiado según el sistema operativo
    let result = if cfg!(target_os = "windows") {
        std::process::Command::new("explorer")
            .arg(&instance_dir)
            .spawn()
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open")
            .arg(&instance_dir)
            .spawn()
    } else {
        // Linux y otros Unix
        std::process::Command::new("xdg-open")
            .arg(&instance_dir)
            .spawn()
    };
    
    match result {
        Ok(_) => {
            println!("✅ Instance folder opened successfully");
            Ok(())
        },
        Err(e) => {
            println!("❌ Failed to open instance folder: {}", e);
            Err(format!("Error al abrir la carpeta: {}", e))
        }
    }
}

#[tauri::command]
async fn get_meta_storage_info() -> Result<String, String> {
    match launcher::get_meta_storage_info().await {
        Ok(info) => Ok(serde_json::to_string(&info).unwrap()),
        Err(e) => Err(format!("Failed to get meta storage info: {}", e)),
    }
}

#[tauri::command]
async fn cleanup_meta_storage() -> Result<Vec<String>, String> {
    match launcher::cleanup_meta_storage().await {
        Ok(items) => Ok(items),
        Err(e) => Err(format!("Failed to cleanup meta storage: {}", e)),
    }
}

#[tauri::command]
async fn cache_modpack_images_command(modpacks: Vec<serde_json::Value>) -> Result<(), String> {
    match launcher::cache_modpack_images(modpacks).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to cache modpack images: {}", e)),
    }
}

#[tauri::command]
async fn clear_icons_cache() -> Result<Vec<String>, String> {
    match launcher::clear_icons_cache().await {
        Ok(result) => Ok(result),
        Err(e) => Err(format!("Failed to clear icons cache: {}", e)),
    }
}

#[tauri::command]
async fn clear_screenshots_cache() -> Result<Vec<String>, String> {
    match launcher::clear_screenshots_cache().await {
        Ok(result) => Ok(result),
        Err(e) => Err(format!("Failed to clear screenshots cache: {}", e)),
    }
}

/// Parsea mensajes de "Progress:" para crear mensajes generales útiles
/// Ejemplo: "Progress: 3835/3855 - Java (99.48119%)" -> "Progreso: Descargando Java... (3835/3855)"
/// Devuelve None si debe mantener el mensaje anterior (evita parpadeo)
fn parse_progress_line(message: &str) -> Option<String> {
    if !message.starts_with("Progress:") {
        return Some("Instalando...".to_string());
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

#[allow(unused_must_use)]
fn main() {
    // Esta anotación permite que Rust ignore el "referenced_by" error que ocurre durante la compilación
    #[allow(unused_variables, dead_code)]
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())

        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_instance_metadata,
            install_modpack,
            install_modpack_with_minecraft,
            install_modpack_with_failed_tracking,
            install_modpack_with_shared_storage,
            launch_modpack,
            delete_instance,
            get_launcher_version,
            get_platform,
            check_java,
            get_supported_loaders,
            validate_modpack_config,
            check_instance_needs_update,
            check_curseforge_modpack,
            open_url,
            create_microsoft_auth_link,
            authenticate_microsoft,
            refresh_microsoft_token,
            validate_microsoft_token,
            open_microsoft_auth_and_get_url,
            extract_code_from_redirect_url,
            open_microsoft_auth_modal,
            remove_modpack,
            open_instance_folder,
            get_meta_storage_info,
            cleanup_meta_storage,
            cache_modpack_images_command,
            clear_icons_cache,
            clear_screenshots_cache
        ])
        .setup(|app| {
            // Initialize app data directory
            if let Err(e) = std::fs::create_dir_all(
                app.path()
                    .app_data_dir()
                    .expect("Failed to get app data dir")
                    .join("instances")
            ) {
                eprintln!("Failed to create instances directory: {}", e);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
