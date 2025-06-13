#!/bin/bash

# 🔄 Setup Script para Solución Híbrida LuminaKraft Launcher
# ============================================================

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuración
PRIVATE_REPO="kristiangarcia/luminakraft-launcher"
PUBLIC_REPO="kristiangarcia/luminakraft-launcher-releases"
CURRENT_DIR=$(pwd)

# Funciones de utilidad
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_step() {
    echo -e "${PURPLE}🔧 $1${NC}"
}

# Banner
echo -e "${CYAN}"
cat << "EOF"
  ██╗    ██╗   ██╗███╗   ███╗██╗███╗   ██╗ █████╗ ██╗  ██╗██████╗  █████╗ ███████╗████████╗
  ██║    ██║   ██║████╗ ████║██║████╗  ██║██╔══██╗██║ ██╔╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝
  ██║    ██║   ██║██╔████╔██║██║██╔██╗ ██║███████║█████╔╝ ██████╔╝███████║█████╗     ██║   
  ██║    ██║   ██║██║╚██╔╝██║██║██║╚██╗██║██╔══██║██╔═██╗ ██╔══██╗██╔══██║██╔══╝     ██║   
  ███████╗╚██████╔╝██║ ╚═╝ ██║██║██║ ╚████║██║  ██║██║  ██╗██║  ██║██║  ██║██║        ██║   
  ╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝   
                                                                                             
                          🔄 Hybrid Solution Setup 🔄
EOF
echo -e "${NC}"

echo -e "${CYAN}============================================================================${NC}"
echo -e "${GREEN}  🚀 Configurando Solución Híbrida para LuminaKraft Launcher${NC}"
echo -e "${CYAN}============================================================================${NC}"
echo ""

# Verificar si estamos en el repositorio correcto
log_step "Verificando repositorio actual..."
if [[ ! -f "src-tauri/Cargo.toml" ]]; then
    log_error "No se encontró src-tauri/Cargo.toml. ¿Estás en el directorio correcto?"
    exit 1
fi

if [[ ! -f "package.json" ]]; then
    log_error "No se encontró package.json. ¿Estás en el directorio del launcher?"
    exit 1
fi

log_success "Repositorio verificado correctamente"

# Verificar Git
log_step "Verificando configuración de Git..."
if ! command -v git &> /dev/null; then
    log_error "Git no está instalado"
    exit 1
fi

CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
if [[ $CURRENT_REMOTE != *"$PRIVATE_REPO"* ]]; then
    log_warning "El remote actual no parece ser el repositorio privado esperado"
    log_info "Remote actual: $CURRENT_REMOTE"
    log_info "Remote esperado: *$PRIVATE_REPO*"
    echo ""
    read -p "¿Continuar de todas formas? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Setup cancelado por el usuario"
        exit 0
    fi
fi

log_success "Git configurado correctamente"

# Verificar GitHub CLI (opcional)
log_step "Verificando GitHub CLI..."
if command -v gh &> /dev/null; then
    log_success "GitHub CLI encontrado"
    GH_AVAILABLE=true
else
    log_warning "GitHub CLI no encontrado. Configuración manual requerida para secrets"
    GH_AVAILABLE=false
fi

# Verificar workflows existentes
log_step "Verificando workflows existentes..."

WORKFLOWS_DIR=".github/workflows"
if [[ ! -d "$WORKFLOWS_DIR" ]]; then
    log_info "Creando directorio de workflows..."
    mkdir -p "$WORKFLOWS_DIR"
fi

