use std::path::PathBuf;
use std::fs;
use std::io::Write;
use anyhow::{Result, anyhow};
use chrono::{DateTime, Utc};
use crate::InstanceMetadata;

/// Get the path to the launcher data directory
pub fn get_launcher_data_dir() -> Result<PathBuf> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| anyhow!("Could not determine data directory"))?;
    
    let launcher_dir = data_dir.join("LKLauncher");
    
    // Ensure the directory exists
    fs::create_dir_all(&launcher_dir)?;
    
    Ok(launcher_dir)
}

/// Get the path to instances directory
pub fn get_instances_dir() -> Result<PathBuf> {
    let launcher_dir = get_launcher_data_dir()?;
    let instances_dir = launcher_dir.join("instances");
    
    // Ensure the directory exists
    fs::create_dir_all(&instances_dir)?;
    
    Ok(instances_dir)
}

/// Get the path to a specific instance directory
pub fn get_instance_dir(modpack_id: &str) -> Result<PathBuf> {
    let instances_dir = get_instances_dir()?;
    let instance_dir = instances_dir.join(modpack_id);
    
    Ok(instance_dir)
}

/// Save instance metadata to disk
pub async fn save_instance_metadata(metadata: &InstanceMetadata) -> Result<()> {
    let instance_dir = get_instance_dir(&metadata.id)?;
    
    // Ensure the instance directory exists
    fs::create_dir_all(&instance_dir)?;
    
    let metadata_path = instance_dir.join("instance.json");
    let metadata_json = serde_json::to_string_pretty(metadata)?;
    
    let mut file = fs::File::create(metadata_path)?;
    file.write_all(metadata_json.as_bytes())?;
    
    Ok(())
}

/// Load instance metadata from disk
pub async fn get_instance_metadata(modpack_id: &str) -> Result<Option<InstanceMetadata>> {
    let instance_dir = get_instance_dir(modpack_id)?;
    let metadata_path = instance_dir.join("instance.json");
    
    if !metadata_path.exists() {
        return Ok(None);
    }
    
    let metadata_content = fs::read_to_string(metadata_path)?;
    let metadata: InstanceMetadata = serde_json::from_str(&metadata_content)?;
    
    Ok(Some(metadata))
}

/// Delete an instance and all its files
pub async fn delete_instance(modpack_id: &str) -> Result<()> {
    let instance_dir = get_instance_dir(modpack_id)?;
    
    if !instance_dir.exists() {
        println!("Directory doesn't exist, nothing to delete: {:?}", instance_dir);
        return Ok(());
    }
    
    println!("Attempting to delete directory: {:?}", instance_dir);
    
    // Try to get directory metadata to check permissions
    match fs::metadata(&instance_dir) {
        Ok(metadata) => {
            println!("Directory metadata - readonly: {}, is_dir: {}", metadata.permissions().readonly(), metadata.is_dir());
        },
        Err(e) => {
            println!("Could not read directory metadata: {}", e);
        }
    }
    
    // Attempt deletion with detailed error reporting
    match fs::remove_dir_all(&instance_dir) {
        Ok(_) => {
            println!("Directory deleted successfully");
            Ok(())
        },
        Err(e) => {
            let error_kind = e.kind();
            let error_msg = format!("Failed to delete directory: {} (kind: {:?})", e, error_kind);
            println!("❌ {}", error_msg);
            
            // Try to provide more specific error information for macOS
            match error_kind {
                std::io::ErrorKind::PermissionDenied => {
                    return Err(anyhow!("Permission denied: Cannot delete modpack files. Please check that the launcher has proper permissions or try running as administrator."));
                },
                std::io::ErrorKind::NotFound => {
                    // Directory was already deleted, consider this success
                    println!("Directory was already deleted during removal process");
                    return Ok(());
                },
                _ => {
                    return Err(anyhow!("{}", error_msg));
                }
            }
        }
    }
}

