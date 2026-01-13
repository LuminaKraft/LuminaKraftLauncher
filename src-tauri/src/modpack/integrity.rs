//! Integrity verification module for modpack anti-cheat
//! 
//! This module provides:
//! - SHA256 hashing for individual files
//! - HMAC signing/verification to prevent tampering with stored hashes
//! - Integrity checking before launching official/partner modpacks

use anyhow::{Result, anyhow};
use std::path::PathBuf;
use std::collections::{HashMap, HashSet};
use sha2::{Sha256, Digest};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};

type HmacSha256 = Hmac<Sha256>;

/// Secret key for HMAC signing (embedded in binary, obfuscated)
/// In production, this should be more complex and possibly derived
const HMAC_SECRET: &[u8] = b"LK_INTEGRITY_v1_8f3k2m9x4p7q1w6e";

/// Integrity data stored in instance metadata
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct IntegrityData {
    /// SHA256 hashes of all files in mods/ and resourcepacks/
    /// Key: relative path (e.g., "mods/example.jar"), Value: SHA256 hex
    pub file_hashes: HashMap<String, String>,
    /// HMAC signature of the file_hashes to prevent tampering
    pub signature: String,
    /// SHA256 of the original modpack ZIP (from server)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zip_sha256: Option<String>,
    /// Version of the integrity system (for future migrations)
    pub version: u32,
}

/// Result of integrity verification
#[derive(Debug)]
pub struct IntegrityResult {
    pub is_valid: bool,
    pub issues: Vec<IntegrityIssue>,
}

#[derive(Debug)]
pub enum IntegrityIssue {
    /// File hash doesn't match expected
    ModifiedFile { path: String, expected: String, actual: String },
    /// File exists but wasn't expected (unauthorized mod)
    UnauthorizedFile { path: String },
    /// Expected file is missing
    MissingFile { path: String },
    /// HMAC signature is invalid (metadata was tampered)
    InvalidSignature,
}

impl IntegrityResult {
    pub fn valid() -> Self {
        Self { is_valid: true, issues: Vec::new() }
    }
    
    pub fn invalid(issues: Vec<IntegrityIssue>) -> Self {
        Self { is_valid: false, issues }
    }
}

/// Calculate SHA256 hash of a file
pub fn hash_file(path: &PathBuf) -> Result<String> {
    let data = std::fs::read(path)
        .map_err(|e| anyhow!("Failed to read file {}: {}", path.display(), e))?;
    
    let mut hasher = Sha256::new();
    hasher.update(&data);
    let result = hasher.finalize();
    
    Ok(hex::encode(result))
}

/// Calculate hashes for all managed directories in an instance
pub fn calculate_instance_hashes(instance_dir: &PathBuf) -> Result<HashMap<String, String>> {
    let mut hashes = HashMap::new();
    
    // 1. Hash mods (non-recursive, only .jar)
    hash_directory_simple(instance_dir, "mods", "jar", &mut hashes)?;
    
    // 2. Hash resourcepacks (non-recursive, only .zip)
    hash_directory_simple(instance_dir, "resourcepacks", "zip", &mut hashes)?;
    
    // 3. Hash config (recursive, all files)
    hash_directory_recursive(instance_dir, "config", &mut hashes)?;
    
    // 4. Hash scripts (recursive, all files)
    hash_directory_recursive(instance_dir, "scripts", &mut hashes)?;
    
    Ok(hashes)
}

/// Helper to hash a directory non-recursively for specific extension
fn hash_directory_simple(
    instance_dir: &PathBuf, 
    dir_name: &str, 
    ext_filter: &str,
    hashes: &mut HashMap<String, String>
) -> Result<()> {
    let dir_path = instance_dir.join(dir_name);
    if !dir_path.exists() {
        return Ok(());
    }
    
    for entry in std::fs::read_dir(&dir_path)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == ext_filter {
                    let filename = entry.file_name().to_string_lossy().into_owned();
                    let relative_path = format!("{}/{}", dir_name, filename);
                    let hash = hash_file(&path)?;
                    hashes.insert(relative_path, hash);
                }
            }
        }
    }
    Ok(())
}

/// Helper to hash a directory recursively
fn hash_directory_recursive(
    instance_dir: &PathBuf,
    dir_name: &str,
    hashes: &mut HashMap<String, String>
) -> Result<()> {
    let root_path = instance_dir.join(dir_name);
    if !root_path.exists() {
        return Ok(());
    }

    fn walk(
        current_path: PathBuf, 
        base_dir: &PathBuf, 
        prefix: &str,
        hashes: &mut HashMap<String, String>
    ) -> Result<()> {
        for entry in std::fs::read_dir(current_path)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                walk(path, base_dir, prefix, hashes)?;
            } else if path.is_file() {
                let relative = path.strip_prefix(base_dir)
                    .map_err(|e| anyhow!("Failed to get relative path: {}", e))?;
                let relative_str = format!("{}/{}", prefix, relative.to_string_lossy());
                let hash = hash_file(&path)?;
                hashes.insert(relative_str, hash);
            }
        }
        Ok(())
    }

    walk(root_path.clone(), &root_path, dir_name, hashes)
}

