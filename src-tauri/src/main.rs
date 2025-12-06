// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Emitter};
use serde::{Deserialize, Serialize};
use anyhow::Result;
use std::sync::{Arc, Mutex};

mod launcher;
mod meta;
mod filesystem;
mod minecraft;
mod modpack;
mod utils;
mod oauth;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Modpack {
    pub id: String,
    #[serde(alias = "nombre")] // Accept both "name" and "nombre" from JSON
    pub name: String,
    #[serde(alias = "descripcion")] // Accept both "description" and "descripcion" from JSON
    pub description: String,
    pub version: String,
    #[serde(rename = "minecraftVersion")]
    pub minecraft_version: String,
    pub modloader: String,
    #[serde(rename = "modloaderVersion")]
    pub modloader_version: String,
    #[serde(rename = "urlModpackZip")]
    pub url_modpack_zip: String,
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
    #[serde(rename = "backgroundImage", alias = "banner_url", alias = "bannerUrl", default)]
    pub banner_url: String,
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
    /// Modpack category: "official" | "partner" | "community" | None (imported)
    /// Used to determine cleanup behavior and integrity verification
    #[serde(default)]
    pub category: Option<String>,
    /// Expected SHA256 hash of the modpack ZIP file (from server)
    /// Used to verify download integrity
    #[serde(rename = "fileSha256", default)]
    pub file_sha256: Option<String>,
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
    #[serde(default)]
    pub language: String,
    #[serde(rename = "authMethod")]
    pub auth_method: String, // "offline" or "microsoft"
    #[serde(rename = "microsoftAccount")]
    pub microsoft_account: Option<MicrosoftAccount>,
    #[serde(rename = "clientToken")]
    pub client_token: Option<String>,
    #[serde(rename = "supabaseAccessToken")]
    pub supabase_access_token: Option<String>,
    #[serde(rename = "enablePrereleases", default)]
    pub enable_prereleases: bool,
    #[serde(rename = "enableAnimations", default)]
    pub enable_animations: bool,
    #[serde(rename = "supabaseAnonKey")]
    pub supabase_anon_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstanceMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(rename = "installedAt")]
    pub installed_at: String,
    pub modloader: String,
    #[serde(rename = "modloaderVersion")]
    pub modloader_version: String,
    #[serde(rename = "minecraftVersion")]
    pub minecraft_version: String,
    #[serde(rename = "recommendedRam", skip_serializing_if = "Option::is_none")]
    pub recommended_ram: Option<u32>, // Recommended RAM in MB from manifest.json
    #[serde(rename = "ramAllocation", skip_serializing_if = "Option::is_none")]
    pub ram_allocation: Option<String>, // "curseforge" | "recommended" | "custom" | "global"
    #[serde(rename = "customRam", skip_serializing_if = "Option::is_none")]
    pub custom_ram: Option<u32>, // Custom RAM in MB (only used when ramAllocation is "custom")
    /// Integrity data for anti-cheat verification (official/partner modpacks)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub integrity: Option<modpack::integrity::IntegrityData>,
    /// Modpack category for determining verification behavior
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
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
async fn get_cached_modpack_data(modpack_id: String) -> Result<Option<String>, String> {
    let launcher_dir = match dirs::data_dir() {
        Some(dir) => dir.join("LKLauncher"),
        None => return Err("Failed to get app data directory".to_string()),
    };

    let meta_path = launcher_dir
        .join("meta")
        .join("modpacks")
        .join(format!("{}.json", modpack_id));

    if !meta_path.exists() {
        return Ok(None);
    }

    match std::fs::read_to_string(meta_path) {
        Ok(content) => Ok(Some(content)),
        Err(e) => Err(format!("Failed to read cached modpack data: {}", e)),
    }
}

