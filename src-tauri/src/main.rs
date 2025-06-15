// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use serde::{Deserialize, Serialize};
use anyhow::Result;

mod launcher;
mod filesystem;
mod minecraft;
mod downloader;
mod curseforge;

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

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
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
async fn install_modpack_with_minecraft(modpack: Modpack, settings: UserSettings) -> Result<(), String> {
    // Validate modpack before installation
    if let Err(e) = launcher::validate_modpack(&modpack) {
        return Err(format!("Invalid modpack configuration: {}", e));
    }
    
    match launcher::install_modpack_with_minecraft(modpack, settings).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to install modpack with Minecraft: {}", e)),
    }
}

#[tauri::command]
async fn launch_modpack(modpack: Modpack, settings: UserSettings) -> Result<(), String> {
    // Validate modpack before launching
    if let Err(e) = launcher::validate_modpack(&modpack) {
        return Err(format!("Invalid modpack configuration: {}", e));
    }
    
    match minecraft::launch_minecraft(modpack, settings).await {
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
    use std::path::PathBuf;
    use dirs::data_dir;
    use std::fs;
    use zip::ZipArchive;
    
    let app_data_dir = data_dir()
        .ok_or_else(|| "Failed to get app data directory".to_string())?;
    
    let temp_dir = app_data_dir
        .join("LuminaKraftLauncher")
        .join("temp");
    
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    }
    
    let temp_file = temp_dir.join("temp_check_curseforge.zip");
    
    // Descargar el archivo
    match downloader::download_file(&modpack_url, &temp_file).await {
        Ok(_) => {
            // Verificar si contiene manifest.json
            let file = fs::File::open(&temp_file)
                .map_err(|e| format!("Failed to open temp file: {}", e))?;
            
            let mut archive = ZipArchive::new(file)
                .map_err(|e| format!("Failed to read zip file: {}", e))?;
            
            let mut is_curseforge = false;
            
            // Buscar manifest.json en la raíz
            for i in 0..archive.len() {
                let file = archive.by_index(i)
                    .map_err(|e| format!("Failed to read zip entry: {}", e))?;
                
                if file.name() == "manifest.json" {
                    is_curseforge = true;
                    break;
                }
            }
            
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

#[allow(unused_must_use)]
fn main() {
    // Esta anotación permite que Rust ignore el "referenced_by" error que ocurre durante la compilación
    #[allow(unused_variables, dead_code)]
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_instance_metadata,
            install_modpack,
            install_modpack_with_minecraft,
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
            open_microsoft_auth_modal
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
