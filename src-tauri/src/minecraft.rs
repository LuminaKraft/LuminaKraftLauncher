use std::path::PathBuf;
use anyhow::{Result, anyhow};
use tauri::Emitter;
use lyceris::minecraft::{
    config::{ConfigBuilder, Profile},
    emitter::{Emitter as LycerisEmitter, Event},
    install::install,
    launch::launch,
    loader::{fabric::Fabric, forge::Forge, quilt::Quilt, neoforge::NeoForge, Loader},
};
use crate::filesystem;
use lyceris::auth::AuthMethod;
use crate::{Modpack, UserSettings};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use tokio::sync::Mutex as AsyncMutex;

pub static RUNNING_PROCS: Lazy<std::sync::Mutex<HashMap<String, std::sync::Arc<AsyncMutex<tokio::process::Child>>>>> = Lazy::new(|| std::sync::Mutex::new(HashMap::new()));

// Add helper to find and kill Java processes for an instance
async fn kill_java_processes_for_instance(instance_id: &str) -> Result<bool, anyhow::Error> {
    let launcher_data_dir = dirs::data_dir()
        .ok_or_else(|| anyhow::anyhow!("Could not determine data directory"))?
        .join("LKLauncher");
    
    let instance_dir = launcher_data_dir
        .join("instances")
        .join(instance_id);
    
    let instance_path = instance_dir.to_string_lossy();
    
    #[cfg(target_os = "windows")]
    {
        // On Windows, find Java processes with the instance path in their command line
        let output = std::process::Command::new("wmic")
            .args([
                "process", "where", 
                &format!("name='java.exe' and CommandLine like '%{}%'", instance_path),
                "get", "ProcessId", "/value"
            ])
            .output()?;
        
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut killed_any = false;
            
            for line in stdout.lines() {
                if line.starts_with("ProcessId=") {
                    if let Some(pid_str) = line.strip_prefix("ProcessId=") {
                        if let Ok(pid) = pid_str.parse::<u32>() {
                            println!("🔄 Killing Java process PID: {}", pid);
                            let _ = std::process::Command::new("taskkill")
                                .args(["/F", "/PID", &pid.to_string()])
                                .output();
                            killed_any = true;
                        }
                    }
                }
            }
            return Ok(killed_any);
        }
    }
    
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        // On Unix-like systems, find Java processes with the instance path
        let output = std::process::Command::new("pgrep")
            .args(["-f", &format!("java.*{}", instance_path)])
            .output()?;
        
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut killed_any = false;
            
            for line in stdout.lines() {
                if let Ok(pid) = line.trim().parse::<i32>() {
                    println!("🔄 Killing Java process PID: {}", pid);
                    
                    // First try SIGTERM (graceful shutdown)
                    let _ = std::process::Command::new("kill")
                        .args(["-TERM", &pid.to_string()])
                        .output();
                    
                    // Wait a moment
                    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                    
                    // Then force kill with SIGKILL if needed
                    let _ = std::process::Command::new("kill")
                        .args(["-KILL", &pid.to_string()])
                        .output();
                    
                    killed_any = true;
                }
            }
            return Ok(killed_any);
        }
    }
    
    Ok(false)
}

// Add helper
pub async fn stop_instance_process(instance_id: &str) -> crate::Result<()> {
    println!("🔄 Stopping Minecraft instance: {}", instance_id);
    
    // First, try to find and kill Java processes directly
    match kill_java_processes_for_instance(instance_id).await {
        Ok(true) => {
            println!("✅ Successfully killed Java processes for instance {}", instance_id);
        }
        Ok(false) => {
            println!("⚠️ No Java processes found for instance {}", instance_id);
        }
        Err(e) => {
            println!("⚠️ Error searching for Java processes: {}", e);
        }
    }
    
    // Also try to kill via the tracked process (if any)
    let maybe_child_arc = {
        let map_guard = RUNNING_PROCS.lock().unwrap();
        map_guard.get(instance_id).cloned()
    };

    if let Some(child_arc) = maybe_child_arc {
        let mut guard = child_arc.lock().await;
        
        // Get the process ID to kill the entire process tree
        if let Some(pid) = guard.id() {
            println!("🔄 Stopping tracked process PID: {}", pid);
            
            // Kill the entire process tree (including Java process)
            #[cfg(target_os = "windows")]
            {
                // On Windows, use taskkill to terminate the entire process tree
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .output();
            }
            
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            {
                // On Unix-like systems, send SIGTERM to the process group
                use std::process::Command;
                
                // First try SIGTERM (graceful shutdown)
                let _ = Command::new("kill")
                    .args(["-TERM", &format!("-{}", pid)]) // Negative PID kills process group
                    .output();
                
                // Wait a bit for graceful shutdown
                tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;
                
                // If still running, force kill with SIGKILL
                let _ = Command::new("kill")
                    .args(["-KILL", &format!("-{}", pid)]) // Negative PID kills process group
                    .output();
            }
        }
        
        // Also call the standard kill method as fallback
        #[allow(clippy::let_underscore_future)]
        let _ = guard.kill().await;
    } else {
        println!("⚠️ No running process tracked for instance {}", instance_id);
    }

    println!("✅ Stop instance process completed for {}", instance_id);
    Ok(())
}

