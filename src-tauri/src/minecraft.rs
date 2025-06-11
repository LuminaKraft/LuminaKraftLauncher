use std::process::Command;
use std::path::Path;
use serde_json::Value;
use anyhow::{Result, anyhow};
use crate::{Modpack, UserSettings};

pub async fn check_java_availability() -> Result<bool> {
    let output = Command::new("java")
        .arg("-version")
        .output();
        
    match output {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

pub async fn get_java_path() -> Result<Option<String>> {
    // Try to find Java in common locations
    let java_paths = if cfg!(target_os = "windows") {
        vec![
            "java",
            "C:\\Program Files\\Java\\jdk-17\\bin\\java.exe",
            "C:\\Program Files\\Java\\jdk-11\\bin\\java.exe",
            "C:\\Program Files\\Java\\jdk-8\\bin\\java.exe",
            "C:\\Program Files (x86)\\Java\\jdk-17\\bin\\java.exe",
            "C:\\Program Files (x86)\\Java\\jdk-11\\bin\\java.exe",
            "C:\\Program Files (x86)\\Java\\jdk-8\\bin\\java.exe",
        ]
    } else {
        vec![
            "java",
            "/usr/bin/java",
            "/usr/lib/jvm/java-17-openjdk/bin/java",
            "/usr/lib/jvm/java-11-openjdk/bin/java",
            "/usr/lib/jvm/java-8-openjdk/bin/java",
        ]
    };

    for java_path in java_paths {
        let output = Command::new(java_path)
            .arg("-version")
            .output();
            
        if let Ok(output) = output {
            if output.status.success() {
                return Ok(Some(java_path.to_string()));
            }
        }
    }
    
    Ok(None)
}

fn get_java_version(java_path: &str) -> Result<String> {
    let output = Command::new(java_path)
        .arg("-version")
        .output()?;
        
    if !output.status.success() {
        return Err(anyhow!("Failed to get Java version"));
    }
    
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    // Parse Java version from stderr output
    for line in stderr.lines() {
        if line.contains("version") {
            if let Some(start) = line.find('"') {
                if let Some(end) = line.rfind('"') {
                    if start < end {
                        return Ok(line[start+1..end].to_string());
                    }
                }
            }
        }
    }
    
    Err(anyhow!("Could not parse Java version"))
}

fn get_optimized_jvm_args(allocated_ram: u32, java_version: &str) -> Vec<String> {
    let mut args = vec![
        format!("-Xmx{}M", allocated_ram),
        format!("-Xms{}M", std::cmp::min(allocated_ram / 4, 1024)),
        "-XX:+UnlockExperimentalVMOptions".to_string(),
        "-XX:+UseG1GC".to_string(),
        "-XX:G1NewSizePercent=20".to_string(),
        "-XX:G1ReservePercent=20".to_string(),
        "-XX:MaxGCPauseMillis=50".to_string(),
        "-XX:G1HeapRegionSize=32M".to_string(),
    ];

    // Add Java 17+ specific optimizations
    if java_version.starts_with("17") || java_version.starts_with("18") || java_version.starts_with("19") {
        args.extend_from_slice(&[
            "-XX:+UseStringDeduplication".to_string(),
            "-XX:+UnlockDiagnosticVMOptions".to_string(),
            "-XX:+DisableExplicitGC".to_string(),
        ]);
    }

    args
}

async fn get_minecraft_manifest() -> Result<Value> {
    let response = reqwest::get("https://launchermeta.mojang.com/mc/game/version_manifest.json")
        .await?;
    
    let manifest: Value = response.json().await?;
    Ok(manifest)
}

async fn get_version_info(version: &str) -> Result<Value> {
    let manifest = get_minecraft_manifest().await?;
    
    if let Some(versions) = manifest["versions"].as_array() {
        for version_info in versions {
            if let Some(id) = version_info["id"].as_str() {
                if id == version {
                    if let Some(url) = version_info["url"].as_str() {
                        let response = reqwest::get(url).await?;
                        let version_data: Value = response.json().await?;
                        return Ok(version_data);
                    }
                }
            }
        }
    }
    
    Err(anyhow!("Version {} not found", version))
}

async fn build_classpath(version_info: &Value, minecraft_dir: &Path) -> Result<String> {
    let mut classpath: Vec<String> = Vec::new();
    
    // Add libraries
    if let Some(libraries) = version_info["libraries"].as_array() {
        for library in libraries {
            if let Some(downloads) = library["downloads"].as_object() {
                if let Some(artifact) = downloads["artifact"].as_object() {
                    if let Some(path) = artifact["path"].as_str() {
                        let lib_path = minecraft_dir.join("libraries").join(path);
                        if lib_path.exists() {
                            classpath.push(lib_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }
    
    // Add minecraft client jar
    let client_jar = minecraft_dir
        .join("versions")
        .join(version_info["id"].as_str().unwrap_or("unknown"))
        .join(format!("{}.jar", version_info["id"].as_str().unwrap_or("unknown")));
    
    if client_jar.exists() {
        classpath.push(client_jar.to_string_lossy().to_string());
    }
    
    Ok(classpath.join(if cfg!(target_os = "windows") { ";" } else { ":" }))
}

fn replace_minecraft_args(args: &str, replacements: &std::collections::HashMap<String, String>) -> String {
    let mut result = args.to_string();
    
    for (key, value) in replacements {
        result = result.replace(&format!("${{{}}}", key), value);
    }
    
    result
}

pub async fn launch_minecraft(modpack: Modpack, settings: UserSettings) -> Result<()> {
    let java_path = match &settings.java_path {
        Some(path) => path.clone(),
        None => {
            match get_java_path().await? {
                Some(path) => path,
                None => return Err(anyhow!("Java not found")),
            }
        }
    };
    
    let java_version = get_java_version(&java_path)?;
    let minecraft_dir = dirs::data_dir()
        .ok_or_else(|| anyhow!("Could not determine data directory"))?
        .join("luminakraft-launcher")
        .join("minecraft");
    
    let instance_dir = minecraft_dir
        .join("instances")
        .join(&modpack.id);
    
    // Ensure directories exist
    std::fs::create_dir_all(&instance_dir)?;
    std::fs::create_dir_all(minecraft_dir.join("assets"))?;
    std::fs::create_dir_all(minecraft_dir.join("libraries"))?;
    std::fs::create_dir_all(minecraft_dir.join("versions"))?;
    
    // Download Minecraft assets and libraries (simplified)
    ensure_minecraft_assets(&modpack.minecraft_version).await?;
    
    // Get version info
    let version_info = get_version_info(&modpack.minecraft_version).await?;
    
    // Build classpath
    let classpath = build_classpath(&version_info, &minecraft_dir).await?;
    
    // Prepare JVM arguments
    let mut jvm_args = get_optimized_jvm_args(settings.allocated_ram, &java_version);
    
    // Add custom JVM args from modpack
    if !modpack.jvm_args_recomendados.is_empty() {
        let custom_args: Vec<String> = modpack.jvm_args_recomendados
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();
        jvm_args.extend(custom_args);
    }
    
    // Add classpath
    jvm_args.push("-cp".to_string());
    jvm_args.push(classpath);
    
    // Main class
    let main_class = version_info["mainClass"]
        .as_str()
        .unwrap_or("net.minecraft.client.main.Main");
    jvm_args.push(main_class.to_string());
    
    // Minecraft arguments
    let mut replacements = std::collections::HashMap::new();
    replacements.insert("auth_player_name".to_string(), settings.username.clone());
    replacements.insert("version_name".to_string(), modpack.minecraft_version.clone());
    replacements.insert("game_directory".to_string(), instance_dir.to_string_lossy().to_string());
    replacements.insert("assets_root".to_string(), minecraft_dir.join("assets").to_string_lossy().to_string());
    replacements.insert("auth_uuid".to_string(), uuid::Uuid::new_v4().to_string());
    replacements.insert("auth_access_token".to_string(), "offline".to_string());
    replacements.insert("user_type".to_string(), "legacy".to_string());
    replacements.insert("version_type".to_string(), "release".to_string());
    
    if let Some(game_args) = version_info["minecraftArguments"].as_str() {
        let processed_args = replace_minecraft_args(game_args, &replacements);
        let game_args_vec: Vec<String> = processed_args
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();
        jvm_args.extend(game_args_vec);
    }
    
    // Launch Minecraft
    let mut command = Command::new(&java_path);
    command.args(&jvm_args);
    command.current_dir(&instance_dir);
    
    let mut child = command.spawn()?;
    
    // Wait for the process to finish or detach it
    tokio::spawn(async move {
        let _ = child.wait();
    });
    
    Ok(())
}

pub async fn ensure_minecraft_assets(_version: &str) -> Result<()> {
    // This is a simplified version
    // In a complete implementation, you would:
    // 1. Download the version manifest
    // 2. Download all required libraries
    // 3. Download the client jar
    // 4. Download assets index and assets
    
    // For now, we'll just ensure the directories exist
    let minecraft_dir = dirs::data_dir()
        .ok_or_else(|| anyhow!("Could not determine data directory"))?
        .join("luminakraft-launcher")
        .join("minecraft");
    
    std::fs::create_dir_all(minecraft_dir.join("assets"))?;
    std::fs::create_dir_all(minecraft_dir.join("libraries"))?;
    std::fs::create_dir_all(minecraft_dir.join("versions"))?;
    
    Ok(())
} 