/// Create HMAC signature for the file hashes
pub fn sign_hashes(hashes: &HashMap<String, String>) -> Result<String> {
    // Sort keys for deterministic signing
    let mut sorted_keys: Vec<&String> = hashes.keys().collect();
    sorted_keys.sort();
    
    // Create canonical string representation
    let mut data = String::new();
    for key in sorted_keys {
        data.push_str(key);
        data.push(':');
        data.push_str(&hashes[key]);
        data.push('\n');
    }
    
    // Sign with HMAC-SHA256
    let mut mac = HmacSha256::new_from_slice(HMAC_SECRET)
        .map_err(|e| anyhow!("Failed to create HMAC: {}", e))?;
    mac.update(data.as_bytes());
    let result = mac.finalize();
    
    Ok(hex::encode(result.into_bytes()))
}

/// Verify HMAC signature for the file hashes
pub fn verify_signature(hashes: &HashMap<String, String>, signature: &str) -> bool {
    match sign_hashes(hashes) {
        Ok(expected) => expected == signature,
        Err(_) => false,
    }
}

/// Create integrity data for an instance by scanning only managed files
pub fn create_integrity_data_from_list(
    instance_dir: &PathBuf, 
    managed_files: &HashSet<String>,
    zip_sha256: Option<String>
) -> Result<IntegrityData> {
    let mut file_hashes = HashMap::new();
    
    for rel_path in managed_files {
        let full_path = instance_dir.join(rel_path);
        if full_path.exists() && full_path.is_file() {
            let hash = hash_file(&full_path)?;
            file_hashes.insert(rel_path.clone(), hash);
        }
    }
    
    let signature = sign_hashes(&file_hashes)?;
    
    Ok(IntegrityData {
        file_hashes,
        signature,
        zip_sha256,
        version: 1,
    })
}

/// Create integrity data for an instance (Legacy - scans disk)
pub fn create_integrity_data(
    instance_dir: &PathBuf,
    zip_sha256: Option<String>,
) -> Result<IntegrityData> {
    let file_hashes = calculate_instance_hashes(instance_dir)?;
    let signature = sign_hashes(&file_hashes)?;
    
    Ok(IntegrityData {
        file_hashes,
        signature,
        zip_sha256,
        version: 2, // v2: Includes proper update flow cleanup
    })
}

/// Verify integrity of an instance
/// allow_custom_mods/resourcepacks/configs: If true, don't report extra files as unauthorized
pub fn verify_integrity(
    instance_dir: &PathBuf,
    integrity_data: &IntegrityData,
    allow_custom_mods: bool,
    allow_custom_resourcepacks: bool,
    allow_custom_configs: bool,
) -> IntegrityResult {
    let mut issues = Vec::new();
    
    // First, verify the signature
    if !verify_signature(&integrity_data.file_hashes, &integrity_data.signature) {
        return IntegrityResult::invalid(vec![IntegrityIssue::InvalidSignature]);
    }
    
    // Calculate current hashes
    let current_hashes = match calculate_instance_hashes(instance_dir) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("Failed to calculate current hashes: {}", e);
            return IntegrityResult::invalid(vec![IntegrityIssue::InvalidSignature]);
        }
    };
    
    // Check for modified or missing files
    for (path, expected_hash) in &integrity_data.file_hashes {
        match current_hashes.get(path) {
            Some(actual_hash) => {
                if actual_hash != expected_hash {
                    issues.push(IntegrityIssue::ModifiedFile {
                        path: path.clone(),
                        expected: expected_hash.clone(),
                        actual: actual_hash.clone(),
                    });
                }
            }
            None => {
                issues.push(IntegrityIssue::MissingFile { path: path.clone() });
            }
        }
    }
    
    // Check for unauthorized files (only if custom files are not allowed)
    for path in current_hashes.keys() {
        if !integrity_data.file_hashes.contains_key(path) {
            // Determine if this is a mod, resourcepack or config
            let is_mod = path.starts_with("mods/");
            let is_resourcepack = path.starts_with("resourcepacks/");
            let is_config = path.starts_with("config/") || path.starts_with("scripts/");
            
            // Only report as unauthorized if custom files are NOT allowed for this type
            let should_report = if is_mod {
                !allow_custom_mods
            } else if is_resourcepack {
                !allow_custom_resourcepacks
            } else if is_config {
                !allow_custom_configs
            } else {
                true // Other files in tracked directories always reported
            };
            
            if should_report {
                issues.push(IntegrityIssue::UnauthorizedFile { path: path.clone() });
            }
        }
    }
    
    if issues.is_empty() {
        IntegrityResult::valid()
    } else {
        IntegrityResult::invalid(issues)
    }
}

/// Format integrity issues for display
pub fn format_issues(issues: &[IntegrityIssue]) -> Vec<String> {
    issues.iter().map(|issue| {
        match issue {
            IntegrityIssue::ModifiedFile { path, expected, actual } => {
                format!("Archivo modificado: {} (esperado: {}..., actual: {}...)", 
                    path,
                    &expected[..12.min(expected.len())],
                    &actual[..12.min(actual.len())]
                )
            }
            IntegrityIssue::UnauthorizedFile { path } => {
                format!("Archivo no autorizado: {}", path)
            }
            IntegrityIssue::MissingFile { path } => {
                format!("Archivo faltante: {}", path)
            }
            IntegrityIssue::InvalidSignature => {
                "Firma de integridad inválida (posible manipulación)".to_string()
            }
        }
    }).collect()
}