/// Create a Lyceris emitter for progress tracking
pub fn create_emitter() -> LycerisEmitter {
    let emitter = LycerisEmitter::default();
    
    // Set up progress tracking (you can customize these handlers)
    tokio::spawn({
        let emitter = emitter.clone();
        async move {
            emitter
                .on(
                    Event::SingleDownloadProgress,
                    |(path, current, total): (String, u64, u64)| {
                        println!("Downloading {} - {}/{}", path, current, total);
                    },
                )
                .await;
        }
    });
    
    tokio::spawn({
        let emitter = emitter.clone();
        async move {
            emitter
                .on(
                    Event::MultipleDownloadProgress,
                    |(_, current, total, _): (String, u64, u64, String)| {
                        println!("Progress: {}/{}", current, total);
                    },
                )
                .await;
    }
    });
    
    tokio::spawn({
        let emitter = emitter.clone();
        async move {
            emitter
                .on(Event::Console, |line: String| {
                    println!("Minecraft: {}", line);
                })
                .await;
            }
    });
    
    emitter
}

/// Get the appropriate mod loader based on modpack configuration
fn get_loader_by_name(name: &str, loader_version: &str) -> Result<Box<dyn Loader>> {
    match name.to_lowercase().as_str() {
        "fabric" => Ok(Fabric(loader_version.to_string()).into()),
        "forge" => Ok(Forge(loader_version.to_string()).into()),
        "quilt" => Ok(Quilt(loader_version.to_string()).into()),
        "neoforge" => Ok(NeoForge(loader_version.to_string()).into()),
        _ => Err(anyhow!("Unsupported mod loader: {}", name)),
    }
}

/// Get the appropriate auth method based on user settings with token validation and refresh
/// Returns (AuthMethod, Option<RefreshedAccount>) where RefreshedAccount contains the new token if refreshed
async fn get_auth_method_with_validation(settings: &UserSettings) -> Result<(AuthMethod, Option<lyceris::auth::microsoft::MinecraftAccount>)> {
    match settings.auth_method.as_str() {
        "microsoft" => {
            if let Some(ref account) = settings.microsoft_account {
                // Check if token is expired or will expire in the next 5 minutes
                let current_time = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| anyhow!("System time error: {}", e))?
                    .as_secs();
                
                let buffer_time = 300; // 5 minutes buffer
                let is_token_expired = account.exp <= (current_time + buffer_time);
                
                if is_token_expired {
                    println!("🔄 Microsoft token is expired or expiring soon, attempting refresh...");
                    
                    // Use Lyceris to refresh the token
                    let client = reqwest::Client::new();
                    match lyceris::auth::microsoft::refresh(account.refresh_token.clone(), &client).await {
                        Ok(refreshed_account) => {
                            println!("✅ Microsoft token refreshed successfully");
                            let auth_method = AuthMethod::Microsoft {
                                username: refreshed_account.username.clone(),
                                xuid: refreshed_account.xuid.clone(),
                                uuid: refreshed_account.uuid.clone(),
                                access_token: refreshed_account.access_token.clone(),
                                refresh_token: refreshed_account.refresh_token.clone(),
                            };
                            Ok((auth_method, Some(refreshed_account)))
                        }
                        Err(e) => {
                            println!("❌ Failed to refresh Microsoft token: {}", e);
                            println!("🔄 Falling back to offline mode");
                            Ok((AuthMethod::Offline {
                                username: settings.username.clone(),
                                uuid: None,
                            }, None))
                        }
                    }
                } else {
                    println!("✅ Microsoft token is still valid");
                    Ok((AuthMethod::Microsoft {
                        username: account.username.clone(),
                        xuid: account.xuid.clone(),
                        uuid: account.uuid.clone(),
                        access_token: account.access_token.clone(),
                        refresh_token: account.refresh_token.clone(),
                    }, None))
                }
            } else {
                // Fallback to offline if Microsoft account is not available
                Ok((AuthMethod::Offline {
                    username: settings.username.clone(),
                    uuid: None,
                }, None))
            }
        }
        _ => Ok((AuthMethod::Offline {
            username: settings.username.clone(),
            uuid: None,
        }, None))
    }
}

