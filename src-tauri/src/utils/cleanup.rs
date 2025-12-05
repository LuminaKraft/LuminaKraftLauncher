use std::path::PathBuf;

/// Helper function to safely clean up temporary files
pub fn cleanup_temp_file(file_path: &PathBuf) {
    if file_path.exists() {
        if let Err(e) = std::fs::remove_file(file_path) {
            println!("⚠️ Warning: Failed to clean up temp file {}: {}", file_path.display(), e);
        }
    }
}

/// Helper function to safely clean up temporary directories
pub fn cleanup_temp_dir(dir_path: &PathBuf) {
    if dir_path.exists() && dir_path.is_dir() {
        if let Err(e) = std::fs::remove_dir_all(dir_path) {
            println!("⚠️ Warning: Failed to clean up temp directory {}: {}", dir_path.display(), e);
        }
    }
}

 