#[tauri::command]
async fn update_modpack_cache_json(
    modpack_id: String,
    updates: serde_json::Value,
) -> Result<(), String> {
    let launcher_dir = match dirs::data_dir() {
        Some(dir) => dir.join("LKLauncher"),
        None => return Err("Failed to get app data directory".to_string()),
    };

    let meta_path = launcher_dir
        .join("meta")
        .join("modpacks")
        .join(format!("{}.json", modpack_id));

    // Read existing metadata if it exists
    let mut meta_data: serde_json::Value = if meta_path.exists() {
        match std::fs::read_to_string(&meta_path) {
            Ok(content) => match serde_json::from_str(&content) {
                Ok(data) => data,
                Err(e) => return Err(format!("Failed to parse modpack metadata: {}", e)),
            },
            Err(e) => return Err(format!("Failed to read modpack metadata: {}", e)),
        }
    } else {
        serde_json::json!({})
    };

    // Merge updates into metadata
    if let serde_json::Value::Object(ref mut map) = meta_data {
        if let serde_json::Value::Object(updates_map) = updates {
            for (key, value) in updates_map {
                map.insert(key, value);
            }
        }
    }

    // Write updated metadata
    let json_str = match serde_json::to_string_pretty(&meta_data) {
        Ok(s) => s,
        Err(e) => return Err(format!("Failed to serialize metadata: {}", e)),
    };

    match std::fs::write(&meta_path, json_str) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to write modpack metadata: {}", e)),
    }
}

