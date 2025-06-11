# LuminaKraft Launcher - Desarrollo Simple
# Script simplificado para desarrollo

Write-Host "=== LuminaKraft Launcher - Desarrollo ===" -ForegroundColor Cyan

# Verificar dependencias
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js no encontrado" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Rust/Cargo no encontrado" -ForegroundColor Red
    exit 1
}

# Limpiar procesos anteriores
Write-Host "Limpiando procesos anteriores..." -ForegroundColor Yellow
taskkill /f /im node.exe 2>$null
taskkill /f /im luminakraft-launcher.exe 2>$null

# Instalar dependencias
Write-Host "Verificando dependencias..." -ForegroundColor Yellow
npm install

Write-Host ""
Write-Host "PASO 1: Iniciando servidor frontend..." -ForegroundColor Green
Write-Host "El servidor Vite se iniciara en una ventana separada." -ForegroundColor Yellow
Write-Host "Deja esa ventana abierta y espera a ver 'Local: http://localhost:1420/'" -ForegroundColor Yellow
Write-Host ""

# Iniciar npm run dev en una ventana separada
Start-Process -FilePath "cmd" -ArgumentList "/c", "npm run dev & pause" -WindowStyle Normal

Write-Host "Presiona ENTER cuando veas que el servidor este listo (Local: http://localhost:1420/)..." -ForegroundColor Cyan
Read-Host

Write-Host ""
Write-Host "PASO 2: Verificando servidor..." -ForegroundColor Green

# Verificar que el servidor responda
try {
    $response = Invoke-WebRequest -Uri "http://localhost:1420" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "Servidor frontend confirmado!" -ForegroundColor Green
    }
} catch {
    Write-Host "Advertencia: No se pudo verificar el servidor en http://localhost:1420" -ForegroundColor Yellow
    Write-Host "Continuando de todas formas..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "PASO 3: Iniciando aplicacion Tauri..." -ForegroundColor Green
Write-Host "Esto puede tomar unos minutos la primera vez..." -ForegroundColor Yellow
Write-Host ""

# Ejecutar Tauri
try {
    cargo run --manifest-path src-tauri/Cargo.toml --no-default-features
} catch {
    Write-Host "Error ejecutando Tauri: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Aplicacion cerrada. Recuerda cerrar la ventana del servidor frontend." -ForegroundColor Yellow 