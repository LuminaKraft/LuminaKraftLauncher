use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use tauri::{AppHandle, Emitter, Manager, Wry};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct CallbackPayload {
    access_token: String,
    refresh_token: String,
    provider_token: Option<String>,
    provider_refresh_token: Option<String>,
}

// Global shutdown flag for active OAuth servers
pub struct OAuthServerState {
    pub shutdown_flag: Arc<AtomicBool>,
}

impl Default for OAuthServerState {
    fn default() -> Self {
        Self {
            shutdown_flag: Arc::new(AtomicBool::new(false)),
        }
    }
}

fn handle_request(
    mut request: tiny_http::Request,
    app_handle: &AppHandle<Wry>,
) -> Result<bool, String> {
    // --- CORS Preflight ---
    if request.method().as_str() == "OPTIONS" {
        let response = tiny_http::Response::empty(200)
            .with_header("Access-Control-Allow-Origin: https://luminakraft.com".parse::<tiny_http::Header>().unwrap())
            .with_header("Access-Control-Allow-Methods: POST, OPTIONS".parse::<tiny_http::Header>().unwrap())
            .with_header("Access-Control-Allow-Headers: Content-Type".parse::<tiny_http::Header>().unwrap());
        request.respond(response).map_err(|e| e.to_string())?;
        return Ok(false); // Continue to next request
    }

    // --- Method Validation ---
    if request.method().as_str() != "POST" {
        let response = tiny_http::Response::from_string("Method Not Allowed")
            .with_status_code(405);
        request.respond(response).map_err(|e| e.to_string())?;
        return Ok(false);
    }

    // --- Body Parsing ---
    let mut content = String::new();
    request
        .as_reader()
        .read_to_string(&mut content)
        .map_err(|e| format!("Failed to read request body: {}", e))?;

    // Parse JSON body expecting {"access_token": "...", "refresh_token": "..."}
    let payload: CallbackPayload = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON body: {}", e))?;

    if payload.access_token.is_empty() || payload.refresh_token.is_empty() {
        let response = tiny_http::Response::from_string("Bad Request: Missing tokens")
            .with_status_code(400);
        request.respond(response).map_err(|e| e.to_string())?;
        return Ok(false);
    }

    // --- Emit Event to Frontend ---
    app_handle
        .emit("oauth-callback", payload)
        .map_err(|e| format!("Failed to emit event: {}", e))?;

    // --- Respond to the OAuth Provider ---
    let response = tiny_http::Response::from_string("Authentication successful! You can close this window.")
        .with_header("Access-Control-Allow-Origin: https://luminakraft.com".parse::<tiny_http::Header>().unwrap());
    request.respond(response).map_err(|e| e.to_string())?;

    // Signal successful handling and server shutdown
    Ok(true)
}

#[tauri::command]
pub fn start_oauth_server(app_handle: AppHandle<Wry>) -> Result<u16, String> {
    let port = portpicker::pick_unused_port().ok_or("No free ports available")?;
    let server_addr = format!("127.0.0.1:{}", port);

    let server = tiny_http::Server::http(&server_addr)
        .map_err(|e| format!("Failed to start server: {}", e))?;

    // Get or create the shutdown flag from app state
    let state = app_handle.state::<OAuthServerState>();
    // Reset the shutdown flag for new server
    state.shutdown_flag.store(false, Ordering::SeqCst);
    let shutdown_flag = state.shutdown_flag.clone();

    std::thread::spawn(move || {
        println!("OAuth server listening on {}", server_addr);

        // Use a timeout-based approach to check for shutdown
        loop {
            // Check if shutdown was requested
            if shutdown_flag.load(Ordering::SeqCst) {
                println!("OAuth server shutdown requested.");
                break;
            }

            // Try to receive a request with a short timeout
            match server.recv_timeout(std::time::Duration::from_millis(500)) {
                Ok(Some(request)) => {
                    match handle_request(request, &app_handle) {
                        Ok(true) => {
                            println!("OAuth callback received. Shutting down server.");
                            break; // Exit loop and shut down
                        }
                        Ok(false) => {
                            // Request handled, continue to next
                        }
                        Err(e) => {
                            eprintln!("Error handling request: {}", e);
                            break;
                        }
                    }
                }
                Ok(None) => {
                    // Timeout, continue loop to check shutdown flag
                }
                Err(e) => {
                    eprintln!("Server error: {}", e);
                    break;
                }
            }
        }
    });

    Ok(port)
}

#[tauri::command]
pub fn stop_oauth_server(app_handle: AppHandle<Wry>) -> Result<(), String> {
    let state = app_handle.state::<OAuthServerState>();
    state.shutdown_flag.store(true, Ordering::SeqCst);
    println!("OAuth server stop requested.");
    Ok(())
}
