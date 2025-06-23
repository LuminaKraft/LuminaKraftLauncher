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

# Build Windows version (let Tauri choose appropriate bundles for target)
echo "Building for Windows using Docker..."
docker run --rm -m $MEMORY_LIMIT --memory-swap $MEMORY_SWAP --shm-size=$SHM_SIZE \
    -v "$(pwd):/app" \
    -v "$CACHE_DIR:/root/.tauri" \
    windows-builder \
    bash -c "cd /app && npm install && npm run tauri build -- --target x86_64-pc-windows-gnu"

echo "Windows build completed! Windows installer has been created."
echo "Note: Cross-compilation typically produces NSIS installer (.exe) only."

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