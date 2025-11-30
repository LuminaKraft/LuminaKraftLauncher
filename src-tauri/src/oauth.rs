use tauri::{AppHandle, Emitter, Wry};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct CallbackPayload {
    access_token: String,
    refresh_token: String,
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

    std::thread::spawn(move || {
        println!("OAuth server listening on {}", server_addr);

        // We only expect one request. The loop will exit after one is handled.
        for request in server.incoming_requests() {
            match handle_request(request, &app_handle) {
                Ok(true) => {
                    println!("OAuth callback received. Shutting down server.");
                    break; // Exit loop and shut down
                }
                Ok(false) => {
                    // Request handled, continue to next (if any)
                }
                Err(e) => {
                    eprintln!("Error handling request: {}", e);
                    // Decide if you want to shut down on error
                    break;
                }
            }
        }
    });

    Ok(port)
}
