use anyhow::{Result, anyhow};
use std::path::PathBuf;
use dirs::data_dir;

pub const META_FOLDER_NAME: &str = "meta";
pub const LIBRARIES_FOLDER_NAME: &str = "libraries";
pub const ASSETS_FOLDER_NAME: &str = "assets";
pub const VERSIONS_FOLDER_NAME: &str = "versions";
pub const JAVA_FOLDER_NAME: &str = "java_versions";

/// Directory structure for meta resources (following Modrinth's structure)
#[derive(Debug, Clone)]
pub struct MetaDirectories {
    pub meta_dir: PathBuf,
    pub libraries_dir: PathBuf,
    pub assets_dir: PathBuf,
    pub versions_dir: PathBuf,
    pub java_dir: PathBuf,
}

impl MetaDirectories {
    /// Initialize meta directories structure
    pub async fn init() -> Result<Self> {
        let base_dir = data_dir()
            .ok_or_else(|| anyhow!("Failed to get app data directory"))?
            .join("LKLauncher");

        let meta_dir = base_dir.join(META_FOLDER_NAME);
        let libraries_dir = meta_dir.join(LIBRARIES_FOLDER_NAME);
        let assets_dir = meta_dir.join(ASSETS_FOLDER_NAME);
        let versions_dir = meta_dir.join(VERSIONS_FOLDER_NAME);
        let java_dir = meta_dir.join(JAVA_FOLDER_NAME);
        let _assets_index_dir = assets_dir.join("indexes");
        let _objects_dir = assets_dir.join("objects");
        let natives_dir = meta_dir.join("natives");

        // Create all directories
        let dirs_to_create = [
            &meta_dir,
            &libraries_dir,
            &assets_dir,
            &versions_dir,
            &java_dir,
            &_assets_index_dir,
            &_objects_dir,
            &natives_dir,
        ];

        for dir in dirs_to_create {
            tokio::fs::create_dir_all(dir).await?;
        }

        Ok(Self {
            meta_dir,
            libraries_dir,
            assets_dir,
            versions_dir,
            java_dir,
        })
    }

    /// Get the version-specific directory for a Minecraft version
    pub fn version_dir(&self, version: &str) -> PathBuf {
        self.versions_dir.join(version)
    }

    /// Check if a version is already installed in shared storage
    pub async fn is_version_installed(&self, version: &str) -> bool {
        let version_dir = self.version_dir(version);
        let version_jar = version_dir.join(format!("{}.jar", version));
        let version_json = version_dir.join(format!("{}.json", version));
        
        version_jar.exists() && version_json.exists()
    }

    /// Mark libraries as installed for a version
    pub async fn mark_libraries_installed(&self, minecraft_version: &str) -> Result<()> {
        let version_dir = self.version_dir(minecraft_version);
        tokio::fs::create_dir_all(&version_dir).await?;
        let libs_marker = version_dir.join(".libraries_installed");
        tokio::fs::write(&libs_marker, "").await?;
        Ok(())
    }

    /// Get total size of meta directories (for analytics/cleanup)
    pub async fn get_meta_size(&self) -> Result<u64> {
        let mut total_size = 0u64;
        
        total_size += Self::get_dir_size(&self.libraries_dir).await?;
        total_size += Self::get_dir_size(&self.assets_dir).await?;
        total_size += Self::get_dir_size(&self.versions_dir).await?;
        total_size += Self::get_dir_size(&self.java_dir).await?;
        
        Ok(total_size)
    }

    /// Get count of Minecraft versions installed
    pub async fn get_minecraft_versions_count(&self) -> Result<usize> {
        let mut count = 0;
        if self.versions_dir.exists() {
            let mut entries = tokio::fs::read_dir(&self.versions_dir).await?;
            while let Some(_entry) = entries.next_entry().await? {
                count += 1;
            }
        }
        Ok(count)
    }

    /// Get count of Java installations
    pub async fn get_java_installations_count(&self) -> Result<usize> {
        let mut count = 0;
        if self.java_dir.exists() {
            let mut entries = tokio::fs::read_dir(&self.java_dir).await?;
            while let Some(_entry) = entries.next_entry().await? {
                count += 1;
            }
        }
        Ok(count)
    }

    /// Helper function to calculate directory size recursively
    fn get_dir_size(path: &PathBuf) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<u64>> + Send + '_>> {
        Box::pin(async move {
            if !path.exists() {
                return Ok(0);
            }

            let mut total = 0u64;
            let mut entries = tokio::fs::read_dir(path).await?;
            
            while let Some(entry) = entries.next_entry().await? {
                let metadata = entry.metadata().await?;
                if metadata.is_dir() {
                    total += Self::get_dir_size(&entry.path()).await?;
                } else {
                    total += metadata.len();
                }
            }
            
            Ok(total)
        })
    }

    pub async fn get_minecraft_versions_list(&self) -> Result<Vec<String>> {
        let mut versions = Vec::new();
        if self.versions_dir.exists() {
            let mut entries = tokio::fs::read_dir(&self.versions_dir).await?;
            while let Some(entry) = entries.next_entry().await? {
                if let Some(name) = entry.file_name().to_str() {
                    versions.push(name.to_string());
                }
            }
        }
        versions.sort();
        Ok(versions)
    }
}

/// Helper functions for instance-specific directories
pub struct InstanceDirectories {
    pub instance_dir: PathBuf,
}

impl InstanceDirectories {
    pub fn new(modpack_id: &str) -> Result<Self> {
        use crate::filesystem;
        let instance_dir = filesystem::get_instance_dir(modpack_id)?;

        Ok(Self { instance_dir })
    }

    /// Get the mods directory for this instance
    pub fn mods_dir(&self) -> PathBuf {
        self.instance_dir.join("mods")
    }

    /// Get the config directory for this instance
    pub fn config_dir(&self) -> PathBuf {
        self.instance_dir.join("config")
    }

    /// Get the overrides directory for this instance


    /// Get the saves directory for this instance
    pub fn saves_dir(&self) -> PathBuf {
        self.instance_dir.join("saves")
    }

    /// Get the logs directory for this instance
    pub fn logs_dir(&self) -> PathBuf {
        self.instance_dir.join("logs")
    }

    /// Get the crash reports directory for this instance
    pub fn crash_reports_dir(&self) -> PathBuf {
        self.instance_dir.join("crash-reports")
    }

    /// Ensure all instance directories exist
    pub async fn ensure_directories(&self) -> Result<()> {
        tokio::fs::create_dir_all(&self.instance_dir).await?;
        tokio::fs::create_dir_all(&self.mods_dir()).await?;
        tokio::fs::create_dir_all(&self.config_dir()).await?;
        tokio::fs::create_dir_all(&self.saves_dir()).await?;
        tokio::fs::create_dir_all(&self.logs_dir()).await?;
        tokio::fs::create_dir_all(&self.crash_reports_dir()).await?;
        Ok(())
    }
}
