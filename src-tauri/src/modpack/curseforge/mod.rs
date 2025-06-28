pub mod types;
pub mod manifest;
pub mod downloader;
pub mod processor;

pub use processor::{
    process_curseforge_modpack_with_failed_tracking,
    process_curseforge_modpack_for_update
}; 