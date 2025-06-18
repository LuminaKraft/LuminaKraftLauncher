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

# Build Windows version
echo "Building for Windows using Docker..."
docker run --rm -m 8g --memory-swap 12g --shm-size=2g \
    -v "$(pwd):/app" \
    -v "$CACHE_DIR:/root/.tauri" \
    windows-builder \
    bash -c "cd /app && npm install && npm run tauri build -- --target x86_64-pc-windows-gnu"

echo "Windows build completed!"

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