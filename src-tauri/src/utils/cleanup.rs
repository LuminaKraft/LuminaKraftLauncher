use std::path::PathBuf;

/// Helper function to safely clean up temporary files
pub fn cleanup_temp_file(file_path: &PathBuf) {
    if file_path.exists() {
        if let Err(e) = std::fs::remove_file(file_path) {
            println!("⚠️ Warning: Failed to clean up temp file {}: {}", file_path.display(), e);
        }
    }
}

 