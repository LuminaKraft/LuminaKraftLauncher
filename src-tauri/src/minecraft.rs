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

/// Install Minecraft and mod loader using Lyceris
pub async fn install_minecraft_with_lyceris(
    modpack: &Modpack,
    settings: &UserSettings,
    instance_dir: PathBuf,
) -> Result<()> {
    let emitter = create_emitter();
    
    let config_builder = ConfigBuilder::new(
        instance_dir,
        modpack.minecraft_version.clone(),
        AuthMethod::Offline {
            username: settings.username.clone(),
            uuid: None,
        },
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
        .join("LuminaKraftLauncher");
    
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
    
    let mut config_builder = ConfigBuilder::new(
        instance_dir,
        modpack.minecraft_version.clone(),
        AuthMethod::Offline {
            username: settings.username.clone(),
            uuid: None,
        },
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