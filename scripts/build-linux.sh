#!/bin/bash
set -e

echo "--- Building LuminaKraft Launcher for Linux ---"

# Verify Docker image exists, if not build it
if ! docker image inspect linux-builder &> /dev/null; then
    echo "Building Docker image for Linux..."
    docker build -t linux-builder -f docker/Dockerfile.linux-builder .
fi

# Create cache directory if doesn't exist
HOME_DIR="$HOME"
CACHE_DIR="$HOME_DIR/.tauri"
mkdir -p "$CACHE_DIR"

# Set memory limits for the build process
MEMORY_LIMIT="4g"
MEMORY_SWAP="6g"
SHM_SIZE="2g"

echo "Using memory settings: limit=$MEMORY_LIMIT, swap=$MEMORY_SWAP, shm=$SHM_SIZE"

# Build Linux version with both DEB and RPM packages
echo "Building for Linux using Docker (DEB + RPM packages)..."

# Run the build command inside the container
docker run --rm -m $MEMORY_LIMIT --memory-swap $MEMORY_SWAP --shm-size=$SHM_SIZE \
    -v "$(pwd):/app" \
    -v "$CACHE_DIR:/root/.tauri" \
    linux-builder \
    bash -c "cd /app && npm install && npm run tauri build -- --target x86_64-unknown-linux-gnu --bundles deb,rpm"

echo "Linux build completed! Both DEB and RPM packages have been created." 