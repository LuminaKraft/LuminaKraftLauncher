#!/bin/bash
set -e

# Colores para mensajes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== LuminaKraft Launcher - Compilador Multiplataforma ===${NC}"

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

# Limpiar entorno Docker antes de compilar
clean_docker() {
    echo -e "${YELLOW}Limpiando entorno Docker para optimizar memoria...${NC}"
    bash scripts/clean-docker.sh
    echo -e "${GREEN}Entorno Docker limpiado.${NC}"
}

# Compilar para macOS (nativo)
build_macos() {
    echo -e "${GREEN}Compilando para macOS...${NC}"
    bash scripts/build-macos.sh
    echo -e "${GREEN}Compilación para macOS completada.${NC}"
}

# Compilar para Windows (usando Docker)
build_windows() {
    echo -e "${GREEN}Compilando para Windows usando Docker...${NC}"
    clean_docker
    bash scripts/build-windows.sh
    echo -e "${GREEN}Compilación para Windows completada.${NC}"
}

# Compilar para Linux (usando Docker)
build_linux() {
    echo -e "${GREEN}Compilando para Linux usando Docker...${NC}"
    clean_docker
    bash scripts/build-linux.sh
    echo -e "${GREEN}Compilación para Linux completada.${NC}"
}

# Compilar todos sin interacción (para uso en scripts) - secuencial para evitar conflictos de memoria
build_all_non_interactive() {
    echo -e "${YELLOW}Construyendo todas las plataformas secuencialmente para optimizar memoria...${NC}"
    
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
    return 0
}

# Si se pasa el argumento "all", compilar todo sin interacción
if [ "$1" == "all" ]; then
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

read -p "Opción: " option

case $option in
    1)
        build_all_non_interactive
        ;;
    2)
        build_macos
        ;;
    3)
        build_windows
        ;;
    4)
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
echo -e "${GREEN}Los ejecutables se encuentran en los directorios target respectivos${NC}" 