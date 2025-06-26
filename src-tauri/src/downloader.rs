use anyhow::{Result, anyhow};
use std::path::PathBuf;
use reqwest::Client;
use futures::StreamExt;
use tokio::io::AsyncWriteExt;

/// Format bytes to human readable string
#[allow(dead_code)]
fn format_bytes(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    if bytes == 0 {
        return "0 B".to_string();
    }
    
    let bytes_f = bytes as f64;
    let log = bytes_f.log10() / 1024_f64.log10();
    let index = log.floor() as usize;
    let index = index.min(UNITS.len() - 1);
    
    let value = bytes_f / 1024_f64.powi(index as i32);
    format!("{:.1} {}", value, UNITS[index])
}

/// Download a file from a URL to a local path
pub async fn download_file(url: &str, output_path: &PathBuf) -> Result<()> {
    let client = Client::new();
    
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| anyhow!("Failed to send request: {}", e))?;
    
    if !response.status().is_success() {
        return Err(anyhow!("Failed to download file: HTTP {}", response.status()));
    }
    
    let mut file = tokio::fs::File::create(output_path)
        .await
        .map_err(|e| anyhow!("Failed to create file: {}", e))?;
    
    let mut stream = response.bytes_stream();
    
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| anyhow!("Failed to read chunk: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| anyhow!("Failed to write chunk: {}", e))?;
    }
    
    file.flush()
        .await
        .map_err(|e| anyhow!("Failed to flush file: {}", e))?;
    
    Ok(())
}

/// Download a file with progress callback that emits to UI
#[allow(dead_code)]
pub async fn download_file_with_ui_progress<F>(
    url: &str,
    output_path: &PathBuf,
    emit_progress: F,
) -> Result<()>
where
    F: Fn(String, f32, String) + Send + Sync + 'static,
{
    let client = Client::new();
    
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| anyhow!("Failed to send request: {}", e))?;
    
    if !response.status().is_success() {
        return Err(anyhow!("Failed to download file: HTTP {}", response.status()));
    }
    
    let total_size = response
        .content_length()
        .unwrap_or(0);
    
    let file_name = output_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("archivo");
    
    emit_progress(
        format!("Iniciando descarga de {}", file_name),
        0.0,
        "download_start".to_string()
    );
    
    let mut file = tokio::fs::File::create(output_path)
        .await
        .map_err(|e| anyhow!("Failed to create file: {}", e))?;
    
    let mut stream = response.bytes_stream();
    let mut downloaded = 0u64;
    
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| anyhow!("Failed to read chunk: {}", e))?;
        
        file.write_all(&chunk)
            .await
            .map_err(|e| anyhow!("Failed to write chunk: {}", e))?;
        
        downloaded += chunk.len() as u64;
        
        let percentage = if total_size > 0 {
            (downloaded as f64 / total_size as f64 * 100.0) as f32
        } else {
            0.0
        };
        
        emit_progress(
            format!("Descargando {} ({} / {})", file_name, format_bytes(downloaded), format_bytes(total_size)),
            percentage.clamp(0.0, 100.0),
            "downloading".to_string()
        );
    }
    
    file.flush()
        .await
        .map_err(|e| anyhow!("Failed to flush file: {}", e))?;
    
    emit_progress(
        format!("Descarga de {} completada", file_name),
        100.0,
        "download_complete".to_string()
    );
    
    Ok(())
}

/// Download a file with progress callback
#[allow(dead_code)]
pub async fn download_file_with_progress<F>(
    url: &str,
    output_path: &PathBuf,
    mut progress_callback: F,
) -> Result<()>
where
    F: FnMut(u64, u64),
{
    let client = Client::new();
    
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| anyhow!("Failed to send request: {}", e))?;
    
    if !response.status().is_success() {
        return Err(anyhow!("Failed to download file: HTTP {}", response.status()));
    }
    
    let total_size = response
        .content_length()
        .unwrap_or(0);
    
    let mut file = tokio::fs::File::create(output_path)
        .await
        .map_err(|e| anyhow!("Failed to create file: {}", e))?;
    
    let mut stream = response.bytes_stream();
    let mut downloaded = 0u64;
    
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| anyhow!("Failed to read chunk: {}", e))?;
        
        file.write_all(&chunk)
            .await
            .map_err(|e| anyhow!("Failed to write chunk: {}", e))?;
        
        downloaded += chunk.len() as u64;
        progress_callback(downloaded, total_size);
    }
    
    file.flush()
        .await
        .map_err(|e| anyhow!("Failed to flush file: {}", e))?;
    
    Ok(())
} 