use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Modrinth modpack manifest (modrinth.index.json)
/// Based on the mrpack format specification
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthManifest {
    pub format_version: i32,
    pub game: String,
    pub version_id: String,
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    pub files: Vec<ModrinthFile>,
    pub dependencies: HashMap<String, String>, // e.g., "minecraft" -> "1.20.1", "fabric-loader" -> "0.15.0"
}

/// A file entry in the Modrinth modpack manifest
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthFile {
    pub path: String,           // e.g., "mods/sodium-fabric-0.5.8+mc1.20.4.jar"
    pub hashes: ModrinthHashes,
    #[serde(default)]
    pub env: Option<ModrinthEnv>,
    pub downloads: Vec<String>, // Direct download URLs (CDN links)
    pub file_size: u64,
}

/// Hash values for file verification
#[derive(Debug, Deserialize, Serialize)]
pub struct ModrinthHashes {
    pub sha1: String,
    pub sha512: String,
}

/// Environment specification (client/server side requirements)
#[derive(Debug, Deserialize, Serialize)]
pub struct ModrinthEnv {
    #[serde(default)]
    pub client: Option<String>, // "required", "optional", "unsupported"
    #[serde(default)]
    pub server: Option<String>,
}

/// Known dependency keys in Modrinth manifests
pub const DEPENDENCY_MINECRAFT: &str = "minecraft";
pub const DEPENDENCY_FORGE: &str = "forge";
pub const DEPENDENCY_NEOFORGE: &str = "neoforge";
pub const DEPENDENCY_FABRIC_LOADER: &str = "fabric-loader";
pub const DEPENDENCY_QUILT_LOADER: &str = "quilt-loader";

/// Modrinth API response for a version (used for enriching failed mod info)
/// Some fields are present for JSON deserialization but not directly used
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ModrinthVersion {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub version_number: String,
    pub files: Vec<ModrinthVersionFileInfo>,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
}

/// File info within a version response
/// Fields are required for JSON deserialization
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ModrinthVersionFileInfo {
    pub hashes: HashMap<String, String>,
    pub url: String,
    pub filename: String,
    pub primary: bool,
    pub size: u64,
}
