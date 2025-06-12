# LuminaKraft Launcher - Desarrollo Estable
# Script optimizado para Windows PowerShell

Write-Host "=== LuminaKraft Launcher - Desarrollo Estable ===" -ForegroundColor Cyan
Write-Host ""

# Verificar dependencias
Write-Host "Verificando dependencias..." -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: Node.js no encontrado" -ForegroundColor Red
    Write-Host "   Instala Node.js desde: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: Rust/Cargo no encontrado" -ForegroundColor Red
    Write-Host "   Instala Rust desde: https://rustup.rs/" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Node.js y Rust encontrados" -ForegroundColor Green

# Limpiar procesos anteriores
Write-Host ""
Write-Host "Limpiando procesos anteriores..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "luminakraft-launcher" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Instalar dependencias si es necesario
if (-not (Test-Path "node_modules")) {
    Write-Host ""
    Write-Host "Instalando dependencias de Node.js..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Error instalando dependencias de Node.js" -ForegroundColor Red
        exit 1
    }
}

# Limpiar cache de Rust si hay problemas
Write-Host ""
Write-Host "Limpiando cache de Rust..." -ForegroundColor Yellow
Set-Location src-tauri
cargo clean
Set-Location ..

Write-Host ""
Write-Host "🚀 Iniciando LuminaKraft Launcher en modo desarrollo estable..." -ForegroundColor Green
Write-Host ""
Write-Host "Nota: Este modo usa --no-watch para evitar rebuilds constantes" -ForegroundColor Cyan
Write-Host "Si necesitas hot reload, usa: npm run tauri:dev-watch" -ForegroundColor Cyan
Write-Host ""

# Ejecutar Tauri en modo estable
npm run tauri:dev-stable 