#!/bin/bash
set -e

echo "🧹 Cleaning numbered duplicate files and directories..."

# Function to safely remove numbered duplicates
clean_duplicates() {
    local base_path="$1"
    local description="$2"
    
    if [ -d "$base_path" ]; then
        echo "🔍 Cleaning $description in $base_path..."
        
        # Find and remove numbered duplicates (files and directories)
        find "$base_path" -name "* 2" -exec rm -rf {} + 2>/dev/null || true
        find "$base_path" -name "* 3" -exec rm -rf {} + 2>/dev/null || true
        find "$base_path" -name "* 4" -exec rm -rf {} + 2>/dev/null || true
        find "$base_path" -name "* 5" -exec rm -rf {} + 2>/dev/null || true
        
        # Count remaining duplicates
        local remaining=$(find "$base_path" -name "* [0-9]" 2>/dev/null | wc -l)
        if [ "$remaining" -eq 0 ]; then
            echo "  ✅ No duplicates found in $description"
        else
            echo "  ⚠️ $remaining duplicates still remain in $description"
        fi
    else
        echo "  ⚠️ $base_path not found, skipping"
    fi
}

# Clean node_modules duplicates
clean_duplicates "node_modules" "npm modules"

# Clean Windows installer duplicates
clean_duplicates "src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis" "Windows installers"
clean_duplicates "src-tauri/target/x86_64-pc-windows-msvc/bundle/nsis" "Windows MSVC installers"

# Clean macOS app duplicates
clean_duplicates "src-tauri/target/x86_64-apple-darwin/release/bundle/macos" "macOS Intel apps"
clean_duplicates "src-tauri/target/aarch64-apple-darwin/release/bundle/macos" "macOS ARM apps"

# Clean any other potential duplicates in target directories
clean_duplicates "src-tauri/target" "build artifacts"

echo ""
echo "✅ Duplicate cleanup completed!"
echo "💡 This script can be run anytime to clean up numbered duplicates" 