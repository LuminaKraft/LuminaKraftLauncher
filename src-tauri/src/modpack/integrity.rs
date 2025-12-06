//! Integrity verification module for modpack anti-cheat
//! 
//! This module provides:
//! - SHA256 hashing for individual files
//! - HMAC signing/verification to prevent tampering with stored hashes
//! - Integrity checking before launching official/partner modpacks

use anyhow::{Result, anyhow};
use std::path::PathBuf;
use std::collections::HashMap;
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
    /// No integrity data found (legacy installation)
    NoIntegrityData,
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

/// Calculate hashes for all mods and resourcepacks in an instance
pub fn calculate_instance_hashes(instance_dir: &PathBuf) -> Result<HashMap<String, String>> {
    let mut hashes = HashMap::new();
    
    // Hash mods
    let mods_dir = instance_dir.join("mods");
    if mods_dir.exists() {
        for entry in std::fs::read_dir(&mods_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "jar" {
                        let relative_path = format!("mods/{}", entry.file_name().to_string_lossy());
                        let hash = hash_file(&path)?;
                        hashes.insert(relative_path, hash);
                    }
                }
            }
        }
    }
    
    // Hash resourcepacks
    let resourcepacks_dir = instance_dir.join("resourcepacks");
    if resourcepacks_dir.exists() {
        for entry in std::fs::read_dir(&resourcepacks_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "zip" {
                        let relative_path = format!("resourcepacks/{}", entry.file_name().to_string_lossy());
                        let hash = hash_file(&path)?;
                        hashes.insert(relative_path, hash);
                    }
                }
            }
        }
    }
    
    Ok(hashes)
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

/// Create integrity data for an instance
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
        version: 1,
    })
}

/// Verify integrity of an instance
pub fn verify_integrity(
    instance_dir: &PathBuf,
    integrity_data: &IntegrityData,
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
    
    // Check for unauthorized files
    for path in current_hashes.keys() {
        if !integrity_data.file_hashes.contains_key(path) {
            issues.push(IntegrityIssue::UnauthorizedFile { path: path.clone() });
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
            IntegrityIssue::ModifiedFile { path, .. } => {
                format!("Archivo modificado: {}", path)
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
            IntegrityIssue::NoIntegrityData => {
                "Sin datos de integridad (instalación antigua)".to_string()
            }
        }
    }).collect()
}
