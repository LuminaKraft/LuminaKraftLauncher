#!/bin/bash
set -e

echo "--- Building LuminaKraft Launcher for Linux ---"

# Verify Docker image exists, if not build it
if ! docker image inspect luminakraft-linux-builder &> /dev/null; then
    echo "Building Docker image for Linux..."
    docker build -t luminakraft-linux-builder -f docker/Dockerfile.linux-builder .
fi

# Create cache directory if doesn't exist
HOME_DIR="$HOME"
CACHE_DIR="$HOME_DIR/.tauri"
mkdir -p "$CACHE_DIR"

# Create dist directory
mkdir -p dist

# Set aggressive memory limits for the build process
MEMORY_LIMIT="6g"
MEMORY_SWAP="8g"
SHM_SIZE="1g"

echo "Using memory settings: limit=$MEMORY_LIMIT, swap=$MEMORY_SWAP, shm=$SHM_SIZE"

# Build Linux version with strict memory controls
echo "Building for Linux using Docker..."
docker run \
    --rm \
    -v "$(pwd):/app" \
    -v "$CACHE_DIR:/root/.tauri" \
    -w /app \
    --memory="$MEMORY_LIMIT" \
    --memory-swap="$MEMORY_SWAP" \
    --shm-size="$SHM_SIZE" \
    --cpus="2.0" \
    --memory-swappiness=10 \
    --oom-kill-disable=false \
    -e CARGO_BUILD_JOBS=2 \
    -e CARGO_NET_GIT_FETCH_WITH_CLI=true \
    -e RUSTFLAGS="-C link-arg=-Wl,--no-keep-memory -C link-arg=-Wl,--reduce-memory-overheads -C codegen-units=1 -C opt-level=1" \
    -e RUSTC_FORCE_INCREMENTAL=1 \
    -e CARGO_INCREMENTAL=1 \
    -e CARGO_TARGET_DIR=/tmp/target-linux \
    luminakraft-linux-builder \
    bash -c "
        echo 'Setting up environment...' && \
        export PATH=/root/.cargo/bin:\$PATH && \
        echo 'Installing dependencies with clean slate...' && \
        rm -rf node_modules package-lock.json 2>/dev/null || true && \
        npm cache clean --force && \
        npm install && \
        echo 'Building Linux executable with memory optimizations...' && \
        npx tauri build --target x86_64-unknown-linux-gnu --verbose && \
        echo 'Copying build artifacts to dist directory...' && \
        mkdir -p /app/dist && \
        find /tmp/target-linux/x86_64-unknown-linux-gnu/release/bundle -name '*.deb' -exec cp {} /app/dist/ \; && \
        find /tmp/target-linux/x86_64-unknown-linux-gnu/release/bundle -name '*.rpm' -exec cp {} /app/dist/ \; && \
        find /tmp/target-linux/x86_64-unknown-linux-gnu/release/bundle -name '*.AppImage' -exec cp {} /app/dist/ \; && \
        find /tmp/target-linux/x86_64-unknown-linux-gnu/release -name 'luminakraft-launcher' -type f -executable -exec cp {} /app/dist/ \; && \
        echo 'Linux build artifacts copied to dist/' && \
        ls -la /app/dist/
    "

echo "✅ Linux build completed successfully!"
echo "📦 Artifacts available in dist/ directory"

# List the artifacts that were created
echo ""
echo "📋 Linux build artifacts:"
ls -la dist/ | grep -E '\.(deb|rpm|AppImage)$|luminakraft-launcher$' || echo "No Linux artifacts found in dist/" 