#[tauri::command]
async fn save_modpack_metadata_json(
    modpack_id: String,
    modpack_json: String
) -> Result<(), String> {
    let launcher_dir = match dirs::data_dir() {
        Some(dir) => dir.join("LKLauncher"),
        None => return Err("Failed to get app data directory".to_string()),
    };

    let meta_dir = launcher_dir.join("meta").join("modpacks");

    // Create metadata directory if it doesn't exist
    std::fs::create_dir_all(&meta_dir)
        .map_err(|e| format!("Failed to create metadata directory: {}", e))?;

    let meta_path = meta_dir.join(format!("{}.json", modpack_id));

    // Write the modpack JSON to file
    std::fs::write(&meta_path, modpack_json)
        .map_err(|e| format!("Failed to save modpack metadata: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn get_file_as_data_url(file_path: String) -> Result<String, String> {
    use std::fs;
    use std::path::Path;
    use base64::Engine;

    let path = Path::new(&file_path);

    // Validate path exists and is a file
    if !path.is_file() {
        return Err(format!("File not found: {}", file_path));
    }

    // Read the file
    let data = fs::read(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Determine MIME type from extension
    let mime_type = match path.extension().and_then(|ext| ext.to_str()) {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    };

    // Encode to base64
    let engine = base64::engine::general_purpose::STANDARD;
    let encoded = engine.encode(&data);

    // Return data URL
    Ok(format!("data:{};base64,{}", mime_type, encoded))
}

#[tauri::command]
async fn update_instance_ram_settings(
    modpack_id: String,
    ram_allocation: String,
    custom_ram: Option<u32>
) -> Result<(), String> {
    // Get existing metadata
    let mut metadata = match filesystem::get_instance_metadata(&modpack_id).await {
        Ok(Some(metadata)) => metadata,
        Ok(None) => return Err(format!("Instance {} not found", modpack_id)),
        Err(e) => return Err(format!("Failed to get instance metadata: {}", e)),
    };

    // Update RAM settings
    metadata.ram_allocation = Some(ram_allocation);
    metadata.custom_ram = custom_ram;

    // Save updated metadata
    match filesystem::save_instance_metadata(&metadata).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to save instance metadata: {}", e)),
    }
}

#[tauri::command]
async fn save_modpack_image(
    modpack_id: String,
    image_type: String,
    image_data: Vec<u8>,
    file_name: String
) -> Result<(), String> {
    match filesystem::save_modpack_image(&modpack_id, &image_type, image_data, &file_name).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to save modpack image: {}", e)),
    }
}

#[tauri::command]
async fn get_local_modpacks() -> Result<String, String> {
    match filesystem::list_instances().await {
        Ok(instances) => {
            match serde_json::to_string(&instances) {
                Ok(json) => Ok(json),
                Err(e) => Err(format!("Failed to serialize instances: {}", e)),
            }
        }
        Err(e) => Err(format!("Failed to list instances: {}", e)),
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
        let last_general_message = std::sync::Arc::new(std::sync::Mutex::new("progress.installing".to_string()));
        
        move |message: String, percentage: f32, step: String| {
            let (general_message, detail_message) = handle_progress_message(&message, &step, &last_detail_message, &last_general_message);
            
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
        let last_general_message = std::sync::Arc::new(std::sync::Mutex::new("progress.installing".to_string()));
        
        move |message: String, percentage: f32, step: String| {
            let (general_message, detail_message) = handle_progress_message(&message, &step, &last_detail_message, &last_general_message);
            
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
async fn launch_modpack(app: tauri::AppHandle, modpack: Modpack, settings: UserSettings) -> Result<(), String> {
    // Validate modpack before launching
    if let Err(e) = launcher::validate_modpack(&modpack) {
        return Err(format!("Invalid modpack configuration: {}", e));
    }
    
    match launcher::launch_modpack_with_shared_storage_and_token_refresh(modpack, settings, app).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to launch modpack: {}", e)),
    }
}

/// Verify instance integrity before launching (anti-cheat for official/partner modpacks)
/// Returns: { "valid": bool, "issues": string[], "migrated": bool }
/// - valid: true if integrity check passed
/// - issues: list of problems found (modified files, unauthorized mods, etc.)
/// - migrated: true if this was a legacy installation that was auto-migrated
/// - expected_zip_sha256: optional SHA256 from server (Supabase modpack_versions.file_sha256)
#[tauri::command]
async fn verify_instance_integrity(
    modpack_id: String,
    expected_zip_sha256: Option<String>,
) -> Result<serde_json::Value, String> {
    use modpack::integrity::{verify_integrity, create_integrity_data, format_issues};
    
    // Get instance metadata
    let metadata = match filesystem::get_instance_metadata(&modpack_id).await {
        Ok(Some(m)) => m,
        Ok(None) => return Err("Instance not found".to_string()),
        Err(e) => return Err(format!("Failed to get instance metadata: {}", e)),
    };
    
    // Check if this is an official/partner modpack that requires integrity verification
    let requires_verification = metadata.category.as_ref()
        .map(|c| c == "official" || c == "partner")
        .unwrap_or(false);
    
    if !requires_verification {
        // Community/imported modpacks don't need verification
        return Ok(serde_json::json!({
            "valid": true,
            "issues": [],
            "migrated": false,
            "skipped": true,
            "reason": "Community or imported modpack - no verification required"
        }));
    }
    
    let instance_dir = filesystem::get_instance_dir(&modpack_id)
        .map_err(|e| format!("Failed to get instance directory: {}", e))?;
    
    let mut all_issues: Vec<String> = Vec::new();
    
    // Check if we have integrity data
    match &metadata.integrity {
        Some(integrity_data) => {
            // First, verify ZIP SHA256 against server if available
            if let Some(ref server_sha256) = expected_zip_sha256 {
                if let Some(ref local_sha256) = integrity_data.zip_sha256 {
                    if local_sha256 != server_sha256 {
                        all_issues.push(format!(
                            "Versión del modpack no coincide con el servidor (instalado: {}..., servidor: {}...)",
                            &local_sha256[..8.min(local_sha256.len())],
                            &server_sha256[..8.min(server_sha256.len())]
                        ));
                    }
                }
                // If no local SHA256, user installed before this feature - skip this check
            }
            
            // Verify file hashes
            let result = verify_integrity(&instance_dir, integrity_data);
            
            if !result.is_valid {
                all_issues.extend(format_issues(&result.issues));
            }
            
            if all_issues.is_empty() {
                Ok(serde_json::json!({
                    "valid": true,
                    "issues": [],
                    "migrated": false
                }))
            } else {
                Ok(serde_json::json!({
                    "valid": false,
                    "issues": all_issues,
                    "migrated": false
                }))
            }
        }
        None => {
            // Legacy installation - perform silent migration
            println!("🔄 Legacy installation detected for {}. Performing silent migration...", modpack_id);
            
            // For legacy installations, we can't verify against server SHA256
            // but we'll save it for future verifications if provided
            match create_integrity_data(&instance_dir, expected_zip_sha256.clone()) {
                Ok(new_integrity_data) => {
                    // Update metadata with new integrity data
                    let mut updated_metadata = metadata.clone();
                    updated_metadata.integrity = Some(new_integrity_data.clone());
                    
                    if let Err(e) = filesystem::save_instance_metadata(&updated_metadata).await {
                        eprintln!("⚠️ Failed to save migrated integrity data: {}", e);
                        return Ok(serde_json::json!({
                            "valid": true, // Allow launching anyway
                            "issues": ["Failed to save integrity data, will retry next time"],
                            "migrated": false
                        }));
                    }
                    
                    println!("✅ Silent migration complete: {} files tracked, zip_sha256: {:?}", 
                        new_integrity_data.file_hashes.len(),
                        new_integrity_data.zip_sha256.as_ref().map(|s| &s[..8.min(s.len())])
                    );
                    
                    Ok(serde_json::json!({
                        "valid": true,
                        "issues": [],
                        "migrated": true
                    }))
                }
                Err(e) => {
                    eprintln!("⚠️ Failed to create integrity data: {}", e);
                    // Allow launching anyway for legacy installations
                    Ok(serde_json::json!({
                        "valid": true,
                        "issues": ["Could not create integrity data"],
                        "migrated": false
                    }))
                }
            }
        }
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
    
    match utils::downloader::download_file(&modpack_url, &temp_file).await {
        Ok(_) => {
            let is_curseforge = match lyceris::util::extract::read_file_from_jar(&temp_file, "manifest.json") {
                Ok(_) => true,
                Err(_) => false,
            };
            
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
async fn focus_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_focus()
            .map_err(|e| format!("Failed to focus window: {}", e))?;
        window.show()
            .map_err(|e| format!("Failed to show window: {}", e))?;
    }
    Ok(())
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
    match filesystem::remove_modpack_completely(&modpack_id).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to remove modpack: {}", e))
    }
}

#[tauri::command]
async fn open_instance_folder(modpack_id: String) -> Result<(), String> {
    let app_data_dir = dirs::data_dir()
        .ok_or_else(|| "Failed to get app data directory".to_string())?;
    
    let instance_dir = app_data_dir
        .join("LKLauncher")
        .join("instances")
        .join(&modpack_id);
    
    if !instance_dir.exists() {
        return Err("La instancia no existe".to_string());
    }
    
    let result = if cfg!(target_os = "windows") {
        std::process::Command::new("explorer")
            .arg(&instance_dir)
            .spawn()
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open")
            .arg(&instance_dir)
            .spawn()
    } else {
        std::process::Command::new("xdg-open")
            .arg(&instance_dir)
            .spawn()
    };
    
    match result {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Error al abrir la carpeta: {}", e))
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
async fn stop_instance(app: tauri::AppHandle, instance_id: String) -> Result<(), String> {
    // Emit event that instance is stopping
    let _ = app.emit(&format!("minecraft-stopping-{}", instance_id), serde_json::json!({}));
    
    match crate::minecraft::stop_instance_process(&instance_id).await {
        Ok(_) => {
            // Remove from RUNNING_PROCS and emit stopped event
            {
                let mut map_guard = crate::minecraft::RUNNING_PROCS.lock().unwrap();
                map_guard.remove(&instance_id);
            }
            let _ = app.emit(&format!("minecraft-exited-{}", instance_id), serde_json::json!({}));
            Ok(())
        },
        Err(e) => Err(e.to_string()),
    }
}

/// Handle progress message parsing and return (general_message, detail_message)
fn handle_progress_message(
    message: &str,
    step: &str,
    last_detail_message: &Arc<Mutex<String>>,
    last_general_message: &Arc<Mutex<String>>
) -> (String, String) {
    // Handle Minecraft file downloads
    if step == "downloading_minecraft_file" || message.starts_with("progress.downloadingMinecraftFile|") {
        let file_name = if message.starts_with("progress.downloadingMinecraftFile|") {
            message.strip_prefix("progress.downloadingMinecraftFile|").unwrap_or(message)
        } else {
            message
        };
        
        let clean_file_name = if let Some(dash_pos) = file_name.find(" - ") {
            file_name[..dash_pos].trim()
        } else {
            file_name
        };
        
        let detail_msg = clean_file_name.to_string();
        
        // Update last detail message
        if let Ok(mut last) = last_detail_message.lock() {
            *last = detail_msg.clone();
        }
        
        // Keep the last general message for context
        let preserved_general = if let Ok(last) = last_general_message.lock() {
            last.clone()
        } else {
            "progress.downloadingMinecraft|Assets|".to_string()
        };
        
        return (preserved_general, detail_msg);
    }
    
    // Handle modpack downloads
    if message.starts_with("downloading_modpack:") {
        let parts: Vec<&str> = message.split(':').collect();
        if parts.len() == 3 {
            let current = parts[1];
            let total = parts[2];
            let general_msg = format!("progress.downloadingModpack|{}/{}", current, total);
            
            if let Ok(mut last) = last_general_message.lock() {
                *last = general_msg.clone();
            }
            
            let preserved_detail = if let Ok(last) = last_detail_message.lock() {
                last.clone()
            } else {
                "".to_string()
            };
            
            return (general_msg, preserved_detail);
        }
    }
    
    // Handle Progress: lines
    if message.starts_with("Progress:") {
        if let Some(parsed_general) = parse_progress_line(message) {
            if let Ok(mut last) = last_general_message.lock() {
                *last = parsed_general.clone();
            }
            
            let preserved_detail = if let Ok(last) = last_detail_message.lock() {
                last.clone()
            } else {
                "".to_string()
            };
            
            return (parsed_general, preserved_detail);
        }
    }
    
    // Handle mod-specific messages (mod_name, mod_completed, etc.)
    for prefix in ["mod_name:", "mod_completed:", "mod_exists:", "mod_unavailable:", "mod_error:", "mod_download_error:"] {
        if message.starts_with(prefix) {
            let file_name = message.strip_prefix(prefix).unwrap_or(message);
            let detail_msg = format!("{}:{}", prefix.trim_end_matches(':'), file_name);
            
            if let Ok(mut last) = last_detail_message.lock() {
                *last = detail_msg.clone();
            }
            
            let preserved_general = if let Ok(last) = last_general_message.lock() {
                last.clone()
            } else {
                "progress.downloadingMods".to_string()
            };
            
            return (preserved_general, detail_msg);
        }
    }
    
    // Handle step-based messages when no specific message pattern matches
    if message == "preparing_mod_downloads" || step == "preparing_mod_downloads" {
        return ("".to_string(), "".to_string());
    }
    
    // Step-based general messages
    let general = match step {
        "preparing_installation" | "verifying_modpack_config" | "configuring_minecraft" => "progress.configuringMinecraft",
        "downloading_minecraft" | "installing_minecraft" => "progress.installingMinecraft",
        "downloading_modpack" | "processing_modpack" | "processing_curseforge" | "extracting_modpack" | "reading_manifest" | "processing_overrides" => "progress.processingCurseforge",
        "updating" | "downloading_update" | "processing_update" | "updating_curseforge_mods" | 
        "replacing_mods" | "updating_configs" | "removing_old_mods" | "copying_new_mods" |
        "backing_up_minecraft" | "extracting_new_version" | "restoring_minecraft" |
        "finalizing_update" => "progress.updating",
        "downloading_mods" | "downloading_modpack_file" | "downloading_mod_file" | "preparing_mod_downloads" | 
        "mod_already_exists" | "mod_unavailable" | "mod_downloaded_verified" | "mod_hash_mismatch" | "mod_download_error" => "progress.downloadingMods",
        "finalizing" | "completed" | "curseforge_completed" | "saving_instance_config" | "finalizing_installation" => "progress.finalizing",
        _ => "progress.installing",
    };
    
    // Default: use step-based or message as general
    let general_msg = if general != "progress.installing" {
        general.to_string()
    } else {
        message.to_string()
    };
    
    if let Ok(mut last_general) = last_general_message.lock() {
        *last_general = general_msg.clone();
    }
    if let Ok(mut last_detail) = last_detail_message.lock() {
        *last_detail = "".to_string();
    }
    
    (general_msg, "".to_string())
}

/// Parse "Progress:" messages to create useful general messages
/// Example: "Progress: 3835/3855 - Java (99.48119%)" -> "Progress: Downloading Java... (3835/3855)"
/// Returns None if should keep previous message (avoids flickering)
fn parse_progress_line(message: &str) -> Option<String> {
    if !message.starts_with("Progress:") {
        return Some("Installing...".to_string());
    }
    
    // Change "Progress:" to "Progress:"
    let message = message.replacen("Progress:", "Progress:", 1);
    
    // Example: "Progress: 3835/3855 - Java (99.48119%)"
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
            
            return Some(format!("progress.downloadingMinecraft|{}|{}", translated_name, progress_part));
        }
    }
    
    Some("progress.installingMinecraft".to_string())
}

#[tauri::command]
async fn list_minecraft_versions() -> Result<Vec<String>, String> {
    launcher::list_minecraft_versions()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_refreshed_microsoft_token(app: tauri::AppHandle, refreshed_account: MicrosoftAccount) -> Result<(), String> {
    // Emit an event to notify the frontend about the refreshed token
    let _ = app.emit("microsoft-token-refreshed", serde_json::json!({
        "xuid": refreshed_account.xuid,
        "exp": refreshed_account.exp,
        "uuid": refreshed_account.uuid,
        "username": refreshed_account.username,
        "accessToken": refreshed_account.access_token,
        "refreshToken": refreshed_account.refresh_token,
        "clientId": refreshed_account.client_id
    }));

    Ok(())
}

#[tauri::command]
async fn add_mods_to_instance(modpack_id: String, file_paths: Vec<String>) -> Result<(), String> {
    use std::path::PathBuf;

    // Convert String paths to PathBuf
    let paths: Vec<PathBuf> = file_paths.into_iter().map(PathBuf::from).collect();

    match filesystem::add_mods_to_instance(&modpack_id, paths).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to add mods to instance: {}", e)),
    }
}

#[tauri::command]
async fn install_modpack_from_local_zip(
    app: tauri::AppHandle,
    zip_path: String,
    modpack: Modpack,
    settings: UserSettings
) -> Result<(), String> {
    use std::path::PathBuf;

    tokio::task::spawn_blocking(move || {
        tokio::runtime::Handle::current().block_on(async {
            use anyhow::anyhow;

            let zip_file_path = PathBuf::from(&zip_path);

            // Verify the ZIP file exists at the provided path
            if !zip_file_path.exists() {
                return Err(anyhow!("ZIP file not found at path: {}", zip_path));
            }

            // Update modpack with local ZIP path
            let mut local_modpack = modpack;
            local_modpack.url_modpack_zip = zip_path;

            // Validate modpack before installation
            if let Err(e) = launcher::validate_modpack(&local_modpack) {
                return Err(anyhow!("Invalid modpack configuration: {}", e));
            }

            // Create progress emission closure following the same pattern as install_modpack_with_minecraft
            let emit_progress = {
                let app = app.clone();
                let modpack_id = local_modpack.id.clone();

                // Estado para mantener el último detailMessage válido
                let last_detail_message = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
                let last_general_message = std::sync::Arc::new(std::sync::Mutex::new("progress.installing".to_string()));

                move |message: String, percentage: f32, step: String| {
                    let (general_message, detail_message) = handle_progress_message(&message, &step, &last_detail_message, &last_general_message);

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

            // Use existing install logic with progress
            launcher::install_modpack_with_shared_storage(local_modpack, settings, emit_progress).await?;
            Ok(())
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e: anyhow::Error| format!("Failed to install modpack from local ZIP: {}", e))
}

#[tauri::command]
async fn get_system_ram() -> Result<u32, String> {
    use sysinfo::System;
    
    let mut sys = System::new_all();
    sys.refresh_memory();
    
    // Get total memory in bytes and convert to GB
    let total_memory_bytes = sys.total_memory();
    let total_memory_gb = (total_memory_bytes as f64 / 1_073_741_824.0).ceil() as u32;
    
    Ok(total_memory_gb)
}

#[tauri::command]
async fn create_modpack_with_overrides(
    original_zip_bytes: Vec<u8>,
    original_zip_name: String,
    uploaded_files: Vec<(String, Vec<u8>)>, // (filename, bytes)
    output_zip_path: String,
    app_handle: tauri::AppHandle
) -> Result<(), String> {
    use std::path::PathBuf;
    use std::fs;
    use std::io::Write;

    // Run in a blocking task to avoid blocking the main thread
    tokio::task::spawn_blocking(move || {
        // Use a runtime handle for the async operation
        tokio::runtime::Handle::current().block_on(async {
            use anyhow::anyhow;

            // Write files to temp directory
            let temp_dir = dirs::cache_dir()
                .ok_or_else(|| anyhow!("Could not get cache directory"))?
                .join("LKLauncher")
                .join("temp")
                .join("modpack_merge");

            fs::create_dir_all(&temp_dir)?;

            // Write original ZIP
            let original_zip_path = temp_dir.join(&original_zip_name);
            let mut original_file = fs::File::create(&original_zip_path)?;
            original_file.write_all(&original_zip_bytes)?;

            // Write uploaded files
            let mut uploaded_paths = Vec::new();
            for (filename, bytes) in uploaded_files {
                let file_path = temp_dir.join(&filename);
                let mut file = fs::File::create(&file_path)?;
                file.write_all(&bytes)?;
                uploaded_paths.push(file_path);
            }

            let output_path = PathBuf::from(output_zip_path);

            // Create the modpack with overrides
            let result = filesystem::create_modpack_with_overrides(
                original_zip_path,
                uploaded_paths,
                output_path,
                Some(app_handle)
            ).await;

            // Clean up temp directory after creating the modpack
            utils::cleanup::cleanup_temp_dir(&temp_dir);

            result
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to create modpack with overrides: {}", e))
}

#[allow(unused_must_use)]
fn main() {
    // Linux graphics/display server compatibility setup must run BEFORE Tauri/GTK init
    // Prefer Wayland with automatic fallback to X11, and disable fragile DMABUF path.
    // Also provide a safe software rendering fallback on X11.
    #[cfg(target_os = "linux")]
    {
        use std::env;

        // If the user didn't force a backend, prefer Wayland but allow fallback to X11
        if env::var("GDK_BACKEND").is_err() {
            env::set_var("GDK_BACKEND", "wayland,x11");
        }

        // Force GTK scene renderer to OpenGL for better compatibility on Wayland (avoids Vulkan issues)
        if env::var("GSK_RENDERER").is_err() {
            env::set_var("GSK_RENDERER", "gl");
        }

        // Disable WebKitGTK DMABUF hardware path which can fail with GBM on some drivers
        if env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
            env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }

        // If running under X11 (no Wayland), provide a software rendering fallback to avoid GBM errors
        let is_wayland = env::var("WAYLAND_DISPLAY").is_ok();
        let is_x11 = !is_wayland && env::var("DISPLAY").is_ok();
        if is_x11 && env::var("LIBGL_ALWAYS_SOFTWARE").is_err() {
            env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
        }

        // Log what we decided for easier support/debugging
        eprintln!(
            "[Linux gfx] GDK_BACKEND={:?} GSK_RENDERER={:?} WEBKIT_DISABLE_DMABUF_RENDERER={:?} LIBGL_ALWAYS_SOFTWARE={:?}",
            env::var("GDK_BACKEND").ok(),
            env::var("GSK_RENDERER").ok(),
            env::var("WEBKIT_DISABLE_DMABUF_RENDERER").ok(),
            env::var("LIBGL_ALWAYS_SOFTWARE").ok()
        );

        if !is_wayland && !is_x11 {
            eprintln!("[Linux gfx] Warning: No display server detected (neither WAYLAND_DISPLAY nor DISPLAY set)");
        }
    }

    tauri::Builder::default()
        .manage(oauth::OAuthServerState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_system_ram,
            get_instance_metadata,
            get_cached_modpack_data,
            update_modpack_cache_json,
            save_modpack_metadata_json,
            get_file_as_data_url,
            update_instance_ram_settings,
            get_local_modpacks,
            install_modpack,
            install_modpack_with_minecraft,
            install_modpack_with_failed_tracking,
            install_modpack_with_shared_storage,
            launch_modpack,
            verify_instance_integrity,
            delete_instance,
            get_launcher_version,
            get_platform,
            get_supported_loaders,
            validate_modpack_config,
            check_instance_needs_update,
            check_curseforge_modpack,
            open_url,
            focus_window,
            create_microsoft_auth_link,
            authenticate_microsoft,
            refresh_microsoft_token,
            validate_microsoft_token,
            open_microsoft_auth_modal,
            remove_modpack,
            open_instance_folder,
            get_meta_storage_info,
            cleanup_meta_storage,
            list_minecraft_versions,
            update_refreshed_microsoft_token,
            stop_instance,
            add_mods_to_instance,
            create_modpack_with_overrides,
            install_modpack_from_local_zip,
            save_modpack_image,
            oauth::start_oauth_server,
            oauth::stop_oauth_server,
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

            // Migrate old caches/modpacks to new meta/modpacks location
            if let Err(e) = filesystem::migrate_caches_to_meta() {
                eprintln!("Failed to migrate caches to meta: {}", e);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
