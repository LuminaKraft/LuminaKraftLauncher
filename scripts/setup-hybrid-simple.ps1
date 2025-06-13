# Setup Script para Solucion Hibrida LuminaKraft Launcher
# ========================================================

# Configuracion
$PRIVATE_REPO = "kristiangarcia/luminakraft-launcher"
$PUBLIC_REPO = "kristiangarcia/luminakraft-launcher-releases"

# Funciones de utilidad
function Write-Info { 
    Write-Host "INFO: $args" -ForegroundColor Blue 
}
function Write-Success { 
    Write-Host "SUCCESS: $args" -ForegroundColor Green 
}
function Write-Warning { 
    Write-Host "WARNING: $args" -ForegroundColor Yellow 
}
function Write-Error { 
    Write-Host "ERROR: $args" -ForegroundColor Red 
}
function Write-Step { 
    Write-Host "STEP: $args" -ForegroundColor Magenta 
}

# Banner
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  SETUP: Solucion Hibrida para LuminaKraft Launcher" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar si estamos en el repositorio correcto
Write-Step "Verificando repositorio actual..."
if (-not (Test-Path "src-tauri/Cargo.toml")) {
    Write-Error "No se encontro src-tauri/Cargo.toml. Estas en el directorio correcto?"
    exit 1
}

if (-not (Test-Path "package.json")) {
    Write-Error "No se encontro package.json. Estas en el directorio del launcher?"
    exit 1
}

Write-Success "Repositorio verificado correctamente"

# Verificar Git
Write-Step "Verificando configuracion de Git..."
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git no esta instalado"
    exit 1
}

try {
    $CURRENT_REMOTE = git remote get-url origin 2>$null
} catch {
    $CURRENT_REMOTE = ""
}

if ($CURRENT_REMOTE -notlike "*$PRIVATE_REPO*") {
    Write-Warning "El remote actual no parece ser el repositorio privado esperado"
    Write-Info "Remote actual: $CURRENT_REMOTE"
    Write-Info "Remote esperado: *$PRIVATE_REPO*"
    Write-Host ""
    $reply = Read-Host "Continuar de todas formas? (y/N)"
    if ($reply -ne "y" -and $reply -ne "Y") {
        Write-Info "Setup cancelado por el usuario"
        exit 0
    }
}

Write-Success "Git configurado correctamente"

# Configurar remote del repositorio publico
Write-Step "Configurando remote del repositorio publico..."

try {
    $CURRENT_PUBLIC = git remote get-url public 2>$null
    Write-Info "Remote 'public' ya existe: $CURRENT_PUBLIC"
    
    if ($CURRENT_PUBLIC -notlike "*$PUBLIC_REPO*") {
        Write-Warning "El remote publico no coincide con el esperado"
        $reply = Read-Host "Actualizar remote publico? (Y/n)"
        if ($reply -eq "Y" -or $reply -eq "y" -or $reply -eq "") {
            git remote set-url public "https://github.com/$PUBLIC_REPO.git"
            Write-Success "Remote publico actualizado"
        }
    } else {
        Write-Success "Remote publico configurado correctamente"
    }
} catch {
    Write-Info "Agregando remote publico..."
    git remote add public "https://github.com/$PUBLIC_REPO.git"
    Write-Success "Remote publico agregado"
}

# Mostrar configuracion actual
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  CONFIGURACION ACTUAL" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Cyan

Write-Host "Remotes configurados:" -ForegroundColor Blue
git remote -v | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "Workflows disponibles:" -ForegroundColor Blue
$WORKFLOWS_DIR = ".github/workflows"
Get-ChildItem "$WORKFLOWS_DIR/*.yml" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  $($_.Name)"
}

# Instrucciones finales
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  PROXIMOS PASOS" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Cyan

Write-Host "1. Configurar Secrets en GitHub:" -ForegroundColor Yellow
Write-Host "   Ve a: https://github.com/$PRIVATE_REPO/settings/secrets/actions"
Write-Host "   Agrega: TAURI_PRIVATE_KEY, TAURI_KEY_PASSWORD, PUBLIC_REPO_TOKEN"
Write-Host ""

Write-Host "2. Configurar Secrets en el Repo Publico:" -ForegroundColor Yellow
Write-Host "   Ve a: https://github.com/$PUBLIC_REPO/settings/secrets/actions"
Write-Host "   Agrega: TAURI_PRIVATE_KEY y TAURI_KEY_PASSWORD (mismos valores)"
Write-Host ""

Write-Host "3. Crear tu Primera Release:" -ForegroundColor Yellow
Write-Host "   npm run release:patch"
Write-Host "   O: git tag v1.0.0 && git push origin v1.0.0"
Write-Host ""

Write-Success "Setup completado exitosamente!"
Write-Host "Para mas informacion, consulta: HYBRID_SOLUTION.md" -ForegroundColor Cyan

# Verificar si hay cambios para commit
$gitStatus = git status --porcelain 2>$null
if ($gitStatus) {
    Write-Host ""
    Write-Info "Se detectaron cambios en el repositorio"
    $reply = Read-Host "Quieres hacer commit de los cambios? (Y/n)"
    if ($reply -eq "Y" -or $reply -eq "y" -or $reply -eq "") {
        git add .
        git commit -m "Setup: Configuracion hibrida de repositorios - Agregado remote publico - Workflows actualizados - Documentacion hibrida añadida"
        Write-Success "Cambios committed correctamente"
        
        $reply = Read-Host "Hacer push al repositorio privado? (Y/n)"
        if ($reply -eq "Y" -or $reply -eq "y" -or $reply -eq "") {
            git push origin main
            Write-Success "Cambios pusheados al repositorio privado"
        }
    }
}

Write-Host ""
Write-Host "CONFIGURACION COMPLETADA EXITOSAMENTE!" -ForegroundColor Green
Write-Host "Tu solucion hibrida esta lista para usar" -ForegroundColor Blue 