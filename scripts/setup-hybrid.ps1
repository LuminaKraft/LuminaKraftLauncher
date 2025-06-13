# 🔄 Setup Script para Solución Híbrida LuminaKraft Launcher (PowerShell)
# ===========================================================================

# Configuración
$PRIVATE_REPO = "kristiangarcia/luminakraft-launcher"
$PUBLIC_REPO = "kristiangarcia/luminakraft-launcher-releases"
$CURRENT_DIR = Get-Location

# Funciones de utilidad
function Write-Info { 
    Write-Host "ℹ️  $args" -ForegroundColor Blue 
}
function Write-Success { 
    Write-Host "✅ $args" -ForegroundColor Green 
}
function Write-Warning { 
    Write-Host "⚠️  $args" -ForegroundColor Yellow 
}
function Write-Error { 
    Write-Host "❌ $args" -ForegroundColor Red 
}
function Write-Step { 
    Write-Host "🔧 $args" -ForegroundColor Magenta 
}

# Banner
Write-Host @"
  ██╗    ██╗   ██╗███╗   ███╗██╗███╗   ██╗ █████╗ ██╗  ██╗██████╗  █████╗ ███████╗████████╗
  ██║    ██║   ██║████╗ ████║██║████╗  ██║██╔══██╗██║ ██╔╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝
  ██║    ██║   ██║██╔████╔██║██║██╔██╗ ██║███████║█████╔╝ ██████╔╝███████║█████╗     ██║   
  ██║    ██║   ██║██║╚██╔╝██║██║██║╚██╗██║██╔══██║██╔═██╗ ██╔══██╗██╔══██║██╔══╝     ██║   
  ███████╗╚██████╔╝██║ ╚═╝ ██║██║██║ ╚████║██║  ██║██║  ██╗██║  ██║██║  ██║██║        ██║   
  ╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝   
                                                                                             
                          🔄 Hybrid Solution Setup 🔄
"@ -ForegroundColor Cyan

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  🚀 Configurando Solución Híbrida para LuminaKraft Launcher" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar si estamos en el repositorio correcto
Write-Step "Verificando repositorio actual..."
if (-not (Test-Path "src-tauri/Cargo.toml")) {
    Write-Error "No se encontró src-tauri/Cargo.toml. ¿Estás en el directorio correcto?"
    exit 1
}

if (-not (Test-Path "package.json")) {
    Write-Error "No se encontró package.json. ¿Estás en el directorio del launcher?"
    exit 1
}

Write-Success "Repositorio verificado correctamente"

# Verificar Git
Write-Step "Verificando configuración de Git..."
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git no está instalado"
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
    $reply = Read-Host "¿Continuar de todas formas? (y/N)"
    if ($reply -ne "y" -and $reply -ne "Y") {
        Write-Info "Setup cancelado por el usuario"
        exit 0
    }
}

Write-Success "Git configurado correctamente"

# Verificar GitHub CLI (opcional)
Write-Step "Verificando GitHub CLI..."
if (Get-Command gh -ErrorAction SilentlyContinue) {
    Write-Success "GitHub CLI encontrado"
    $GH_AVAILABLE = $true
} else {
    Write-Warning "GitHub CLI no encontrado. Configuración manual requerida para secrets"
    $GH_AVAILABLE = $false
}

# Verificar workflows existentes
Write-Step "Verificando workflows existentes..."

$WORKFLOWS_DIR = ".github/workflows"
if (-not (Test-Path $WORKFLOWS_DIR)) {
    Write-Info "Creando directorio de workflows..."
    New-Item -ItemType Directory -Path $WORKFLOWS_DIR -Force | Out-Null
}

# Listar workflows existentes
Write-Info "Workflows encontrados:"
Get-ChildItem "$WORKFLOWS_DIR/*.yml" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  📄 $($_.Name)"
}

# Verificar secrets requeridos
Write-Step "Verificando secrets requeridos..."

$REQUIRED_SECRETS = @(
    "PUBLIC_REPO_TOKEN",
    "TAURI_PRIVATE_KEY", 
    "TAURI_KEY_PASSWORD"
)

if ($GH_AVAILABLE) {
    Write-Info "Verificando secrets existentes..."
    $existingSecrets = gh secret list 2>$null
    foreach ($secret in $REQUIRED_SECRETS) {
        if ($existingSecrets -like "*$secret*") {
            Write-Success "Secret '$secret' encontrado"
        } else {
            Write-Warning "Secret '$secret' no encontrado"
        }
    }
} else {
    Write-Info "Secrets requeridos (configurar manualmente):"
    foreach ($secret in $REQUIRED_SECRETS) {
        Write-Host "  🔑 $secret"
    }
}

