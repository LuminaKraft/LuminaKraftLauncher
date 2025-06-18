#!/bin/bash
set -e

echo "--- Building LuminaKraft Launcher for Linux ---"

# Verify Docker image exists, if not build it
if ! docker image inspect tauri-builder &> /dev/null; then
    echo "Building Docker image for Linux..."
    docker build -t tauri-builder -f docker/Dockerfile.linux-builder .
fi

# Create cache directory if doesn't exist
HOME_DIR="$HOME"
CACHE_DIR="$HOME_DIR/.tauri"
mkdir -p "$CACHE_DIR"

# Build Linux version
echo "Building for Linux using Docker..."
docker run --rm -m 8g --memory-swap 12g --shm-size=2g \
    -v "$(pwd):/app" \
    -v "$CACHE_DIR:/root/.tauri" \
    tauri-builder \
    bash -c "cd /app && npm install && export PKG_CONFIG_ALLOW_CROSS=1 && export PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig && export PKG_CONFIG_SYSROOT_DIR=/ && npm run tauri build -- --target x86_64-unknown-linux-gnu"

echo "Linux build completed!"

# Copy the build artifacts to expected locations if needed
LINUX_BUNDLE_DIR="src-tauri/target/x86_64-unknown-linux-gnu/release/bundle"
LINUX_TARGET_DIR="src-tauri/target/release"

# Create target directory if it doesn't exist (should already exist but just in case)
mkdir -p "$LINUX_TARGET_DIR"

# Copy files
if [ -d "$LINUX_BUNDLE_DIR" ]; then
    echo "Copying Linux build artifacts..."
    cp -r "$LINUX_BUNDLE_DIR" "$(dirname "$LINUX_TARGET_DIR")"
    echo "Linux artifacts copied successfully"
fi 