#!/bin/bash
set -e

echo "--- Building LuminaKraft Launcher for macOS ---"

# Create dist directory
mkdir -p dist

echo "Building for macOS Intel (x86_64)..."
# Add Intel target if not installed
rustup target add x86_64-apple-darwin

# Build for Intel Macs
npx tauri build --target x86_64-apple-darwin

echo "Building for macOS Apple Silicon (ARM64)..."
# Add ARM64 target if not installed
rustup target add aarch64-apple-darwin

# Build for Apple Silicon Macs
npx tauri build --target aarch64-apple-darwin

# Copy artifacts to dist directory
echo "Copying macOS artifacts to dist directory..."

# Copy Intel artifacts
INTEL_DMG=$(find "src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/" -name "*_x64.dmg" 2>/dev/null | head -1)
if [ -n "$INTEL_DMG" ]; then
    cp "$INTEL_DMG" "dist/"
    echo "✅ Copied Intel DMG to dist/"
fi

if [ -d "src-tauri/target/x86_64-apple-darwin/release/bundle/macos/LuminaKraft Launcher.app" ]; then
    cp -r "src-tauri/target/x86_64-apple-darwin/release/bundle/macos/LuminaKraft Launcher.app" "dist/LuminaKraft Launcher Intel.app"
    echo "✅ Copied Intel .app to dist/"
fi

# Copy ARM64 artifacts
ARM_DMG=$(find "src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/" -name "*_aarch64.dmg" 2>/dev/null | head -1)
if [ -n "$ARM_DMG" ]; then
    cp "$ARM_DMG" "dist/"
    echo "✅ Copied ARM64 DMG to dist/"
fi

if [ -d "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/LuminaKraft Launcher.app" ]; then
    cp -r "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/LuminaKraft Launcher.app" "dist/LuminaKraft Launcher ARM64.app"
    echo "✅ Copied ARM64 .app to dist/"
fi

echo "✅ macOS builds completed successfully!"
echo "📦 Artifacts available in dist/ directory" 