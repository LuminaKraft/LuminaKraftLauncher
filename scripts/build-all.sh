#!/bin/bash
set -e

# Colores para mensajes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== LuminaKraft Launcher - Compilador Multiplataforma ===${NC}"

# Variables para control de limpieza
CLEAN_DOCKER=false

# Parsear argumentos de línea de comandos
while [[ $# -gt 0 ]]; do
    case $1 in
        all)
            BUILD_ALL=true
            shift
            ;;
        --clean-docker)
            CLEAN_DOCKER=true
            shift
            ;;
        *)
            echo -e "${RED}Argumento desconocido: $1${NC}"
            echo "Uso: $0 [all] [--clean-docker]"
            echo "  all: Compilar todas las plataformas sin menú interactivo"
            echo "  --clean-docker: Limpiar entorno Docker antes de cada compilación (más lento pero más confiable)"
            exit 1
            ;;
    esac
done

# Clean old artifacts function
clean_old_artifacts() {
    echo -e "${YELLOW}Limpiando artefactos antiguos...${NC}"
    
    # Clean dist folder completely to start fresh
    rm -rf dist/*
    
    # Clean old artifacts from target directories to prevent confusion
    find src-tauri/target -name "*.exe" -o -name "*.dmg" -o -name "*.deb" -o -name "*.rpm" -o -name "*.AppImage" 2>/dev/null | xargs rm -f 2>/dev/null || true
    
    echo -e "${GREEN}Artefactos antiguos limpiados.${NC}"
}

# Crear directorio para distribución
mkdir -p dist

# Comprobar si Docker está instalado y en ejecución
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker no está instalado. Por favor, instala Docker para continuar.${NC}"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker no está en ejecución. Por favor, inicia Docker para continuar.${NC}"
    exit 1
fi

# Limpiar entorno Docker antes de compilar (opcional)
clean_docker() {
    if [ "$CLEAN_DOCKER" = true ]; then
        echo -e "${YELLOW}Limpiando entorno Docker para optimizar memoria...${NC}"
        bash scripts/clean-docker.sh
        echo -e "${GREEN}Entorno Docker limpiado.${NC}"
    else
        echo -e "${BLUE}Saltando limpieza de Docker para compilación más rápida...${NC}"
    fi
}

# Compilar para macOS (nativo)
build_macos() {
    echo -e "${GREEN}Compilando para macOS...${NC}"
    bash scripts/build-macos.sh
    echo -e "${GREEN}Compilación para macOS completada.${NC}"
    echo -e "${BLUE}Artefactos generados:${NC}"
    echo -e "  - DMG Intel: LuminaKraft Launcher_*_x64.dmg"
    echo -e "  - DMG ARM64: LuminaKraft Launcher_*_aarch64.dmg"
    echo -e "  - App Intel: LuminaKraft Launcher Intel.app"
    echo -e "  - App ARM64: LuminaKraft Launcher ARM64.app"
}

# Compilar para Windows (usando Docker)
build_windows() {
    echo -e "${GREEN}Compilando para Windows usando Docker...${NC}"
    clean_docker
    bash scripts/build-windows.sh
    echo -e "${GREEN}Compilación para Windows completada.${NC}"
    echo -e "${BLUE}Artefactos generados:${NC}"
    echo -e "  - Ejecutable portable: LuminaKraft Launcher_*_x64_portable.exe"
    echo -e "  - Instalador: LuminaKraft Launcher_*_x64-setup.exe"
}

# Compilar para Linux (usando Docker)
build_linux() {
    echo -e "${GREEN}Compilando para Linux usando Docker...${NC}"
    clean_docker
    bash scripts/build-linux.sh
    echo -e "${GREEN}Compilación para Linux completada.${NC}"
    echo -e "${BLUE}Artefactos generados:${NC}"
    echo -e "  - AppImage: LuminaKraft Launcher_*_amd64.AppImage (portable GUI)"
    echo -e "  - Debian: LuminaKraft Launcher_*_amd64.deb (Ubuntu/Debian)"
    echo -e "  - RPM: LuminaKraft Launcher-*-1.x86_64.rpm (Red Hat/Fedora)"
    echo -e "  - Binario: luminakraft-launcher (ejecutable Linux)"
}

# Compilar todos sin interacción (para uso en scripts) - secuencial para evitar conflictos de memoria
build_all_non_interactive() {
    echo -e "${YELLOW}Construyendo todas las plataformas secuencialmente para optimizar memoria...${NC}"
    
    # Clean old artifacts first to ensure fresh build
    clean_old_artifacts
    
    if [ "$CLEAN_DOCKER" = true ]; then
        echo -e "${YELLOW}Nota: Limpieza de Docker habilitada - compilación será más lenta pero más confiable${NC}"
    else
        echo -e "${BLUE}Nota: Limpieza de Docker deshabilitada - compilación más rápida${NC}"
        echo -e "${BLUE}Usa --clean-docker si encuentras problemas de memoria o cache${NC}"
    fi
    
    # Construir macOS primero (nativo, usa menos recursos)
    build_macos
    
    # Esperar un momento entre builds para liberar memoria
    echo -e "${YELLOW}Esperando 10 segundos para liberar memoria...${NC}"
    sleep 10
    
    # Construir Windows con limpieza previa
    build_windows
    
    # Esperar un momento entre builds
    echo -e "${YELLOW}Esperando 10 segundos para liberar memoria...${NC}"
    sleep 10
    
    # Construir Linux con limpieza previa
    build_linux
    
    echo -e "${BLUE}=== Compilación completada para todas las plataformas ===${NC}"
    echo -e "${GREEN}✅ macOS: Completado${NC}"
    echo -e "${GREEN}✅ Windows: Completado${NC}"
    echo -e "${GREEN}✅ Linux: Completado${NC}"
    echo ""
    echo -e "${GREEN}Todos los ejecutables y archivos de distribución están en el directorio 'dist/'${NC}"
    echo -e "${BLUE}📋 Resumen de artefactos generados:${NC}"
    echo -e "  🍎 macOS: DMG files + .app bundles"
    echo -e "  🪟 Windows: Setup installer + portable executable"
    echo -e "  🐧 Linux: DEB + RPM + AppImage + binary"
    return 0
}

# Si se especificó BUILD_ALL, compilar todo sin interacción
if [ "$BUILD_ALL" = true ]; then
    build_all_non_interactive
    exit 0
fi

# Menú principal
echo "Selecciona las plataformas para compilar:"
echo "1) Todas las plataformas (secuencial, optimizado para memoria)"
echo "2) Solo macOS"
echo "3) Solo Windows"
echo "4) Solo Linux"
echo "5) Salir"
echo ""
if [ "$CLEAN_DOCKER" = true ]; then
    echo -e "${YELLOW}Modo limpieza Docker: HABILITADO (más lento, más confiable)${NC}"
else
    echo -e "${BLUE}Modo limpieza Docker: DESHABILITADO (más rápido)${NC}"
    echo -e "${BLUE}Usa: $0 --clean-docker para habilitar limpieza${NC}"
fi
echo ""

read -p "Opción: " option

case $option in
    1)
        build_all_non_interactive
        ;;
    2)
        echo -e "${YELLOW}Nota: Construyendo solo macOS, no se limpiarán artefactos existentes${NC}"
        build_macos
        ;;
    3)
        echo -e "${YELLOW}Nota: Construyendo solo Windows, no se limpiarán artefactos existentes${NC}"
        build_windows
        ;;
    4)
        echo -e "${YELLOW}Nota: Construyendo solo Linux, no se limpiarán artefactos existentes${NC}"
        build_linux
        ;;
    5)
        echo "Saliendo..."
        exit 0
        ;;
    *)
        echo -e "${RED}Opción inválida${NC}"
        exit 1
        ;;
esac

echo -e "${BLUE}=== Compilación completada ===${NC}"
echo -e "${GREEN}Todos los ejecutables y archivos de distribución están en el directorio 'dist/'${NC}" 