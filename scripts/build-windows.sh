#!/bin/bash
set -e

echo "--- Building LuminaKraft Launcher for Windows ---"

# Verify Docker image exists, if not build it
if ! docker image inspect luminakraft-windows-builder &> /dev/null; then
    echo "Building Docker image for Windows..."
    docker build -t luminakraft-windows-builder -f docker/Dockerfile.windows-builder .
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

# Build Windows version with strict memory controls
echo "Building for Windows using Docker..."
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
    -e CARGO_TARGET_DIR=/tmp/target-windows \
    luminakraft-windows-builder \
    bash -c "
        echo 'Setting up environment...'
        export PATH=/root/.cargo/bin:\$PATH
        echo 'Installing dependencies with clean slate...'
        # Clean up any existing modules and lock file
        rm -rf node_modules package-lock.json 2>/dev/null || true
        npm cache clean --force
        npm install
        echo 'Building Windows executable with memory optimizations...'
        npx tauri build --target x86_64-pc-windows-gnu --verbose
        
        echo 'Copying build artifacts to host directory...'
        mkdir -p /app/dist
        if [ -f /tmp/target-windows/x86_64-pc-windows-gnu/release/luminakraft-launcher.exe ]; then
            # Get version from package.json
            VERSION=\$(node -p \"require('./package.json').version\")
            PORTABLE_NAME=\"LuminaKraft Launcher_\${VERSION}_x64_portable.exe\"
            cp /tmp/target-windows/x86_64-pc-windows-gnu/release/luminakraft-launcher.exe \"/app/dist/\$PORTABLE_NAME\"
            echo \"Copied portable executable as \$PORTABLE_NAME\"
        else
            echo 'luminakraft-launcher.exe not found!'
        fi
        # Find and copy the installer with dynamic versioning
        INSTALLER_PATH=\$(find /tmp/target-windows/x86_64-pc-windows-gnu/release/bundle/nsis/ -name '*setup*.exe' 2>/dev/null | head -1)
        if [ -n \"\$INSTALLER_PATH\" ]; then
            INSTALLER_NAME=\$(basename \"\$INSTALLER_PATH\")
            cp \"\$INSTALLER_PATH\" /app/dist/
            echo \"Copied \$INSTALLER_NAME to dist/\"
        else
            echo 'Installer not found!'
        fi
        
        echo 'Listing contents of target directory:'
        ls -la /tmp/target-windows/x86_64-pc-windows-gnu/release/ || echo 'Target directory not found'
        if [ -d /tmp/target-windows/x86_64-pc-windows-gnu/release/bundle ]; then
            ls -la /tmp/target-windows/x86_64-pc-windows-gnu/release/bundle/
            if [ -d /tmp/target-windows/x86_64-pc-windows-gnu/release/bundle/nsis ]; then
                ls -la /tmp/target-windows/x86_64-pc-windows-gnu/release/bundle/nsis/
            fi
        fi
    "

echo "✅ Windows build completed successfully!"
echo "Build artifacts available in:"
echo "  - dist/*portable*.exe (portable executable)"
echo "  - dist/*setup*.exe (installer)"
echo ""
echo "📋 Windows build artifacts:"
ls -la dist/ | grep -E '\.(exe)$' || echo "No Windows artifacts found in dist/" 