/// Install Minecraft and mod loader using Lyceris with progress callback
pub async fn install_minecraft_with_lyceris_progress<F>(
    modpack: &Modpack,
    settings: &UserSettings,
    instance_dir: PathBuf,
    emit_progress: F,
) -> Result<()> 
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    let emitter = create_emitter_with_progress(emit_progress.clone());
    
    let (auth_method, _refreshed_account) = get_auth_method_with_validation(settings).await?;
    
    // Get shared meta directories (includes global Java runtime dir)
    let meta_dirs = crate::meta::MetaDirectories::init().await?;

    let config_builder = ConfigBuilder::new(
        instance_dir,
        modpack.minecraft_version.clone(),
        auth_method,
    )
    .runtime_dir(meta_dirs.java_dir.clone());
    
    // Build config with or without mod loader (we need the Config instance before calling install)

    // --- Prepare Config instance (with or without loader) ---
    if !modpack.modloader.is_empty() && !modpack.modloader_version.is_empty() {
        let loader = get_loader_by_name(&modpack.modloader, &modpack.modloader_version)?;

        let config = config_builder.loader(loader).build();

        // Install / verify Minecraft first (creates version json)
        install(&config, Some(&emitter)).await?;
        return Ok(());
    } else {
        let config = config_builder.build();
    
        // Install/verify Minecraft installation first
        install(&config, Some(&emitter)).await?;

        return Ok(());
    }
 
    // unreachable
}

/// Create a Lyceris emitter with progress callback for progress tracking
pub fn create_emitter_with_progress<F>(emit_progress: F) -> LycerisEmitter 
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    let emitter = LycerisEmitter::default();
    
    // Set up single download progress tracking (NO mostrar porcentaje individual)
    tokio::spawn({
        let emitter = emitter.clone();
        let emit_progress = emit_progress.clone();
        async move {
            emitter
                .on(
                    Event::SingleDownloadProgress,
                    move |(path, current, total): (String, u64, u64)| {
                        let file_name = std::path::Path::new(&path)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or(&path);
                        
                        // No actualizar porcentaje para archivos individuales, solo mostrar detalle
                        emit_progress(
                            format!("progress.downloadingMinecraftFile|{}", file_name), 
                            -1.0, // -1 indica que no se debe actualizar el porcentaje
                            "downloading_minecraft_file".to_string()
                        );
                        println!("Downloading {} - {}/{}", file_name, current, total);
                    },
                )
                .await;
        }
    });
    
    // Set up multiple download progress tracking for general progress
    tokio::spawn({
        let emitter = emitter.clone();
        let emit_progress = emit_progress.clone();
        async move {
            emitter
                .on(
                    Event::MultipleDownloadProgress,
                    move |(_, current, total, current_file): (String, u64, u64, String)| {
                        let percentage = if total > 0 { 
                            (current as f64 / total as f64 * 100.0) as f32 
                        } else { 
                            0.0 
                        };
                        
                        // Parsear el tipo de archivo para el mensaje general (se usa en los eventos)
                        let _component_name = match current_file.as_str() {
                            name if name.contains("Java") || name.contains("java") => "Java",
                            name if name.contains("Asset") || name.contains("asset") => "Assets",
                            name if name.contains("Library") || name.contains("library") => "Librerías",
                            name if name.contains("Native") || name.contains("native") => "Nativos",
                            _ => "Archivos"
                        };
                        
                        // Este es el progreso general que debe usarse para el porcentaje principal
                        emit_progress(
                            format!("Progress: {}/{} - {} ({:.2}%)", current, total, current_file, percentage), 
                            percentage.clamp(0.0, 100.0), 
                            "downloading_minecraft_general".to_string()
                        );
                        println!("Progress: {}/{} - {} ({}%)", current, total, current_file, percentage);
                    },
                )
                .await;
        }
    });
    
    // Set up console output tracking
    tokio::spawn({
        let emitter = emitter.clone();
        let emit_progress = emit_progress.clone();
        async move {
            emitter
                .on(Event::Console, move |line: String| {
                    println!("Minecraft: {}", line);
                    // Opcional: parsear líneas del console para mostrar progreso específico
                    if line.contains("Installing") {
                        emit_progress(
                            format!("progress.installingComponent|{}", line), 
                            -1.0, // -1 indica progreso indeterminado
                            "installing_component".to_string()
                        );
                    }
                })
                .await;
        }
    });
    
    emitter
}

