#!/bin/bash
set -e

echo "--- Building LuminaKraft Launcher for macOS ---"

# Build for macOS Intel (x86_64)
echo "Building for macOS Intel (x86_64)..."
rustup target add x86_64-apple-darwin
npm run tauri build -- --target x86_64-apple-darwin

# Build for macOS ARM (Apple Silicon)
echo "Building for macOS ARM (aarch64)..."
rustup target add aarch64-apple-darwin
npm run tauri build -- --target aarch64-apple-darwin

echo "macOS build completed!" 