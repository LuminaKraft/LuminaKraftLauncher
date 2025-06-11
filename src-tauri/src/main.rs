// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use serde::{Deserialize, Serialize};
use anyhow::Result;

mod launcher;
mod filesystem;
mod minecraft;
mod downloader;

#[derive(Debug, Serialize, Deserialize)]
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
    match launcher::install_modpack(modpack).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to install modpack: {}", e)),
    }
}

#[tauri::command]
async fn launch_modpack(modpack: Modpack, settings: UserSettings) -> Result<(), String> {
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
    Ok("1.0.0".to_string())
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_instance_metadata,
            install_modpack,
            launch_modpack,
            delete_instance,
            get_launcher_version,
            get_platform,
            check_java
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