/// Launch Minecraft using Lyceris with token refresh support
pub async fn launch_minecraft_with_token_refresh(modpack: Modpack, settings: UserSettings, app: tauri::AppHandle) -> Result<()> {
    // Use filesystem helper to get the correct instance directory
    let instance_dir = filesystem::get_instance_dir(&modpack.id)?;

    // Ensure instance directory exists
    std::fs::create_dir_all(&instance_dir)?;
    
    let emitter = create_emitter();

    // --- Emit console logs to frontend in real-time ---
    {
        let app_clone = app.clone();
        let modpack_id_clone = modpack.id.clone();
        let emitter_clone = emitter.clone();
        tokio::spawn(async move {
            emitter_clone
                .on(Event::Console, move |line: String| {
                    let _ = app_clone.emit(&format!("minecraft-log-{}", modpack_id_clone), line);
                })
                .await;
        });
    }
    
    // Configure memory using Lyceris' built-in system
    // allocated_ram is stored in MB (e.g., 4096 for 4GB)
    let memory_mb = settings.allocated_ram.max(512);
    println!("Configuring memory: {}MB ({}GB)", memory_mb, memory_mb / 1024);

    let (auth_method, refreshed_account) = get_auth_method_with_validation(&settings).await?;
    
    // If token was refreshed, notify the frontend
    if let Some(refreshed_account) = refreshed_account {
        println!("🔄 Notifying frontend about refreshed Microsoft token");
        
        // Convert Lyceris MinecraftAccount to our MicrosoftAccount structure
        let frontend_account = crate::MicrosoftAccount {
            xuid: refreshed_account.xuid,
            exp: refreshed_account.exp,
            uuid: refreshed_account.uuid,
            username: refreshed_account.username,
            access_token: refreshed_account.access_token,
            refresh_token: refreshed_account.refresh_token,
            client_id: refreshed_account.client_id,
        };
        
        // Emit event to notify frontend
        let _ = app.emit("microsoft-token-refreshed", serde_json::json!({
            "xuid": frontend_account.xuid,
            "exp": frontend_account.exp,
            "uuid": frontend_account.uuid,
            "username": frontend_account.username,
            "accessToken": frontend_account.access_token,
            "refreshToken": frontend_account.refresh_token,
            "clientId": frontend_account.client_id
        }));
    }
    
    // Get shared meta directories (includes global Java runtime dir)
    let meta_dirs = crate::meta::MetaDirectories::init().await?;

    // Build Lyceris config using meta storage as the primary game dir.
    // A profile pointing to the instance directory guarantees that saves,
    // options.txt, screenshots etc. still live inside the instance folder
    // while libraries / assets / versions / runtimes are looked up from the
    // shared meta directory.  This strategy mirrors Modrinth-App behaviour
    // and removes the need for symlinks/junctions on Windows.

    let mut config_builder = ConfigBuilder::new(
        meta_dirs.meta_dir.clone(),                        // global game_dir (meta)
        modpack.minecraft_version.clone(),
        auth_method,
    )
    .profile(Profile::new(     // per-instance user dir (empty profile name to avoid nested directory)
        "".to_string(),
        instance_dir.clone(),
    ))
    .runtime_dir(meta_dirs.java_dir.clone());
    
    // Set memory using Lyceris' memory system (allocated_ram is in MB)
    config_builder = config_builder.memory(lyceris::minecraft::config::Memory::Megabyte(memory_mb as u64));
    
    // Build config with or without mod loader
    if !modpack.modloader.is_empty() && !modpack.modloader_version.is_empty() {
        let loader = get_loader_by_name(&modpack.modloader, &modpack.modloader_version)?;
        let config = config_builder.loader(loader).build();
    
        // Install/verify Minecraft installation first
        // We wrap this in a customized error handling block to allow offline usage
        match install(&config, Some(&emitter)).await {
            Ok(_) => println!("✅ Minecraft verification passed"),
            Err(e) => eprintln!("⚠️ Warning: Minecraft verification failed: {}. Assuming offline and attempting to launch...", e),
        }
    
        // Launch Minecraft
        let child = launch(&config, Some(&emitter)).await?;
        
        let child_arc = std::sync::Arc::new(AsyncMutex::new(child));
        RUNNING_PROCS.lock().unwrap().insert(modpack.id.clone(), child_arc.clone());
        let _ = app.emit(&format!("minecraft-started-{}", modpack.id), "started");

        // Wait for exit
        {
            let app_clone = app.clone();
            let id_clone = modpack.id.clone();
            tokio::spawn(async move {
                {
                    let mut guard = child_arc.lock().await;
                    let _ = guard.wait().await;
                }
                RUNNING_PROCS.lock().unwrap().remove(&id_clone);
                let _ = app_clone.emit(&format!("minecraft-exited-{}", id_clone), "exited");
            });
        }
    } else {
        let config = config_builder.build();
    
        // Install/verify Minecraft installation first
        // We wrap this in a customized error handling block to allow offline usage
        match install(&config, Some(&emitter)).await {
            Ok(_) => println!("✅ Minecraft verification passed"),
            Err(e) => eprintln!("⚠️ Warning: Minecraft verification failed: {}. Assuming offline and attempting to launch...", e),
        }
    
        // Launch Minecraft
        let child = launch(&config, Some(&emitter)).await?;
        
        let child_arc = std::sync::Arc::new(AsyncMutex::new(child));
        RUNNING_PROCS.lock().unwrap().insert(modpack.id.clone(), child_arc.clone());
        let _ = app.emit(&format!("minecraft-started-{}", modpack.id), "started");

        // Wait for exit
        {
            let app_clone = app.clone();
            let id_clone = modpack.id.clone();
            tokio::spawn(async move {
                {
                    let mut guard = child_arc.lock().await;
                    let _ = guard.wait().await;
                }
                RUNNING_PROCS.lock().unwrap().remove(&id_clone);
                let _ = app_clone.emit(&format!("minecraft-exited-{}", id_clone), "exited");
            });
        }
    }

    Ok(())
}