# Listar workflows existentes
log_info "Workflows encontrados:"
for workflow in "$WORKFLOWS_DIR"/*.yml; do
    if [[ -f "$workflow" ]]; then
        echo "  📄 $(basename "$workflow")"
    fi
done

# Verificar secrets requeridos
log_step "Verificando secrets requeridos..."

REQUIRED_SECRETS=(
    "PUBLIC_REPO_TOKEN"
    "TAURI_PRIVATE_KEY" 
    "TAURI_KEY_PASSWORD"
)

if [[ $GH_AVAILABLE == true ]]; then
    log_info "Verificando secrets existentes..."
    for secret in "${REQUIRED_SECRETS[@]}"; do
        if gh secret list | grep -q "$secret"; then
            log_success "Secret '$secret' encontrado"
        else
            log_warning "Secret '$secret' no encontrado"
        fi
    done
else
    log_info "Secrets requeridos (configurar manualmente):"
    for secret in "${REQUIRED_SECRETS[@]}"; do
        echo "  🔑 $secret"
    done
fi

# Configurar remote del repositorio público
log_step "Configurando remote del repositorio público..."

if git remote get-url public &>/dev/null; then
    CURRENT_PUBLIC=$(git remote get-url public)
    log_info "Remote 'public' ya existe: $CURRENT_PUBLIC"
    
    if [[ $CURRENT_PUBLIC != *"$PUBLIC_REPO"* ]]; then
        log_warning "El remote público no coincide con el esperado"
        read -p "¿Actualizar remote público? (Y/n): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            git remote set-url public "https://github.com/$PUBLIC_REPO.git"
            log_success "Remote público actualizado"
        fi
    else
        log_success "Remote público configurado correctamente"
    fi
else
    log_info "Agregando remote público..."
    git remote add public "https://github.com/$PUBLIC_REPO.git"
    log_success "Remote público agregado"
fi

# Mostrar configuración actual
echo ""
echo -e "${CYAN}============================================================================${NC}"
echo -e "${GREEN}  📋 Configuración Actual${NC}"
echo -e "${CYAN}============================================================================${NC}"

echo -e "${BLUE}🔗 Remotes configurados:${NC}"
git remote -v | sed 's/^/  /'

echo ""
echo -e "${BLUE}🔄 Workflows disponibles:${NC}"
for workflow in "$WORKFLOWS_DIR"/*.yml; do
    if [[ -f "$workflow" ]]; then
        echo "  📄 $(basename "$workflow")"
    fi
done

echo ""
echo -e "${BLUE}🔑 Secrets requeridos:${NC}"
for secret in "${REQUIRED_SECRETS[@]}"; do
    echo "  🔑 $secret"
done

# Instrucciones finales
echo ""
echo -e "${CYAN}============================================================================${NC}"
echo -e "${GREEN}  🚀 Próximos Pasos${NC}"
echo -e "${CYAN}============================================================================${NC}"

echo -e "${YELLOW}1. Configurar Secrets en GitHub:${NC}"
echo "   📍 Ve a: https://github.com/$PRIVATE_REPO/settings/secrets/actions"
echo "   🔑 Agrega los secrets requeridos"
echo ""

echo -e "${YELLOW}2. Configurar Secrets en el Repo Público:${NC}"
echo "   📍 Ve a: https://github.com/$PUBLIC_REPO/settings/secrets/actions"
echo "   🔑 Agrega TAURI_PRIVATE_KEY y TAURI_KEY_PASSWORD (mismos valores)"
echo ""

echo -e "${YELLOW}3. Probar la Configuración:${NC}"
echo "   🧪 Ejecuta un workflow manualmente desde GitHub Actions"
echo "   📍 https://github.com/$PRIVATE_REPO/actions"
echo ""

echo -e "${YELLOW}4. Crear tu Primera Release:${NC}"
echo "   🏷️  git tag v1.0.0"
echo "   📤 git push origin v1.0.0"
echo ""

if [[ $GH_AVAILABLE == true ]]; then
    echo -e "${BLUE}💡 Comandos útiles con GitHub CLI:${NC}"
    echo "   gh secret set PUBLIC_REPO_TOKEN --body 'tu-token-aqui'"
    echo "   gh secret set TAURI_PRIVATE_KEY --body 'tu-clave-privada'"
    echo "   gh secret set TAURI_KEY_PASSWORD --body 'tu-password'"
    echo ""
fi

echo -e "${GREEN}✅ Setup de la Solución Híbrida completado${NC}"
echo -e "${CYAN}📖 Para más información, consulta: HYBRID_SOLUTION.md${NC}"

# Verificar si hay cambios para commit
if [[ -n $(git status --porcelain) ]]; then
    echo ""
    log_info "Se detectaron cambios en el repositorio"
    echo -e "${YELLOW}¿Quieres hacer commit de los cambios? (Y/n):${NC}"
    read -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        git add .
        git commit -m "🔄 Setup: Configuración híbrida de repositorios

- Agregado remote público
- Workflows actualizados
- Documentación híbrida añadida"
        log_success "Cambios committed correctamente"
        
        echo -e "${YELLOW}¿Hacer push al repositorio privado? (Y/n):${NC}"
        read -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            git push origin main
            log_success "Cambios pusheados al repositorio privado"
        fi
    fi
fi

echo ""
echo -e "${GREEN}🎉 ¡Configuración completada exitosamente!${NC}"
echo -e "${BLUE}🚀 Tu solución híbrida está lista para usar${NC}" 