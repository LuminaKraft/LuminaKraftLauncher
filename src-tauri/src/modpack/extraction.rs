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
    
    // Test write permissions
    let temp_test_file = extract_to.join("._temp_write_test");
    if let Err(e) = std::fs::write(&temp_test_file, b"write_test") {
        return Err(anyhow!("No write permissions in extraction directory {}: {}", extract_to.display(), e));
    }
    
    if temp_test_file.exists() {
        let _ = std::fs::remove_file(&temp_test_file);
    }
    
    // Parallel extraction
    use rayon::prelude::*;
    let mut archive = ZipArchive::new(std::fs::File::open(zip_path)?)
        .map_err(|e| anyhow!("Failed to read ZIP archive: {}", e))?;
    
    // Collect file info (index and name) to avoid repeated string searches (O(1) lookup vs O(n))
    let file_info: Vec<(usize, String)> = (0..archive.len())
        .filter_map(|i| {
            if let Ok(file) = archive.by_index(i) {
                if let Some(name) = file.enclosed_name() {
                    return Some((i, name.to_string_lossy().into_owned()));
                }
            }
            None
        })
        .collect();
    
    if file_info.is_empty() {
        return Err(anyhow!("No valid files found in ZIP archive"));
    }

    file_info.into_par_iter().for_each(|(index, name)| {
        // Open the file independently in each thread to avoid shared cursor issues
        if let Ok(file_handle) = std::fs::File::open(zip_path) {
            if let Ok(mut archive) = ZipArchive::new(file_handle) {
                // Extract using index for maximum performance
                match archive.by_index(index) {
                    Ok(mut file) => {
                        let output_path = extract_to.join(&name);
                        
                        if file.is_dir() {
                            let _ = std::fs::create_dir_all(&output_path);
                        } else {
                            if let Some(parent) = output_path.parent() {
                                let _ = std::fs::create_dir_all(parent);
                            }
                            
                            if let Ok(mut output_file) = std::fs::File::create(&output_path) {
                                let _ = std::io::copy(&mut file, &mut output_file);
                            }
                        }
                    },
                    Err(e) => {
                        eprintln!("⚠️ Warning: Failed to extract file at index {} ({}) from ZIP: {}", index, name, e);
                    }
                }
            } else {
                eprintln!("⚠️ Warning: Failed to open ZIP archive in thread for file {}", name);
            }
        } else {
            eprintln!("⚠️ Warning: Failed to open ZIP file in thread for file {}", name);
        }
    });
    
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