/// Check if a modpack instance needs updating
pub async fn check_instance_needs_update(
    modpack: &Modpack,
    instance_metadata: &crate::InstanceMetadata,
) -> bool {
    // Check if modpack version has changed
    if modpack.version != instance_metadata.version {
        return true;
    }
    
    // Check if Minecraft version has changed
    if modpack.minecraft_version != instance_metadata.minecraft_version {
        return true;
    }
    
    // Check if mod loader has changed
    if modpack.modloader != instance_metadata.modloader {
        return true;
    }
    
    // Check if mod loader version has changed
    if modpack.modloader_version != instance_metadata.modloader_version {
        return true;
    }
    
    false
}

/// Get supported mod loaders
pub fn get_supported_loaders() -> Vec<&'static str> {
    vec!["forge", "fabric", "quilt", "neoforge"]
}

/// Validate if a mod loader is supported
pub fn is_loader_supported(loader: &str) -> bool {
    get_supported_loaders().contains(&loader.to_lowercase().as_str())
}

/// Get the minimum supported Minecraft version for Forge
pub fn get_min_forge_version() -> &'static str {
    "1.12.2"
}

/// Check if a Minecraft version is supported for the given mod loader
pub fn is_version_supported(minecraft_version: &str, mod_loader: &str) -> bool {
    match mod_loader.to_lowercase().as_str() {
        "forge" => {
            // Forge is supported from 1.12.2 onwards
            version_compare(minecraft_version, get_min_forge_version()) >= 0
        }
        "fabric" | "quilt" | "neoforge" => {
            // These loaders have broader version support
            true
        }
        _ => false,
    }
}

/// Simple version comparison (basic implementation)
fn version_compare(version1: &str, version2: &str) -> i32 {
    let v1_parts: Vec<u32> = version1
        .split('.')
        .filter_map(|s| s.parse().ok())
        .collect();
    let v2_parts: Vec<u32> = version2
        .split('.')
        .filter_map(|s| s.parse().ok())
        .collect();
    
    let max_len = v1_parts.len().max(v2_parts.len());
    
    for i in 0..max_len {
        let v1_part = v1_parts.get(i).unwrap_or(&0);
        let v2_part = v2_parts.get(i).unwrap_or(&0);
        
        if v1_part > v2_part {
            return 1;
        } else if v1_part < v2_part {
            return -1;
        }
    }
    
    0
} 