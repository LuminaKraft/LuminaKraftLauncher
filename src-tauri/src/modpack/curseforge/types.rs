use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct CurseForgeManifest {
    pub minecraft: MinecraftInfo,
    #[serde(rename = "manifestType")]
    pub manifest_type: String,
    #[serde(rename = "manifestVersion")]
    pub manifest_version: i32,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub author: String,
    pub files: Vec<CurseForgeFile>,
    pub overrides: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct MinecraftInfo {
    pub version: String,
    #[serde(rename = "modLoaders")]
    pub mod_loaders: Vec<ModLoader>,
    #[serde(rename = "recommendedRam", default)]
    pub recommended_ram: Option<u32>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ModLoader {
    pub id: String,
    pub primary: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CurseForgeFile {
    #[serde(rename = "projectID")]
    pub project_id: i64,
    #[serde(rename = "fileID")]
    pub file_id: i64,
    pub required: bool,
}

#[derive(Debug, Deserialize)]
pub struct ModFileInfo {
    pub id: i64,
    #[serde(rename = "downloadUrl", default)]
    pub download_url: Option<String>,
    #[serde(rename = "fileName", default)]
    pub file_name: Option<String>,
    #[serde(default)]
    pub hashes: Vec<FileHash>,
    /// File availability status from CurseForge API - Reserved for future use
    #[serde(rename = "isAvailable", default)]
    #[allow(dead_code)]
    pub is_available: Option<bool>,
    /// File status code from CurseForge API - Reserved for future use
    #[serde(rename = "fileStatus", default)]
    #[allow(dead_code)]
    pub file_status: Option<i32>,
    #[serde(rename = "modId", default)]
    pub mod_id: Option<i64>,
    /// Display name from CurseForge API - Reserved for future use
    #[serde(rename = "displayName", default)]
    #[allow(dead_code)]
    pub display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct FileHash {
    #[serde(default)]
    pub value: Option<String>,
    pub algo: i32, // 1 = SHA1, 2 = MD5
}

#[derive(Debug, Deserialize)]
pub struct ApiResponse<T> {
    pub data: T,
}

#[derive(serde::Serialize)]
pub struct GetModFilesRequest {
    #[serde(rename = "fileIds")]
    pub file_ids: Vec<i64>,
} 