use std::path::PathBuf;
use anyhow::{Result, anyhow};
use lyceris::minecraft::{
    config::ConfigBuilder,
    emitter::{Emitter, Event},
    install::install,
    launch::launch,
    loader::{fabric::Fabric, forge::Forge, quilt::Quilt, neoforge::NeoForge, Loader},
};
use lyceris::auth::AuthMethod;
use crate::{Modpack, UserSettings};

/// Create a Lyceris emitter for progress tracking
pub fn create_emitter() -> Emitter {
    let emitter = Emitter::default();
    
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

/// Check if Java is available (Lyceris handles Java automatically)
pub async fn check_java_availability() -> Result<bool> {
    // Lyceris automatically downloads and manages Java versions
    // So we can always return true as it handles Java internally
    Ok(true)
}

/// Get the appropriate auth method based on user settings
fn get_auth_method(settings: &UserSettings) -> AuthMethod {
    match settings.auth_method.as_str() {
        "microsoft" => {
            if let Some(ref account) = settings.microsoft_account {
                AuthMethod::Microsoft {
                    username: account.username.clone(),
                    xuid: account.xuid.clone(),
                    uuid: account.uuid.clone(),
                    access_token: account.access_token.clone(),
                    refresh_token: account.refresh_token.clone(),
                }
            } else {
                // Fallback to offline if Microsoft account is not available
                AuthMethod::Offline {
                    username: settings.username.clone(),
                    uuid: None,
                }
            }
        }
        _ => AuthMethod::Offline {
            username: settings.username.clone(),
            uuid: None,
        }
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
    
    let auth_method = get_auth_method(settings);
    
    let config_builder = ConfigBuilder::new(
        instance_dir,
        modpack.minecraft_version.clone(),
        auth_method,
    );
    
    // Build config with or without mod loader
    if !modpack.modloader.is_empty() && !modpack.modloader_version.is_empty() {
        let loader = get_loader_by_name(&modpack.modloader, &modpack.modloader_version)?;
        let config = config_builder.loader(loader).build();
        install(&config, Some(&emitter)).await?;
    } else {
        let config = config_builder.build();
        install(&config, Some(&emitter)).await?;
    }
    
    Ok(())
}

/// Install Minecraft and mod loader using Lyceris (backward compatibility)
#[allow(dead_code)]
pub async fn install_minecraft_with_lyceris(
    modpack: &Modpack,
    settings: &UserSettings,
    instance_dir: PathBuf,
) -> Result<()> {
    let no_progress = |_: String, _: f32, _: String| {};
    install_minecraft_with_lyceris_progress(modpack, settings, instance_dir, no_progress).await
}

/// Create a Lyceris emitter with progress callback for progress tracking
pub fn create_emitter_with_progress<F>(emit_progress: F) -> Emitter 
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    let emitter = Emitter::default();
    
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
                            format!("Descargando {}", file_name), 
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
                            format!("Instalando: {}", line), 
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

/// Generate custom JVM arguments (excluding memory - handled by Lyceris)
fn generate_custom_jvm_args(_settings: &UserSettings, modpack: &Modpack) -> Vec<String> {
    let mut jvm_args = Vec::new();
    
    // Note: Memory allocation is handled by Lyceris' built-in memory system
    // Do not add -Xmx or -Xms here as it conflicts with Lyceris
    
    // Parse modpack recommended JVM args if available
    if !modpack.jvm_args_recomendados.is_empty() {
        for arg in modpack.jvm_args_recomendados.split_whitespace() {
            let arg = arg.trim();
            if !arg.is_empty() && !arg.starts_with("-Xmx") && !arg.starts_with("-Xms") {
                jvm_args.push(arg.to_string());
            }
        }
    }
    
    // Default optimized JVM args for Minecraft
    if jvm_args.len() <= 2 { // Only memory args added so far
        jvm_args.extend([
            "-XX:+UseG1GC".to_string(),
            "-XX:+ParallelRefProcEnabled".to_string(),
            "-XX:MaxGCPauseMillis=200".to_string(),
            "-XX:+UnlockExperimentalVMOptions".to_string(),
            "-XX:+DisableExplicitGC".to_string(),
            "-XX:+AlwaysPreTouch".to_string(),
            "-XX:G1NewSizePercent=30".to_string(),
            "-XX:G1MaxNewSizePercent=40".to_string(),
            "-XX:G1HeapRegionSize=8M".to_string(),
            "-XX:G1ReservePercent=20".to_string(),
            "-XX:G1HeapWastePercent=5".to_string(),
            "-XX:G1MixedGCCountTarget=4".to_string(),
            "-XX:InitiatingHeapOccupancyPercent=15".to_string(),
            "-XX:G1MixedGCLiveThresholdPercent=90".to_string(),
            "-XX:G1RSetUpdatingPauseTimePercent=5".to_string(),
            "-XX:SurvivorRatio=32".to_string(),
            "-XX:+PerfDisableSharedMem".to_string(),
            "-Dfml.ignoreInvalidMinecraftCertificates=true".to_string(),
            "-Dfml.ignorePatchDiscrepancies=true".to_string(),
        ]);
    }
    
    jvm_args
}

/// Launch Minecraft using Lyceris
pub async fn launch_minecraft(modpack: Modpack, settings: UserSettings) -> Result<()> {
    let launcher_data_dir = dirs::data_dir()
        .ok_or_else(|| anyhow!("Could not determine data directory"))?
        .join("LKLauncher");
    
    let instance_dir = launcher_data_dir
        .join("instances")
        .join(&modpack.id);
    
    // Ensure instance directory exists
    std::fs::create_dir_all(&instance_dir)?;
    
    let emitter = create_emitter();
    
    // Generate custom JVM arguments (excluding memory settings)
    let custom_jvm_args = generate_custom_jvm_args(&settings, &modpack);
    println!("Using custom JVM arguments: {:?}", custom_jvm_args);
    
    // Configure memory using Lyceris' built-in system
    let memory_gb = settings.allocated_ram.max(1);
    println!("Configuring memory: {}GB", memory_gb);

    // ------------------------------------------------------------
    // Attempt to use a user-selected Java executable if provided.
    // We expose it to Lyceris via the `LYCERIS_JAVA_PATH` env var and
    // also prepend its parent directory to the current PATH so that
    // any internal `which java` look-ups can find it first.
    // Lyceris will fall back to its own bundled/runtime Java download
    // logic automatically if the binary is not valid.
    if let Some(ref java_path) = settings.java_path {
        let java_path_trimmed = java_path.trim();
        if !java_path_trimmed.is_empty() {
            let candidate = std::path::Path::new(java_path_trimmed);
            if candidate.exists() {
                // Further validation: ensure it's a regular file and appears executable
                let metadata_ok = candidate.is_file();
                // Quick sanity: filename should contain "java" (handles java/javaw/java.exe)
                let name_ok = candidate
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.to_lowercase().contains("java"))
                    .unwrap_or(false);

                // Last resort: try invoking `java -version` to ensure it starts.
                let mut exec_ok = false;
                if metadata_ok {
                    if let Ok(output) = std::process::Command::new(candidate)
                        .arg("-version")
                        .stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null())
                        .status()
                    {
                        exec_ok = output.success();
                    }
                }

                if metadata_ok && name_ok && exec_ok {
                    // 1) Explicit env var for Lyceris (future-proof if upstream adds support).
                    std::env::set_var("LYCERIS_JAVA_PATH", java_path_trimmed);
                    // 2) Prepend parent dir to PATH for good measure.
                    if let Some(parent_dir) = candidate.parent() {
                        let parent_str = parent_dir.to_string_lossy();
                        let mut current_path = std::env::var("PATH").unwrap_or_default();
                        let sep = if cfg!(windows) { ";" } else { ":" };
                        if !current_path.split(if cfg!(windows) { ';' } else { ':' }).any(|p| p == parent_str) {
                            current_path = format!("{}{}{}", parent_str, sep, current_path);
                            std::env::set_var("PATH", current_path);
                        }
                    }
                    println!("Using user-provided Java executable at {}", java_path_trimmed);
                } else {
                    eprintln!("Warning: provided Java path '{}' is not a valid Java executable. Falling back to default Lyceris detection.", java_path_trimmed);
                    std::env::remove_var("LYCERIS_JAVA_PATH");
                }
            } else {
                eprintln!("Warning: provided Java path '{}' does not exist. Falling back to default Lyceris detection.", java_path_trimmed);
                std::env::remove_var("LYCERIS_JAVA_PATH");
            }
        }
    } else {
        // No custom Java path – make sure we don't keep a stale value around.
        std::env::remove_var("LYCERIS_JAVA_PATH");
    }

    let auth_method = get_auth_method(&settings);
    
    let mut config_builder = ConfigBuilder::new(
        instance_dir,
        modpack.minecraft_version.clone(),
        auth_method,
    );
    
    // Set memory using Lyceris' memory system
    config_builder = config_builder.memory(lyceris::minecraft::config::Memory::Gigabyte(memory_gb as u16));
    
    // Add custom JVM arguments using Lyceris' system
    config_builder = config_builder.custom_java_args(custom_jvm_args);
    
    // Build config with or without mod loader
    if !modpack.modloader.is_empty() && !modpack.modloader_version.is_empty() {
        let loader = get_loader_by_name(&modpack.modloader, &modpack.modloader_version)?;
        let config = config_builder.loader(loader).build();
    
        // Install/verify Minecraft installation first
        install(&config, Some(&emitter)).await?;
    
        // Launch Minecraft
        let mut child = launch(&config, Some(&emitter)).await?;
        
        // Spawn a task to wait for the process to complete
        tokio::spawn(async move {
            match child.wait().await {
                Ok(status) => {
                    if status.success() {
                        println!("Minecraft exited successfully");
                    } else {
                        println!("Minecraft exited with error: {:?}", status);
                    }
                }
                Err(e) => {
                    eprintln!("Error waiting for Minecraft process: {}", e);
                }
            }
        });
    } else {
        let config = config_builder.build();
        
        // Install/verify Minecraft installation first
        install(&config, Some(&emitter)).await?;
    
    // Launch Minecraft
        let mut child = launch(&config, Some(&emitter)).await?;
    
        // Spawn a task to wait for the process to complete
    tokio::spawn(async move {
            match child.wait().await {
                Ok(status) => {
                    if status.success() {
                        println!("Minecraft exited successfully");
                    } else {
                        println!("Minecraft exited with error: {:?}", status);
                    }
                }
                Err(e) => {
                    eprintln!("Error waiting for Minecraft process: {}", e);
                }
            }
        });
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