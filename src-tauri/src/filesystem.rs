use std::path::PathBuf;
use std::fs;
use std::io::Write;
use anyhow::{Result, anyhow};
use chrono::{DateTime, Utc};
use crate::InstanceMetadata;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};
use tauri::Emitter;

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

/// Migrate data from old caches/modpacks to new meta/modpacks location
/// This is called on app startup to ensure backward compatibility
pub fn migrate_caches_to_meta() -> Result<()> {
    let launcher_dir = get_launcher_data_dir()?;
    let old_path = launcher_dir.join("caches").join("modpacks");
    let new_path = launcher_dir.join("meta").join("modpacks");

    // Only migrate if old path exists and new path doesn't
    if old_path.exists() && !new_path.exists() {
        // Ensure parent directory exists
        if let Some(parent) = new_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Move the directory
        fs::rename(&old_path, &new_path)
            .map_err(|e| anyhow!("Failed to migrate caches/modpacks to meta/modpacks: {}", e))?;

        println!("✅ Migrated caches/modpacks/ → meta/modpacks/");

        // Try to remove the old caches directory if it's empty
        let caches_dir = launcher_dir.join("caches");
        if caches_dir.exists() {
            if let Ok(entries) = fs::read_dir(&caches_dir) {
                if entries.count() == 0 {
                    let _ = fs::remove_dir(&caches_dir);
                    println!("🗑️ Removed empty caches/ directory");
                }
            }
        }
    }

    Ok(())
}

/// Sanitize a modpack name to be filesystem-safe
fn sanitize_folder_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            // Replace invalid characters with underscore
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Generate a unique folder name for an instance, handling duplicates like Windows (1), (2), etc.
pub fn generate_instance_folder_name(modpack_name: &str) -> Result<String> {
    let instances_dir = get_instances_dir()?;
    let base_name = sanitize_folder_name(modpack_name);

    // If the base name doesn't exist, use it directly
    let base_path = instances_dir.join(&base_name);
    if !base_path.exists() {
        return Ok(base_name);
    }

    // Otherwise, try with (1), (2), (3), etc.
    for i in 1..1000 {
        let candidate_name = format!("{} ({})", base_name, i);
        let candidate_path = instances_dir.join(&candidate_name);
        if !candidate_path.exists() {
            return Ok(candidate_name);
        }
    }

    Err(anyhow!("Could not generate unique folder name for modpack"))
}

/// Get the path to a specific instance directory by modpack ID
/// This function now looks up instances by their metadata to find the correct folder
pub fn get_instance_dir(modpack_id: &str) -> Result<PathBuf> {
    let instances_dir = get_instances_dir()?;

    // Look for an instance with this ID
    if let Ok(entries) = fs::read_dir(&instances_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let metadata_path = path.join("instance.json");
                if metadata_path.exists() {
                    if let Ok(content) = fs::read_to_string(&metadata_path) {
                        if let Ok(metadata) = serde_json::from_str::<InstanceMetadata>(&content) {
                            if metadata.id == modpack_id {
                                return Ok(path);
                            }
                        }
                    }
                }
            }
        }
    }

    // If not found, fall back to using the ID as folder name (for backwards compatibility)
    Ok(instances_dir.join(modpack_id))
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

