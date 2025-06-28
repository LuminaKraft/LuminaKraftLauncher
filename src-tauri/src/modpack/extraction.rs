use anyhow::{Result, anyhow};
use std::path::PathBuf;
use zip::ZipArchive;

/// Extract a ZIP file using standard Rust zip library
pub fn extract_zip(zip_path: &PathBuf, extract_to: &PathBuf) -> Result<()> {
    // Validate ZIP file exists and is readable
    if !zip_path.exists() {
        return Err(anyhow!("ZIP file not found: {}", zip_path.display()));
    }
    
    let file_size = std::fs::metadata(zip_path)?.len();
    if file_size == 0 {
        return Err(anyhow!("ZIP file is empty: {}", zip_path.display()));
    }
    
    // Create extraction directory
    if let Err(e) = std::fs::create_dir_all(extract_to) {
        return Err(anyhow!("Failed to create extraction directory {}: {}", extract_to.display(), e));
    }
    
    // Verify directory was created successfully
    if !extract_to.exists() {
        return Err(anyhow!("Extraction directory was not created: {}", extract_to.display()));
    }
    
    // Test write permissions
    let temp_test_file = extract_to.join("._temp_write_test");
    if let Err(e) = std::fs::write(&temp_test_file, b"write_test") {
        return Err(anyhow!("No write permissions in extraction directory {}: {}", extract_to.display(), e));
    }
    
    if temp_test_file.exists() {
        let _ = std::fs::remove_file(&temp_test_file);
    }
    
    // Extract ZIP file
    let file = std::fs::File::open(zip_path)
        .map_err(|e| anyhow!("Failed to open ZIP file {}: {}", zip_path.display(), e))?;
    
    let mut archive = ZipArchive::new(file)
        .map_err(|e| anyhow!("Failed to read ZIP archive {}: {}", zip_path.display(), e))?;
    
    // Extract each file
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| anyhow!("Failed to access file {} in ZIP: {}", i, e))?;
        
        let file_path = match file.enclosed_name() {
            Some(path) => path,
            None => continue,
        };
        
        let output_path = extract_to.join(file_path);
        
        if file.is_dir() {
            std::fs::create_dir_all(&output_path)
                .map_err(|e| anyhow!("Failed to create directory {}: {}", output_path.display(), e))?;
        } else {
            if let Some(parent) = output_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| anyhow!("Failed to create parent directory {}: {}", parent.display(), e))?;
            }
            
            let mut output_file = std::fs::File::create(&output_path)
                .map_err(|e| anyhow!("Failed to create output file {}: {}", output_path.display(), e))?;
            
            std::io::copy(&mut file, &mut output_file)
                .map_err(|e| anyhow!("Failed to extract file {}: {}", output_path.display(), e))?;
        }
    }
    
    // Verify extraction worked
    match std::fs::read_dir(extract_to) {
        Ok(entries) => {
            let file_count = entries.count();
            if file_count == 0 {
                return Err(anyhow!("Extraction completed but no files were extracted"));
            }
        },
        Err(e) => {
            return Err(anyhow!("Cannot verify extraction - unable to read directory {}: {}", extract_to.display(), e));
        }
    }
    
    Ok(())
} 