/// Remove a modpack completely (alias for delete_instance for clarity)
pub async fn remove_modpack_completely(modpack_id: &str) -> Result<()> {
    println!("🗑️ Starting removal process for modpack: {}", modpack_id);
    
    // Get the instance directory path first to check if it exists
    let instance_dir = match get_instance_dir(modpack_id) {
        Ok(dir) => {
            println!("📁 Instance directory path: {:?}", dir);
            dir
        },
        Err(e) => {
            println!("❌ Error getting instance directory: {}", e);
            return Err(e);
        }
    };
    
    // Check if directory exists before trying to delete
    if !instance_dir.exists() {
        println!("⚠️ Instance directory does not exist: {:?}", instance_dir);
        return Ok(()); // Consider this a success since the goal is achieved
    }
    
    println!("🔍 Directory exists, proceeding with deletion...");
    
    // Use the existing delete_instance function
    match delete_instance(modpack_id).await {
        Ok(_) => {
            println!("✅ Modpack {} removed successfully", modpack_id);
            
            // Double-check that the directory was actually deleted
            if instance_dir.exists() {
                println!("⚠️ Warning: Directory still exists after deletion attempt");
                return Err(anyhow!("Directory was not completely removed"));
    }
    
    Ok(())
        },
        Err(e) => {
            println!("❌ Error during deletion: {}", e);
            Err(e)
        }
    }
}

/// Calculate the total size of an instance
#[allow(dead_code)]
pub async fn get_instance_size(modpack_id: &str) -> Result<u64> {
    let instance_dir = get_instance_dir(modpack_id)?;
    
    if !instance_dir.exists() {
        return Ok(0);
    }
    
    calculate_dir_size_sync(&instance_dir)
}

/// Calculate directory size recursively using synchronous operations
#[allow(dead_code)]
fn calculate_dir_size_sync(dir: &PathBuf) -> Result<u64> {
    let mut total_size = 0u64;
    
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(0),
    };
    
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;
        
        if metadata.is_file() {
            total_size += metadata.len();
        } else if metadata.is_dir() {
            total_size += calculate_dir_size_sync(&path)?;
        }
    }
    
    Ok(total_size)
}

/// List all installed instances
#[allow(dead_code)]
pub async fn list_instances() -> Result<Vec<InstanceMetadata>> {
    let instances_dir = get_instances_dir()?;
    let mut instances = Vec::new();
    
    if !instances_dir.exists() {
        return Ok(instances);
    }
    
    let entries = fs::read_dir(instances_dir)?;
    
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        
        if path.is_dir() {
            if let Some(instance_name) = path.file_name() {
                if let Some(instance_id) = instance_name.to_str() {
                    if let Ok(Some(metadata)) = get_instance_metadata(instance_id).await {
                        instances.push(metadata);
                    }
                }
            }
        }
    }
    
    Ok(instances)
}

/// Create the instance metadata object
#[allow(dead_code)]
pub fn create_instance_metadata(
    id: String,
    version: String,
    modloader: String,
    modloader_version: String,
    minecraft_version: String,
) -> InstanceMetadata {
    InstanceMetadata {
        id,
        version,
        installed_at: Utc::now().to_rfc3339(),
        modloader,
        modloader_version,
        minecraft_version,
    }
}

/// Check if an instance exists
#[allow(dead_code)]
pub async fn instance_exists(modpack_id: &str) -> bool {
    let instance_dir = get_instance_dir(modpack_id);
    
    match instance_dir {
        Ok(dir) => dir.exists(),
        Err(_) => false,
    }
}

/// Get the last modified time of an instance
#[allow(dead_code)]
pub async fn get_instance_last_modified(modpack_id: &str) -> Result<Option<DateTime<Utc>>> {
    let instance_dir = get_instance_dir(modpack_id)?;
    let metadata_path = instance_dir.join("instance.json");
    
    if !metadata_path.exists() {
        return Ok(None);
    }
    
    let metadata = fs::metadata(metadata_path)?;
    let modified = metadata.modified()?;
    let datetime: DateTime<Utc> = modified.into();
    
    Ok(Some(datetime))
} 