# Configurar remote del repositorio público
Write-Step "Configurando remote del repositorio público..."

try {
    $CURRENT_PUBLIC = git remote get-url public 2>$null
    Write-Info "Remote 'public' ya existe: $CURRENT_PUBLIC"
    
    if ($CURRENT_PUBLIC -notlike "*$PUBLIC_REPO*") {
        Write-Warning "El remote público no coincide con el esperado"
        $reply = Read-Host "¿Actualizar remote público? (Y/n)"
        if ($reply -eq "Y" -or $reply -eq "y" -or $reply -eq "") {
            git remote set-url public "https://github.com/$PUBLIC_REPO.git"
            Write-Success "Remote público actualizado"
        }
    } else {
        Write-Success "Remote público configurado correctamente"
    }
} catch {
    Write-Info "Agregando remote público..."
    git remote add public "https://github.com/$PUBLIC_REPO.git"
    Write-Success "Remote público agregado"
}

# Mostrar configuración actual
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  📋 Configuración Actual" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Cyan

Write-Host "🔗 Remotes configurados:" -ForegroundColor Blue
git remote -v | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "🔄 Workflows disponibles:" -ForegroundColor Blue
Get-ChildItem "$WORKFLOWS_DIR/*.yml" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  📄 $($_.Name)"
}

Write-Host ""
Write-Host "🔑 Secrets requeridos:" -ForegroundColor Blue
foreach ($secret in $REQUIRED_SECRETS) {
    Write-Host "  🔑 $secret"
}

# Instrucciones finales
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  🚀 Próximos Pasos" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Cyan

Write-Host "1. Configurar Secrets en GitHub:" -ForegroundColor Yellow
Write-Host "   📍 Ve a: https://github.com/$PRIVATE_REPO/settings/secrets/actions"
Write-Host "   🔑 Agrega los secrets requeridos"
Write-Host ""

Write-Host "2. Configurar Secrets en el Repo Público:" -ForegroundColor Yellow
Write-Host "   📍 Ve a: https://github.com/$PUBLIC_REPO/settings/secrets/actions"
Write-Host "   🔑 Agrega TAURI_PRIVATE_KEY y TAURI_KEY_PASSWORD (mismos valores)"
Write-Host ""

Write-Host "3. Probar la Configuración:" -ForegroundColor Yellow
Write-Host "   🧪 Ejecuta un workflow manualmente desde GitHub Actions"
Write-Host "   📍 https://github.com/$PRIVATE_REPO/actions"
Write-Host ""

Write-Host "4. Crear tu Primera Release:" -ForegroundColor Yellow
Write-Host "   🏷️  git tag v1.0.0"
Write-Host "   📤 git push origin v1.0.0"
Write-Host ""

if ($GH_AVAILABLE) {
    Write-Host "💡 Comandos útiles con GitHub CLI:" -ForegroundColor Blue
    Write-Host "   gh secret set PUBLIC_REPO_TOKEN --body 'tu-token-aqui'"
    Write-Host "   gh secret set TAURI_PRIVATE_KEY --body 'tu-clave-privada'"
    Write-Host "   gh secret set TAURI_KEY_PASSWORD --body 'tu-password'"
    Write-Host ""
}

Write-Success "Setup de la Solución Híbrida completado"
Write-Host "📖 Para más información, consulta: HYBRID_SOLUTION.md" -ForegroundColor Cyan

# Verificar si hay cambios para commit
$gitStatus = git status --porcelain 2>$null
if ($gitStatus) {
    Write-Host ""
    Write-Info "Se detectaron cambios en el repositorio"
    $reply = Read-Host "¿Quieres hacer commit de los cambios? (Y/n)"
    if ($reply -eq "Y" -or $reply -eq "y" -or $reply -eq "") {
        git add .
        git commit -m "🔄 Setup: Configuración híbrida de repositorios`n`n- Agregado remote público`n- Workflows actualizados`n- Documentación híbrida añadida"
        Write-Success "Cambios committed correctamente"
        
        $reply = Read-Host "¿Hacer push al repositorio privado? (Y/n)"
        if ($reply -eq "Y" -or $reply -eq "y" -or $reply -eq "") {
            git push origin main
            Write-Success "Cambios pusheados al repositorio privado"
        }
    }
}

Write-Host ""
Write-Host "🎉 ¡Configuración completada exitosamente!" -ForegroundColor Green
Write-Host "🚀 Tu solucion hibrida esta lista para usar" -ForegroundColor Blue 