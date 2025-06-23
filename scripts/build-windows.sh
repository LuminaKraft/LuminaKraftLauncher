#!/bin/bash
set -e

echo "--- Building LuminaKraft Launcher for Windows ---"

# Verify Docker image exists, if not build it
if ! docker image inspect windows-builder &> /dev/null; then
    echo "Building Docker image for Windows..."
    docker build -t windows-builder -f docker/Dockerfile.windows-builder .
fi

# Create cache directory if doesn't exist
HOME_DIR="$HOME"
CACHE_DIR="$HOME_DIR/.tauri"
mkdir -p "$CACHE_DIR"

# Set memory limits for the build process
MEMORY_LIMIT="8g"
MEMORY_SWAP="12g"
SHM_SIZE="2g"

echo "Using memory settings: limit=$MEMORY_LIMIT, swap=$MEMORY_SWAP, shm=$SHM_SIZE"

# Build Windows version (NSIS installer only due to cross-compilation limitations)
# Note: MSI generation requires native Windows build environment with WiX Toolset
echo "Building for Windows using Docker (NSIS installer)..."
docker run --rm -m $MEMORY_LIMIT --memory-swap $MEMORY_SWAP --shm-size=$SHM_SIZE \
    -v "$(pwd):/app" \
    -v "$CACHE_DIR:/root/.tauri" \
    windows-builder \
    bash -c "cd /app && npm install && npm run tauri build -- --target x86_64-pc-windows-gnu --bundles nsis"

echo "Windows build completed! NSIS installer has been created."
echo "Note: MSI installer requires native Windows build environment with WiX Toolset."

# Copy the build artifacts to expected locations if needed
WIN_BUNDLE_DIR="src-tauri/target/x86_64-pc-windows-gnu/release/bundle"
WIN_TARGET_DIR="src-tauri/target/x86_64-pc-windows-msvc/release"

# Create target directory if it doesn't exist
mkdir -p "$WIN_TARGET_DIR"

# Copy files
if [ -d "$WIN_BUNDLE_DIR" ]; then
    echo "Copying Windows build artifacts..."
    cp -r "$WIN_BUNDLE_DIR" "$(dirname "$WIN_TARGET_DIR")"
    echo "Windows artifacts copied successfully"
fi 