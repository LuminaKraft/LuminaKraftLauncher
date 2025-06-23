#!/bin/bash
set -e

# Colores para mensajes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Limpiando artefactos de construcción ===${NC}"

# Clean dist folder completely
echo "Limpiando directorio dist/..."
rm -rf dist/*

# Clean old artifacts from target directories
echo "Limpiando artefactos antiguos de directorios target/..."
find src-tauri/target -name "*.exe" -o -name "*.dmg" -o -name "*.deb" -o -name "*.rpm" -o -name "*.AppImage" 2>/dev/null | xargs rm -f 2>/dev/null || true

# Also clean any cached build outputs
echo "Limpiando cache de Vite..."
rm -rf node_modules/.vite 2>/dev/null || true

echo -e "${GREEN}✅ Todos los artefactos han sido limpiados.${NC}"
echo "Ahora puedes ejecutar una construcción limpia con:"
echo "  bash scripts/build-all.sh all" 