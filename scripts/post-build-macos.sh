#!/bin/bash

# Post-build script for macOS to inject URL scheme into app bundle
APP_PATH="src-tauri/target/release/bundle/macos/LuminaKraft Launcher.app"
PLIST_PATH="$APP_PATH/Contents/Info.plist"

if [ -f "$PLIST_PATH" ]; then
    echo "Updating Info.plist with URL scheme support..."

    # Add CFBundleURLTypes if it doesn't exist
    /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "$PLIST_PATH" 2>/dev/null

    # Add first entry
    /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" "$PLIST_PATH" 2>/dev/null
    /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleTypeRole string Editor" "$PLIST_PATH" 2>/dev/null
    /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLName string com.luminakraft.launcher" "$PLIST_PATH" 2>/dev/null
    /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST_PATH" 2>/dev/null
    /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string luminakraft" "$PLIST_PATH" 2>/dev/null

    echo "Info.plist updated successfully"
else
    echo "Error: Info.plist not found at $PLIST_PATH"
    exit 1
fi
