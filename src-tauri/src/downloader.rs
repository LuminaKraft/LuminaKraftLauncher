use anyhow::{Result, anyhow};
use std::path::PathBuf;
use reqwest::Client;
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

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