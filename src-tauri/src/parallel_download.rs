//! Parallel download system inspired by Modrinth App
//! This module bypasses Lyceris' slow sequential downloads and implements
//! truly parallel downloads for assets, libraries, Java runtime, and client.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::collections::HashMap;
use std::env::consts::{ARCH, OS};

use anyhow::{Result, anyhow};
use futures::{stream, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

// ============================================================================
// CONFIGURATION
// ============================================================================

/// Configuration for parallel downloads
pub struct DownloadConfig {
    /// Maximum number of concurrent downloads (default: 10, same as Modrinth)
    pub max_concurrent_downloads: usize,
    /// Maximum number of concurrent file writes (default: 10)
    pub max_concurrent_writes: usize,
}

impl Default for DownloadConfig {
    fn default() -> Self {
        Self {
            max_concurrent_downloads: 10,
            max_concurrent_writes: 10,
        }
    }
}

// ============================================================================
// JSON STRUCTURES (compatible with Lyceris/Mojang API)
// ============================================================================

#[derive(Serialize, Deserialize, Debug)]
pub struct VersionManifest {
    pub versions: Vec<VersionEntry>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct VersionEntry {
    pub id: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VersionMeta {
    pub asset_index: AssetIndexInfo,
    pub assets: String,
    pub downloads: VersionDownloads,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub java_version: Option<JavaVersionInfo>,
    pub libraries: Vec<Library>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AssetIndexInfo {
    pub id: String,
    pub sha1: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct VersionDownloads {
    pub client: DownloadArtifact,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DownloadArtifact {
    pub sha1: String,
    pub size: i64,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct JavaVersionInfo {
    #[serde(default = "default_java_component")]
    pub component: String,
    #[serde(default)]
    pub major_version: i64,
}

fn default_java_component() -> String {
    "jre-legacy".to_string()
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Library {
    pub downloads: Option<LibraryDownloads>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rules: Option<Vec<Rule>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub natives: Option<HashMap<String, String>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LibraryDownloads {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifact: Option<DownloadArtifact>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub classifiers: Option<HashMap<String, DownloadArtifact>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Rule {
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os: Option<OsRule>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct OsRule {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arch: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AssetIndex {
    pub objects: HashMap<String, AssetObject>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#virtual: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub map_to_resources: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

// Java manifest structures
pub type JavaManifest = HashMap<String, HashMap<String, Vec<JavaGamecore>>>;

#[derive(Serialize, Deserialize, Debug)]
pub struct JavaGamecore {
    pub manifest: JavaFileMapInfo,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JavaFileMapInfo {
    pub sha1: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JavaFileManifest {
    pub files: HashMap<String, JavaFile>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JavaFile {
    pub r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downloads: Option<JavaDownloads>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JavaDownloads {
    pub raw: JavaFileMapInfo,
}

// ============================================================================
// DOWNLOAD FILE REPRESENTATION
// ============================================================================

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct DownloadFile {
    pub url: String,
    pub path: PathBuf,
    pub sha1: Option<String>,
    pub file_type: FileType,
}

#[derive(Clone, Debug)]
pub enum FileType {
    Asset,
    Library,
    Java,
    Client,
}

impl std::fmt::Display for FileType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FileType::Asset => write!(f, "Asset"),
            FileType::Library => write!(f, "Library"),
            FileType::Java => write!(f, "Java"),
            FileType::Client => write!(f, "Client"),
        }
    }
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

pub struct ProgressTracker {
    pub total_files: AtomicU64,
    pub completed_files: AtomicU64,
    pub current_category: std::sync::Mutex<String>,
}

impl ProgressTracker {
    pub fn new() -> Self {
        Self {
            total_files: AtomicU64::new(0),
            completed_files: AtomicU64::new(0),
            current_category: std::sync::Mutex::new(String::new()),
        }
    }

    pub fn set_total(&self, total: u64) {
        self.total_files.store(total, Ordering::SeqCst);
        self.completed_files.store(0, Ordering::SeqCst);
    }

    pub fn increment(&self) -> (u64, u64) {
        let completed = self.completed_files.fetch_add(1, Ordering::SeqCst) + 1;
        let total = self.total_files.load(Ordering::SeqCst);
        (completed, total)
    }

    pub fn set_category(&self, category: &str) {
        if let Ok(mut cat) = self.current_category.lock() {
            *cat = category.to_string();
        }
    }

    #[allow(dead_code)]
    pub fn get_percentage(&self) -> f32 {
        let completed = self.completed_files.load(Ordering::SeqCst);
        let total = self.total_files.load(Ordering::SeqCst);
        if total == 0 {
            0.0
        } else {
            (completed as f64 / total as f64 * 100.0) as f32
        }
    }
}

// ============================================================================
// CORE DOWNLOAD FUNCTIONS
// ============================================================================

const VERSION_MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const JAVA_MANIFEST_URL: &str = "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";
const RESOURCES_URL: &str = "https://resources.download.minecraft.net";

/// Main entry point for parallel Minecraft installation
pub async fn install_minecraft_parallel<F>(
    version: &str,
    game_dir: &Path,
    java_dir: &Path,
    emit_progress: F,
    config: DownloadConfig,
) -> Result<VersionMeta>
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let download_semaphore = Arc::new(Semaphore::new(config.max_concurrent_downloads));
    let write_semaphore = Arc::new(Semaphore::new(config.max_concurrent_writes));

    // Emit initial progress
    emit_progress("progress.fetchingVersionManifest".to_string(), 0.0, "fetching".to_string());

    // 1. Fetch version manifest
    println!("📥 Fetching version manifest...");
    let manifest: VersionManifest = client.get(VERSION_MANIFEST_URL)
        .send().await?
        .json().await?;

    let version_entry = manifest.versions.iter()
        .find(|v| v.id == version)
        .ok_or_else(|| anyhow!("Version {} not found", version))?;

    // 2. Fetch version metadata
    println!("📥 Fetching version metadata for {}...", version);
    emit_progress("progress.fetchingVersionMeta".to_string(), 2.0, "fetching".to_string());
    let version_meta: VersionMeta = client.get(&version_entry.url)
        .send().await?
        .json().await?;

    // 3. Fetch asset index
    println!("📥 Fetching asset index...");
    emit_progress("progress.fetchingAssetIndex".to_string(), 4.0, "fetching".to_string());
    let asset_index: AssetIndex = client.get(&version_meta.asset_index.url)
        .send().await?
        .json().await?;

    // Save asset index to disk
    let indexes_dir = game_dir.join("assets").join("indexes");
    fs::create_dir_all(&indexes_dir).await?;
    let asset_index_path = indexes_dir.join(format!("{}.json", version_meta.asset_index.id));
    let asset_index_json = serde_json::to_string_pretty(&asset_index)?;
    fs::write(&asset_index_path, asset_index_json).await?;

    // 4. Fetch Java manifest
    println!("📥 Fetching Java manifest...");
    emit_progress("progress.fetchingJavaManifest".to_string(), 6.0, "fetching".to_string());
    let java_manifest: JavaManifest = client.get(JAVA_MANIFEST_URL)
        .send().await?
        .json().await?;

    let java_version = version_meta.java_version.as_ref()
        .map(|j| j.component.clone())
        .unwrap_or_else(|| "jre-legacy".to_string());
    
    let java_files_manifest = get_java_file_manifest(&client, &java_manifest, &java_version).await?;

    // 5. Build download lists
    println!("📦 Building download lists...");
    emit_progress("progress.buildingDownloadLists".to_string(), 8.0, "preparing".to_string());

    let assets_dir = game_dir.join("assets").join("objects");
    let libraries_dir = game_dir.join("libraries");
    let versions_dir = game_dir.join("versions").join(version);
    let runtime_dir = java_dir.join(&java_version);

    // Create directories
    tokio::try_join!(
        fs::create_dir_all(&assets_dir),
        fs::create_dir_all(&libraries_dir),
        fs::create_dir_all(&versions_dir),
        fs::create_dir_all(&runtime_dir),
    )?;

    // Build file lists
    let asset_files = build_asset_list(&asset_index, &assets_dir);
    let library_files = build_library_list(&version_meta.libraries, &libraries_dir);
    let java_files = build_java_list(&java_files_manifest, &runtime_dir);
    let client_file = build_client_file(&version_meta, &versions_dir, version);

    // Filter to only files that need downloading
    let asset_files = filter_existing_files(asset_files).await;
    let library_files = filter_existing_files(library_files).await;
    let java_files = filter_existing_files(java_files).await;
    let client_file = filter_existing_files(client_file).await;

    let total_files = asset_files.len() + library_files.len() + java_files.len() + client_file.len();
    println!("📊 Files to download: {} assets, {} libraries, {} java files, {} client",
        asset_files.len(), library_files.len(), java_files.len(), client_file.len());

    if total_files == 0 {
        println!("✅ All files already downloaded!");
        emit_progress("progress.allFilesReady".to_string(), 100.0, "complete".to_string());
        return Ok(version_meta);
    }

    // 6. Download all files in parallel categories (like Modrinth does!)
    let progress = Arc::new(ProgressTracker::new());
    progress.set_total(total_files as u64);

    emit_progress("progress.downloadingFiles".to_string(), 10.0, "downloading".to_string());

    // Download all categories in parallel using tokio::try_join!
    // This is the key optimization from Modrinth!
    let (assets_result, libraries_result, java_result, client_result) = tokio::join!(
        download_files_parallel(
            asset_files,
            &client,
            download_semaphore.clone(),
            write_semaphore.clone(),
            progress.clone(),
            emit_progress.clone(),
            "Assets".to_string(),
        ),
        download_files_parallel(
            library_files,
            &client,
            download_semaphore.clone(),
            write_semaphore.clone(),
            progress.clone(),
            emit_progress.clone(),
            "Libraries".to_string(),
        ),
        download_files_parallel(
            java_files,
            &client,
            download_semaphore.clone(),
            write_semaphore.clone(),
            progress.clone(),
            emit_progress.clone(),
            "Java Runtime".to_string(),
        ),
        download_files_parallel(
            client_file,
            &client,
            download_semaphore.clone(),
            write_semaphore.clone(),
            progress.clone(),
            emit_progress.clone(),
            "Client".to_string(),
        ),
    );

    // Check results
    assets_result?;
    libraries_result?;
    java_result?;
    client_result?;

    println!("✅ All downloads complete!");
    emit_progress("progress.downloadComplete".to_string(), 100.0, "complete".to_string());

    Ok(version_meta)
}

/// Download files in parallel with semaphore-controlled concurrency
async fn download_files_parallel<F>(
    files: Vec<DownloadFile>,
    client: &Client,
    download_semaphore: Arc<Semaphore>,
    write_semaphore: Arc<Semaphore>,
    progress: Arc<ProgressTracker>,
    emit_progress: F,
    category: String,
) -> Result<()>
where
    F: Fn(String, f32, String) + Send + Sync + 'static + Clone,
{
    if files.is_empty() {
        return Ok(());
    }

    progress.set_category(&category);
    println!("📥 Downloading {} {} files...", files.len(), category);

    let results: Vec<Result<()>> = stream::iter(files)
        .map(|file| {
            let client = client.clone();
            let download_sem = download_semaphore.clone();
            let write_sem = write_semaphore.clone();
            let progress = progress.clone();
            let emit = emit_progress.clone();
            let cat = category.clone();

            async move {
                // Acquire download permit
                let _download_permit = download_sem.acquire().await
                    .map_err(|e| anyhow!("Semaphore error: {}", e))?;

                // Download file
                let response = client.get(&file.url)
                    .send()
                    .await
                    .map_err(|e| anyhow!("Download failed for {}: {}", file.url, e))?;

                if !response.status().is_success() {
                    return Err(anyhow!("HTTP {} for {}", response.status(), file.url));
                }

                let bytes = response.bytes()
                    .await
                    .map_err(|e| anyhow!("Failed to read bytes from {}: {}", file.url, e))?;

                // Verify SHA1 if provided
                if let Some(expected_sha1) = &file.sha1 {
                    let actual_sha1 = calculate_sha1(&bytes);
                    if &actual_sha1 != expected_sha1 {
                        return Err(anyhow!(
                            "SHA1 mismatch for {}: expected {}, got {}",
                            file.path.display(), expected_sha1, actual_sha1
                        ));
                    }
                }

                // Acquire write permit and write file
                {
                    let _write_permit = write_sem.acquire().await
                        .map_err(|e| anyhow!("Write semaphore error: {}", e))?;

                    if let Some(parent) = file.path.parent() {
                        fs::create_dir_all(parent).await?;
                    }

                    let mut f = File::create(&file.path).await?;
                    f.write_all(&bytes).await?;
                }

                // Update progress
                let (completed, total) = progress.increment();
                let percentage = (completed as f64 / total as f64 * 100.0) as f32;
                
                // Map percentage from 10-100 (since we start at 10% after manifest fetches)
                let mapped_percentage = 10.0 + (percentage * 0.9);
                
                emit(
                    format!("progress.downloading|{}|{}/{}", cat, completed, total),
                    mapped_percentage,
                    "downloading".to_string(),
                );

                Ok(())
            }
        })
        .buffer_unordered(50) // Allow up to 50 concurrent tasks (controlled by semaphore)
        .collect()
        .await;

    // Check for errors
    for result in results {
        result?;
    }

    Ok(())
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Calculate SHA1 hash of bytes
fn calculate_sha1(bytes: &[u8]) -> String {
    use sha1::{Sha1, Digest};
    let mut hasher = Sha1::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

/// Get Java file manifest for the specified version
async fn get_java_file_manifest(
    client: &Client,
    manifest: &JavaManifest,
    java_version: &str,
) -> Result<JavaFileManifest> {
    // Build OS key based on what Mojang's Java manifest uses
    // Keys: "linux", "linux-i386", "mac-os", "mac-os-arm64", "windows-x64", "windows-x86", "windows-arm64"
    let full_os_key = match (OS, ARCH) {
        ("macos", "aarch64") => "mac-os-arm64".to_string(),
        ("macos", _) => "mac-os".to_string(),
        ("linux", "x86") => "linux-i386".to_string(),
        ("linux", _) => "linux".to_string(),
        ("windows", "x86_64") => "windows-x64".to_string(),
        ("windows", "x86") => "windows-x86".to_string(),
        ("windows", "aarch64") => "windows-arm64".to_string(),
        _ => return Err(anyhow!("Unsupported OS/Arch combination: {} / {}", OS, ARCH)),
    };
    
    // For fallback, try the base OS key (without architecture suffix)
    let os_key = match OS {
        "macos" => "mac-os",
        "linux" => "linux",
        "windows" => "windows-x64", // Default Windows fallback to x64
        _ => &full_os_key,
    };
    
    let java_entries = manifest.get(&full_os_key)
        .or_else(|| manifest.get(os_key))
        .ok_or_else(|| anyhow!("No Java runtime for OS: {}", full_os_key))?;

    let java_entry = java_entries.get(java_version)
        .or_else(|| java_entries.get("jre-legacy"))
        .ok_or_else(|| anyhow!("No Java version: {}", java_version))?;

    let gamecore = java_entry.first()
        .ok_or_else(|| anyhow!("Empty Java gamecore list"))?;

    let file_manifest: JavaFileManifest = client.get(&gamecore.manifest.url)
        .send().await?
        .json().await?;

    Ok(file_manifest)
}

/// Build list of asset files to download
fn build_asset_list(index: &AssetIndex, assets_dir: &Path) -> Vec<DownloadFile> {
    index.objects.values()
        .map(|asset| {
            let hash = &asset.hash;
            let sub_hash = &hash[..2];
            DownloadFile {
                url: format!("{}/{}/{}", RESOURCES_URL, sub_hash, hash),
                path: assets_dir.join(sub_hash).join(hash),
                sha1: Some(hash.clone()),
                file_type: FileType::Asset,
            }
        })
        .collect()
}

/// Build list of library files to download
fn build_library_list(libraries: &[Library], libraries_dir: &Path) -> Vec<DownloadFile> {
    libraries.iter()
        .filter(|lib| should_download_library(lib))
        .filter_map(|lib| {
            if let Some(downloads) = &lib.downloads {
                if let Some(artifact) = &downloads.artifact {
                    if let Some(path) = &artifact.path {
                        return Some(DownloadFile {
                            url: artifact.url.clone(),
                            path: libraries_dir.join(path.replace("/", std::path::MAIN_SEPARATOR_STR)),
                            sha1: Some(artifact.sha1.clone()),
                            file_type: FileType::Library,
                        });
                    }
                }
            }
            None
        })
        .collect()
}

/// Check if library should be downloaded based on rules
fn should_download_library(lib: &Library) -> bool {
    let Some(rules) = &lib.rules else {
        return true; // No rules = always download
    };

    let current_os = match OS {
        "macos" => "osx",
        "linux" => "linux",
        "windows" => "windows",
        _ => return true,
    };

    let mut dominated_val = false;

    for rule in rules {
        let dominated = match &rule.os {
            Some(os) => {
                if let Some(name) = &os.name {
                    name == current_os
                } else {
                    true
                }
            },
            None => true,
        };

        if dominated {
            dominated_val = rule.action == "allow";
        }
    }

    dominated_val
}

/// Build list of Java files to download
fn build_java_list(manifest: &JavaFileManifest, runtime_dir: &Path) -> Vec<DownloadFile> {
    manifest.files.iter()
        .filter_map(|(name, file)| {
            if file.r#type != "file" {
                return None;
            }
            let downloads = file.downloads.as_ref()?;
            Some(DownloadFile {
                url: downloads.raw.url.clone(),
                path: runtime_dir.join(name.replace("/", std::path::MAIN_SEPARATOR_STR)),
                sha1: Some(downloads.raw.sha1.clone()),
                file_type: FileType::Java,
            })
        })
        .collect()
}

/// Build client file entry
fn build_client_file(meta: &VersionMeta, versions_dir: &Path, version: &str) -> Vec<DownloadFile> {
    vec![DownloadFile {
        url: meta.downloads.client.url.clone(),
        path: versions_dir.join(format!("{}.jar", version)),
        sha1: Some(meta.downloads.client.sha1.clone()),
        file_type: FileType::Client,
    }]
}

/// Filter out files that already exist with correct hash
async fn filter_existing_files(files: Vec<DownloadFile>) -> Vec<DownloadFile> {
    let mut to_download = Vec::with_capacity(files.len());
    
    for file in files {
        if !file.path.exists() {
            to_download.push(file);
        } else if let Some(expected_sha1) = &file.sha1 {
            // Verify existing file hash
            if let Ok(bytes) = tokio::fs::read(&file.path).await {
                let actual_sha1 = calculate_sha1(&bytes);
                if &actual_sha1 != expected_sha1 {
                    to_download.push(file);
                }
            } else {
                to_download.push(file);
            }
        }
    }

    to_download
}