/// Save minimal modpack metadata to cache for display purposes
/// Only saves UI-relevant data: name, logo, backgroundImage, urlModpackZip
/// Technical data (version, modloader, etc.) comes from instance.json
/// IMPORTANT: Preserves existing values if new values are empty (for updates)
pub async fn save_modpack_metadata(modpack: &crate::Modpack) -> Result<()> {
    let launcher_dir = get_launcher_data_dir()?;
    let meta_dir = launcher_dir.join("meta").join("modpacks");

    // Ensure meta directory exists
    tokio::fs::create_dir_all(&meta_dir).await?;

    let metadata_path = meta_dir.join(format!("{}.json", modpack.id));

    // Load existing metadata to preserve values that shouldn't be overwritten
    let existing_data: Option<serde_json::Value> = if metadata_path.exists() {
        match tokio::fs::read_to_string(&metadata_path).await {
            Ok(content) => serde_json::from_str(&content).ok(),
            Err(_) => None,
        }
    } else {
        None
    };

    // Helper to get existing value or default
    let get_existing = |key: &str| -> String {
        existing_data
            .as_ref()
            .and_then(|d| d.get(key))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };

    // Use new value if not empty, otherwise preserve existing
    let name = if modpack.name.is_empty() { get_existing("name") } else { modpack.name.clone() };
    let logo = if modpack.logo.is_empty() { get_existing("logo") } else { modpack.logo.clone() };
    let background = if modpack.banner_url.is_empty() { get_existing("backgroundImage") } else { modpack.banner_url.clone() };
    
    // urlModpackZip: only save if it's a valid HTTP URL, otherwise preserve existing
    let url_to_save = if modpack.url_modpack_zip.starts_with("http") {
        modpack.url_modpack_zip.clone()
    } else {
        get_existing("urlModpackZip")
    };
    
    let cache_data = serde_json::json!({
        "name": name,
        "logo": logo,
        "backgroundImage": background,
        "urlModpackZip": url_to_save
    });

    let metadata_json = serde_json::to_string_pretty(&cache_data)?;
    tokio::fs::write(&metadata_path, metadata_json).await?;

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

/// Delete cache for a modpack (images and metadata)
pub async fn delete_modpack_cache(modpack_id: &str) -> Result<()> {
    let launcher_dir = dirs::data_dir()
        .ok_or_else(|| anyhow!("Failed to get data directory"))?
        .join("LKLauncher");

    // Delete modpack meta directory
    let meta_dir = launcher_dir
        .join("meta")
        .join("modpacks")
        .join(modpack_id);

    if meta_dir.exists() {
        fs::remove_dir_all(&meta_dir)
            .map_err(|e| anyhow!("Failed to delete modpack metadata: {}", e))?;
        println!("✓ Deleted metadata for modpack: {}", modpack_id);
    }

    // Delete modpack metadata JSON
    let metadata_path = launcher_dir
        .join("meta")
        .join("modpacks")
        .join(format!("{}.json", modpack_id));

    if metadata_path.exists() {
        fs::remove_file(&metadata_path)
            .map_err(|e| anyhow!("Failed to delete modpack metadata: {}", e))?;
        println!("✓ Deleted metadata for modpack: {}", modpack_id);
    }

    Ok(())
}

/// Delete an instance and all its files
pub async fn delete_instance(modpack_id: &str) -> Result<()> {
    let instance_dir = get_instance_dir(modpack_id)?;

    // Delete cache files first (non-fatal if fails)
    if let Err(e) = delete_modpack_cache(modpack_id).await {
        eprintln!("⚠️ Warning: Failed to clean cache: {}", e);
    }

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

/// Try to fix instance name by reading from manifest.json or minecraftinstance.json
fn try_fix_instance_name(instance_dir: &std::path::Path, metadata: &mut InstanceMetadata) -> Result<bool> {
    // Only try to fix if name is same as ID (which implies it's using the folder name)
    if metadata.name != metadata.id {
        return Ok(false);
    }

    let mut new_name = None;

    // Try manifest.json first
    let manifest_path = instance_dir.join("manifest.json");
    if manifest_path.exists() {
        if let Ok(content) = fs::read_to_string(&manifest_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(name) = json.get("name").and_then(|n| n.as_str()) {
                    new_name = Some(name.to_string());
                }
            }
        }
    }

    // Try minecraftinstance.json if manifest.json didn't work
    if new_name.is_none() {
        let instance_cfg_path = instance_dir.join("minecraftinstance.json");
        if instance_cfg_path.exists() {
            if let Ok(content) = fs::read_to_string(&instance_cfg_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(name) = json.get("name").and_then(|n| n.as_str()) {
                        new_name = Some(name.to_string());
                    }
                }
            }
        }
    }

    if let Some(name) = new_name {
        if name != metadata.name {
            println!("🔧 Auto-fixing instance name for {}: {} -> {}", metadata.id, metadata.name, name);
            metadata.name = name;
            
            // Save the updated metadata
            let metadata_path = instance_dir.join("instance.json");
            let metadata_json = serde_json::to_string_pretty(metadata)?;
            let mut file = fs::File::create(metadata_path)?;
            file.write_all(metadata_json.as_bytes())?;
            
            return Ok(true);
        }
    }

    Ok(false)
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
                    if let Ok(Some(mut metadata)) = get_instance_metadata(instance_id).await {
                        // Try to fix name if needed
                        let _ = try_fix_instance_name(&path, &mut metadata);
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
    name: String,
    version: String,
    modloader: String,
    modloader_version: String,
    minecraft_version: String,
) -> InstanceMetadata {
    InstanceMetadata {
        id,
        name,
        version,
        installed_at: Utc::now().to_rfc3339(),
        modloader,
        modloader_version,
        minecraft_version,
        recommended_ram: None,
        ram_allocation: Some("global".to_string()),
        custom_ram: None,
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

/// Add mod and resourcepack files to an existing instance
///
/// This function copies files from a temporary location to the instance's appropriate folder:
/// - .jar files go to mods/ folder (mods)
/// - .zip files go to resourcepacks/ folder (texture packs/resource packs)
///
/// # Arguments
/// * `modpack_id` - The ID of the modpack instance
/// * `file_paths` - Vector of paths to the files to copy
///
/// # Returns
/// * `Ok(())` if all files were copied successfully
/// * `Err` if the instance doesn't exist or copying fails
pub async fn add_mods_to_instance(modpack_id: &str, file_paths: Vec<PathBuf>) -> Result<()> {
    let instance_dir = get_instance_dir(modpack_id)?;

    if !instance_dir.exists() {
        return Err(anyhow!("Instance directory does not exist: {}", modpack_id));
    }

    // Get or create the mods and resourcepacks folders
    let mods_dir = instance_dir.join(".minecraft").join("mods");
    let resourcepacks_dir = instance_dir.join(".minecraft").join("resourcepacks");
    fs::create_dir_all(&mods_dir)?;
    fs::create_dir_all(&resourcepacks_dir)?;

    println!("📦 Adding {} file(s) to instance: {}", file_paths.len(), modpack_id);

    // Copy each file to the appropriate directory based on extension
    for file_path in file_paths {
        if !file_path.exists() {
            println!("⚠️ File does not exist, skipping: {:?}", file_path);
            continue;
        }

        let file_name = file_path.file_name()
            .ok_or_else(|| anyhow!("Invalid file path: {:?}", file_path))?;

        // Determine destination based on file extension
        let dest_dir = if file_path.extension().and_then(|s| s.to_str()) == Some("jar") {
            &mods_dir
        } else if file_path.extension().and_then(|s| s.to_str()) == Some("zip") {
            &resourcepacks_dir
        } else {
            println!("⚠️ Unknown file extension, skipping: {:?}", file_path);
            continue;
        };

        let dest_path = dest_dir.join(file_name);

        println!("📁 Copying {:?} to {:?}", file_path, dest_path);

        match fs::copy(&file_path, &dest_path) {
            Ok(bytes) => {
                println!("✅ Copied {} bytes successfully", bytes);
            }
            Err(e) => {
                println!("❌ Failed to copy file: {}", e);
                return Err(anyhow!("Failed to copy file {:?}: {}", file_name, e));
            }
        }
    }

    println!("✅ All files added successfully to instance: {}", modpack_id);
    Ok(())
}

/// Create a new modpack ZIP with uploaded files added to overrides
///
/// This function takes an existing modpack ZIP file and creates a new ZIP
/// with additional files added to the overrides/mods/ or overrides/resourcepacks/ folders.
/// - .jar files are added to overrides/mods/
/// - .zip files are added to overrides/resourcepacks/
///
/// # Arguments
/// * `original_zip_path` - Path to the original modpack ZIP file
/// * `uploaded_files` - Vector of paths to files to add to overrides
/// * `output_zip_path` - Path where the new ZIP file will be created
///
/// # Returns
/// * `Ok(())` if the ZIP was created successfully
/// * `Err` if reading/writing fails
pub async fn create_modpack_with_overrides(
    original_zip_path: PathBuf,
    uploaded_files: Vec<PathBuf>,
    output_zip_path: PathBuf,
    app_handle: Option<tauri::AppHandle>,
) -> Result<()> {
    use std::io::BufReader;
    use serde::Serialize;

    #[derive(Clone, Serialize)]
    struct ZipProgress {
        current: usize,
        total: usize,
        stage: String,
        message: String,
    }

    let emit_progress = |stage: &str, message: &str, current: usize, total: usize| {
        if let Some(ref handle) = app_handle {
            let _ = handle.emit("zip-progress", ZipProgress {
                current,
                total,
                stage: stage.to_string(),
                message: message.to_string(),
            });
        }
    };

    println!("📦 Creating new modpack ZIP with overrides...");
    println!("   Original: {:?}", original_zip_path);
    println!("   Output: {:?}", output_zip_path);
    println!("   Files to add: {}", uploaded_files.len());

    // Open original ZIP for reading
    let original_file = fs::File::open(&original_zip_path)?;
    let original_file_buffered = BufReader::new(original_file);
    let mut original_archive = ZipArchive::new(original_file_buffered)?;

    // Create new ZIP for writing with buffered writer
    let output_file = fs::File::create(&output_zip_path)?;
    let output_file_buffered = std::io::BufWriter::new(output_file);
    let mut output_zip = ZipWriter::new(output_file_buffered);

    // Copy all files from original ZIP to new ZIP using raw copy (faster)
    let total_files = original_archive.len();
    let total_steps = total_files + uploaded_files.len() + 1; // +1 for finalization

    emit_progress("copying", &format!("Copying {} files from original ZIP", total_files), 0, total_steps);
    println!("📁 Copying {} entries from original ZIP...", total_files);

    for i in 0..total_files {
        let mut file = original_archive.by_index(i)?;
        let file_name = file.name().to_string();

        // Skip directories
        if file.is_dir() {
            continue;
        }

        // Use stored (no compression) for faster copying
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);

        output_zip.start_file(&file_name, options)?;
        std::io::copy(&mut file, &mut output_zip)?;

        // Emit progress every 10 files or on last file
        if i % 10 == 0 || i == total_files - 1 {
            emit_progress("copying", &format!("Copying files... ({}/{})", i + 1, total_files), i + 1, total_steps);
        }
    }
    println!("✅ Finished copying original files");

    // Add uploaded files to overrides folder
    emit_progress("adding", &format!("Adding {} uploaded files to overrides", uploaded_files.len()), total_files, total_steps);
    println!("📁 Adding {} uploaded files to overrides...", uploaded_files.len());

    for (idx, file_path) in uploaded_files.iter().enumerate() {
        if !file_path.exists() {
            println!("⚠️ File does not exist, skipping: {:?}", file_path);
            continue;
        }

        let file_name = file_path.file_name()
            .ok_or_else(|| anyhow!("Invalid file path: {:?}", file_path))?
            .to_str()
            .ok_or_else(|| anyhow!("Invalid UTF-8 in file name: {:?}", file_path))?;

        // Determine the target folder in overrides
        let target_folder = if file_path.extension().and_then(|s| s.to_str()) == Some("jar") {
            "overrides/mods"
        } else if file_path.extension().and_then(|s| s.to_str()) == Some("zip") {
            "overrides/resourcepacks"
        } else {
            println!("⚠️ Unknown file extension, skipping: {:?}", file_path);
            continue;
        };

        let zip_path = format!("{}/{}", target_folder, file_name);
        emit_progress("adding", &format!("Adding {} ({}/{})", file_name, idx + 1, uploaded_files.len()), total_files + idx + 1, total_steps);

        // Use stored compression for user files too (faster)
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);

        output_zip.start_file(&zip_path, options)?;

        let mut file = fs::File::open(&file_path)?;
        std::io::copy(&mut file, &mut output_zip)?;
    }

    // Finalize the ZIP
    emit_progress("finalizing", "Finalizing ZIP file...", total_steps - 1, total_steps);
    println!("📁 Finalizing ZIP file...");
    output_zip.finish()?;

    emit_progress("complete", "ZIP file created successfully!", total_steps, total_steps);
    println!("✅ New modpack ZIP created successfully: {:?}", output_zip_path);
    Ok(())
}

/// Save modpack image (logo or banner) to cache
pub async fn save_modpack_image(
    modpack_id: &str,
    image_type: &str, // "logo" or "banner"
    image_data: Vec<u8>,
    file_name: &str,
) -> Result<()> {
    let launcher_dir = get_launcher_data_dir()?;
    let modpack_images_dir = launcher_dir
        .join("meta")
        .join("modpacks")
        .join(modpack_id)
        .join("images");

    // Ensure images directory exists
    tokio::fs::create_dir_all(&modpack_images_dir).await?;

    // Delete previous images of this type (e.g., logo_*.png or banner_*.jpeg)
    if let Ok(mut entries) = tokio::fs::read_dir(&modpack_images_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if let Some(file_name_str) = path.file_name().and_then(|n| n.to_str()) {
                if file_name_str.starts_with(&format!("{}_", image_type)) {
                    let _ = tokio::fs::remove_file(&path).await;
                    println!("🗑️  Deleted old {} image: {:?}", image_type, file_name_str);
                }
            }
        }
    }

    // Save image with provided filename (includes random ID)
    let image_path = modpack_images_dir.join(file_name);
    tokio::fs::write(&image_path, image_data).await?;
    println!("💾 Saved {} image: {}", image_type, file_name);

    // Update modpack metadata JSON with new image path
    let meta_dir = launcher_dir.join("meta").join("modpacks");
    let metadata_path = meta_dir.join(format!("{}.json", modpack_id));

    if metadata_path.exists() {
        if let Ok(content) = tokio::fs::read_to_string(&metadata_path).await {
            if let Ok(mut metadata) = serde_json::from_str::<serde_json::Value>(&content) {
                // Create relative path for storage (will be resolved at runtime)
                let relative_path = format!("meta/modpacks/{}/images/{}", modpack_id, file_name);

                if image_type == "logo" {
                    metadata["logo"] = serde_json::Value::String(relative_path);
                } else if image_type == "banner" {
                    metadata["backgroundImage"] = serde_json::Value::String(relative_path);
                }

                let updated_json = serde_json::to_string_pretty(&metadata)?;
                tokio::fs::write(&metadata_path, updated_json).await?;
                println!("✅ Updated cache JSON for {} image for modpack {}", image_type, modpack_id);
            }
        }
    }

    Ok(())
} 