use anyhow::{Result, anyhow};
use std::path::PathBuf;
use reqwest::Client;
use futures::StreamExt;
use tokio::io::AsyncWriteExt;

/// Format bytes to human readable string
pub fn format_bytes(bytes: u64) -> String {
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

/// Download a file from a URL to a local path with retry logic
pub async fn download_file(url: &str, output_path: &PathBuf) -> Result<()> {
    if url.is_empty() {
        return Err(anyhow!("URL de descarga vacía"));
    }
    
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(300)) // 5 minute timeout
        .build()?;
    
    let max_retries = 3;
    let mut retry_count = 0;
    
    // Create parent directory if needed
    if let Some(parent) = output_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    
    loop {
        match client.get(url).send().await {
            Ok(response) => {
                if !response.status().is_success() {
                    if response.status() == 429 {
                        let delay_secs = 5 * (retry_count + 1);
                        tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs)).await;
                    } else {
                        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    }
                    
                    retry_count += 1;
                    if retry_count >= max_retries {
                        return Err(anyhow!("Error al descargar el archivo después de {} intentos: HTTP {}", 
                                           max_retries, response.status()));
                    }
                    continue;
                }
                
                let content_length = response.content_length().unwrap_or(0);
                
                let mut file = tokio::fs::File::create(output_path).await?;
                let mut stream = response.bytes_stream();
                let mut _downloaded_bytes = 0u64;
                
                while let Some(chunk) = stream.next().await {
                    let chunk = chunk.map_err(|e| anyhow!("Failed to read chunk: {}", e))?;
                    
                    file.write_all(&chunk).await?;
                    _downloaded_bytes += chunk.len() as u64;
                }
                
                file.flush().await?;
                drop(file);
                
                // Validate downloaded file
                if !output_path.exists() {
                    return Err(anyhow!("Download completed but file not found: {}", output_path.display()));
                }
                
                let actual_size = std::fs::metadata(output_path)?.len();
                if actual_size == 0 {
                    return Err(anyhow!("Downloaded file is empty: {}", output_path.display()));
                }
                
                if content_length > 0 && actual_size != content_length {
                    println!("⚠️ Warning: Expected {} bytes but downloaded {} bytes", content_length, actual_size);
                }
                
                return Ok(());
            },
            Err(e) => {
                retry_count += 1;
                if retry_count >= max_retries {
                    return Err(anyhow!("Error de red después de {} intentos: {}", max_retries, e));
                }
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                continue;
            }
        }
    }
}

/// Download a file with progress callback that emits to UI
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
    
    let total_size = response.content_length().unwrap_or(0);
    
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