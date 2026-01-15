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

/// Calculate SHA256 hash of a file using streaming to avoid memory overhead
pub fn hash_file(path: &PathBuf) -> Result<String> {
    use std::io::{Read, BufReader};
    
    let file = std::fs::File::open(path)
        .map_err(|e| anyhow!("Failed to open file {}: {}", path.display(), e))?;
    let mut reader = BufReader::with_capacity(64 * 1024, file);
    
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];

    loop {
        let n = reader.read(&mut buffer)
            .map_err(|e| anyhow!("Failed to read file {}: {}", path.display(), e))?;
        if n == 0 { break; }
        hasher.update(&buffer[..n]);
    }
    
    let result = hasher.finalize();
    Ok(hex::encode(result))
}

/// Calculate hashes for all managed directories in an instance (Parallelized)
pub fn calculate_instance_hashes(instance_dir: &PathBuf) -> Result<HashMap<String, String>> {
    use rayon::prelude::*;

    let mut dir_list = Vec::new();
    
    // Collect all files to hash first
    let mut collect_dir = |dir_name: &str, recursive: bool, ext_filter: Option<&str>| -> Result<()> {
        let root = instance_dir.join(dir_name);
        if !root.exists() { return Ok(()); }

        if recursive {
            let walker = walkdir::WalkDir::new(&root);
            for entry in walker {
                let entry = entry.map_err(|e| anyhow!("WalkDir error: {}", e))?;
                let path = entry.path();
                if path.is_file() {
                    let relative = path.strip_prefix(&root)
                        .map_err(|e| anyhow!("Prefix error: {}", e))?;
                    let relative_str = format!("{}/{}", dir_name, relative.to_string_lossy());
                    dir_list.push((path.to_path_buf(), relative_str));
                }
            }
        } else {
            for entry in std::fs::read_dir(&root)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_file() {
                    if let Some(filter) = ext_filter {
                        if path.extension().and_then(|e| e.to_str()) != Some(filter) {
                            continue;
                        }
                    }
                    let filename = entry.file_name().to_string_lossy().into_owned();
                    let relative_path = format!("{}/{}", dir_name, filename);
                    dir_list.push((path.to_path_buf(), relative_path));
                }
            }
        }
        Ok(())
    };

    collect_dir("mods", false, Some("jar"))?;
    collect_dir("resourcepacks", false, Some("zip"))?;

    // Hash in parallel
    let results: Result<Vec<(String, String)>> = dir_list.into_par_iter()
        .map(|(path, rel_path)| {
            let hash = hash_file(&path)?;
            Ok((rel_path, hash))
        })
        .collect();

    Ok(results?.into_iter().collect())
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

/// Create integrity data for an instance by scanning only managed files (Parallelized)
pub fn create_integrity_data_from_list(
    instance_dir: &PathBuf, 
    managed_files: &HashSet<String>,
    zip_sha256: Option<String>
) -> Result<IntegrityData> {
    use rayon::prelude::*;

    let managed_list: Vec<String> = managed_files.iter().cloned().collect();
    
    let file_hashes_vec: Result<Vec<(String, String)>> = managed_list.into_par_iter()
        .filter_map(|rel_path| {
            let full_path = instance_dir.join(&rel_path);
            if full_path.exists() && full_path.is_file() {
                match hash_file(&full_path) {
                    Ok(hash) => Some(Ok((rel_path, hash))),
                    Err(e) => Some(Err(e)),
                }
            } else {
                None
            }
        })
        .collect();

    let file_hashes: HashMap<String, String> = file_hashes_vec?.into_iter().collect();
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
/// allow_custom_mods/resourcepacks: If true, don't report extra files as unauthorized
pub fn verify_integrity(
    instance_dir: &PathBuf,
    integrity_data: &IntegrityData,
    allow_custom_mods: bool,
    allow_custom_resourcepacks: bool,
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
            // Determine if this is a mod or resourcepack
            let is_mod = path.starts_with("mods/");
            let is_resourcepack = path.starts_with("resourcepacks/");
            
            // Only report as unauthorized if custom files are NOT allowed for this type
            let should_report = if is_mod {
                !allow_custom_mods
            } else if is_resourcepack {
                !allow_custom_resourcepacks
            } else {
                false // Don't report other file types (configs change naturally)
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
