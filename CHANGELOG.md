# Changelog

All notable changes to the LuminaKraft Launcher will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.5] - 2025-06-17

### 🔄 Internal Naming Optimization

#### **Internal Nomenclature Change**
- **Simplified Technical Name**: Changed from "LuminaKraftLauncher" to "LKLauncher" for:
  - Internal identifiers
  - Process names
  - Task names
  - File paths
  - API UserAgent

#### **Data Directory Optimization**
- **Optimized Data Folders**:
  - Windows: `%AppData%/LKLauncher` (previously "LuminaKraftLauncher")
  - macOS: `~/Library/Application Support/LKLauncher` (previously "LuminaKraftLauncher")
  - Linux: `~/.local/share/LKLauncher` (previously "LuminaKraftLauncher")

#### **Compatibility Improvements**
- **Shorter Paths**: Reduces issues with path length limitations on Windows
- **Special Character Compatibility**: Improves compatibility with UTF-8 characters in paths

#### **Brand Consistency**
- **User Interface Intact**: "LuminaKraft Launcher" is preserved as the visible name
- **Brand Assets Preserved**: Logos and branding remain unchanged
- **Shortcuts**: Desktop shortcuts still display "LuminaKraft Launcher"

### 🚀 Release System Enhancements

#### **Multiple macOS Architectures**
- **Automatic Dual Building**: Generates builds for both Apple Silicon and Intel
- **Standardized Naming Format**: File names following the format:
  - `LuminaKraft.Launcher_[version]_aarch64.dmg` (Apple Silicon)
  - `LuminaKraft.Launcher_[version]_x64.dmg` (Intel)
  - `LuminaKraft.Launcher_[version]_aarch64.app.zip` (Portable app for Apple Silicon)
  - `LuminaKraft.Launcher_[version]_x64.app.zip` (Portable app for Intel)

#### **Cumulative Releases**
- **Incremental Releases**: New builds are added to existing releases
- **Multiple Platforms**: A single release can contain builds for Windows, Linux, and macOS
- **Build Status**: Clear tracking of which platforms are available
- **Cross-Platform Building**: When running on macOS, automatically builds for all platforms (Windows, Linux, macOS)

## [0.0.4] - 2025-06-15

### 🌎 CurseForge API Integration

#### **CurseForge API Backend Implementation**
- **API Proxy Service**: Added proxy service to interact with CurseForge API securely
- **Secure Key Handling**: Implemented secure API key handling with proper escaping
- **Complete Endpoint Coverage**:
  - Mod info retrieval
  - File download URL access
  - Mod search capability
  - Category listings
  - Batch mod/file operations

#### **Technical Implementation**
- **Environment Variable Security**: CURSEFORGE_API_KEY stored as environment variable
- **Rate Limiting**: Basic rate limiting to prevent API abuse
- **Error Handling**: Comprehensive error handling and logging
- **Docker Integration**: Secure environment variable handling in Docker
- **CI/CD Updates**: GitHub Actions updated for secure API key deployment

### 🐛 Bug Fixes
- **API Key Handling**: Fixed escaping of dollar signs in API key with proper normalization
- **Debug Cleanup**: Removed debug logging for production environment
- **Error Messages**: Standardized error message format across all endpoints

### 🚀 Performance Improvements
- **Reduced Log Volume**: Removed verbose debug logging for better performance
- **Error Reporting**: Streamlined error reporting for faster response times

## [0.0.3] - 2025-06-14

### 🐛 Bug Fixes
- **CPU Compatibility Fix**: Resolved a startup crash (`Exception code: 0xc000001d`) on older PCs by removing CPU-specific optimizations (`target-cpu=native`). The launcher is now compatible with a wider range of processors.

## [0.0.2] - 2025-06-13

### 🔐 Microsoft Authentication System

#### **Complete Microsoft Authentication Integration**
- **Modal Window Authentication** - Seamless modal authentication like Modrinth app
- **Dual Authentication Modes** - Switch between offline and Microsoft authentication
- **Automatic Token Management** - Token validation, refresh, and expiration handling
- **Premium Server Access** - Full support for premium Minecraft servers
- **Bilingual Support** - Complete Spanish and English translations

#### **Authentication Features**
- **🪟 Modal Authentication**: One-click Microsoft sign-in with automatic window closure
- **🔄 Alternative Method**: URL paste fallback for compatibility issues
- **🔑 Token Lifecycle**: Automatic token refresh and validation
- **💾 Persistent Sessions**: Secure storage of authentication state
- **🌐 Multi-language**: Full internationalization support

#### **Technical Implementation**
- **Backend Integration**:
  - Complete Lyceris Microsoft authentication integration
  - Tauri commands: `authenticate_microsoft`, `refresh_microsoft_token`, `validate_microsoft_token`
  - Modal window with URL polling for redirect detection
  - Optimized 100ms polling for responsive auth detection

- **Frontend Architecture**:
  - `AuthService` singleton for centralized authentication management
  - `MicrosoftAuth` React component with modern UI/UX
  - Seamless integration with existing settings system
  - Automatic fallback from modal to URL method

#### **User Experience**
- **Simplified Authentication**: Click "Sign in with Microsoft" → Complete login → Automatic closure
- **Visual Status Indicators**: Clear authentication state with refresh/sign-out options
- **Error Handling**: Intelligent error messages with automatic method switching
- **Performance Optimized**: Removed debug logs, efficient URL monitoring

#### **Data Structures**
```rust
pub struct MicrosoftAccount {
    pub xuid: String,
    pub exp: u64,
    pub uuid: String,
    pub username: String,
    pub access_token: String,
    pub refresh_token: String,
    pub client_id: String,
}

pub struct UserSettings {
    // ... existing fields
    pub auth_method: String, // "offline" or "microsoft"
    pub microsoft_account: Option<MicrosoftAccount>,
}
```

#### **Translations Added**
- **English**: Complete auth section with 20+ translated strings
- **Spanish**: Full Spanish translations for all authentication UI
- **Dynamic Language**: Real-time language switching support

### 🚀 Performance Improvements
- **Optimized URL Polling**: Efficient 100ms intervals with proper cleanup
- **Removed Debug Logs**: Clean production code without performance overhead
- **Smart Error Handling**: Reduced redundant operations and improved response times

### 🎨 Enhanced User Interface
- **Modern Authentication UI**: Clean, intuitive Microsoft authentication interface
- **Responsive Design**: Proper window sizing and resizing support
- **Visual Feedback**: Loading states, progress indicators, and status messages
- **Accessibility**: Proper ARIA labels and keyboard navigation support

### 🔧 Technical Enhancements
- **Rust Backend**: Complete Microsoft OAuth2 flow implementation
- **TypeScript Frontend**: Type-safe authentication service and components
- **React Integration**: Seamless integration with existing React architecture
- **State Management**: Proper authentication state persistence and synchronization

### 🐛 Bug Fixes
- **Modal Window Issues**: Fixed modal authentication with proper URL detection
- **Event Handling**: Resolved Tauri 2.x event system compatibility
- **Token Management**: Fixed token refresh and validation edge cases
- **Window Management**: Proper modal window lifecycle management

### 📦 Dependencies
- **No New Dependencies**: Leveraged existing Lyceris integration
- **Optimized Imports**: Cleaned up unused imports and improved compilation

## [0.0.1] - 2025-06-13

### 🚀 Major Features Added

#### **Fully Automatic Updates**
- **Zero Manual Installation** - Users can now update with one click, no manual downloads required
- **Tauri Built-in Updater** - Integrated `@tauri-apps/plugin-updater` for seamless updates
- **Automatic App Restart** - App restarts automatically after successful update installation
- **Intelligent Fallback** - Falls back to manual download if automatic installation fails
- **Enhanced Update Dialog** - Updated UI to reflect automatic installation capabilities

#### **Lyceris v1.1.3 Minecraft Launcher Integration**
- **Complete rewrite** of Minecraft launching system using Lyceris Rust library
- **Automatic Java Management** - Lyceris downloads and manages Java versions automatically
- **Multi-threaded Downloads** - 3-5x faster download speeds with parallel processing
- **Enhanced Mod Loader Support**:
  - Forge (1.12.2+) ✅
  - NeoForge ✅
  - Fabric ✅
  - Quilt ✅
- **Automatic File Verification** - Built-in corruption detection and repair
- **Real-time Progress Tracking** - Live download and installation progress

### 🔧 Technical Improvements

#### **Update System Architecture**
- **Backend Integration**:
  - Added `tauri-plugin-updater = "2"` dependency
  - Added `tauri-plugin-process = "2"` for app restart functionality
  - Configured updater endpoints in `tauri.conf.json`
  - Integrated updater plugin in `main.rs`

- **Frontend Enhancements**:
  - Rewritten `UpdateService` to use Tauri's built-in updater
  - Added `downloadAndInstallUpdate()` method for automatic installation
  - Enhanced error handling with fallback to manual download
  - Updated `UpdateDialog` component for automatic installation UI

#### **Development Tools**
- **Enhanced Port Cleanup**:
  - `kill-port.js` script with ES module syntax
  - Cross-platform process detection and termination
  - Improved logging and error handling
  - 2-second wait time for proper port release

#### **Dependencies**
- **Added Lyceris v1.1.3** with all 15 required dependencies:
  - `base64 v0.22.1`
  - `event-emitter-rs v0.1.4`
  - `futures v0.3.31`
  - `oauth2 v4.4.2`
  - `rayon v1.10.0`
  - `regex v1.11.1`
  - `sha1 v0.10.6`
  - `thiserror v2.0.9`
- **Updated Core Dependencies**:
  - `reqwest v0.12.9` (upgraded from v0.11)
  - `uuid v1.11.0` with enhanced features
  - `zip v2.2.1` (upgraded from v0.6)

### 🎨 User Experience

#### **Update Process Transformation**
- **Before**: "The update will be downloaded and you'll need to install it manually."
- **After**: "The update will be downloaded and installed automatically. The app will restart when complete."

#### **UI/UX Improvements**
- **Button Text**: Changed from "Download" to "Install Update"
- **Progress Indicators**: Shows "Installing..." instead of "Opening..."
- **Success Messages**: "Update installed successfully! App will restart..."
- **Error Handling**: Clear error messages with fallback options

### 🔒 Security & Reliability

#### **Security Features**
- **Tauri Security**: Uses Tauri's built-in updater with signature verification support
- **User Consent**: Requires user approval before installation
- **HTTPS Only**: All communications are encrypted
- **Signed Updates**: Support for cryptographically signed updates

#### **Reliability Features**
- **Automatic Fallback**: If Tauri updater fails, falls back to manual download
- **Error Recovery**: Clear error messages and recovery options
- **Non-Blocking**: Update failures don't crash the app
- **Smart Caching**: Avoids excessive update checks

### 🐛 Bug Fixes

#### **Critical Memory Issue Fixed**
- **Problem**: JVM error "Initial heap size set to a larger value than the maximum heap size"
- **Root Cause**: Conflicting memory settings between launcher and Lyceris
- **Solution**: Replaced `JAVA_TOOL_OPTIONS` with Lyceris' built-in `.memory()` configuration
- **Result**: Clean 4GB RAM allocation without conflicts

#### **Development Issues Fixed**
- **Port Conflict**: Fixed "Port 1420 is already in use" error in development
- **ES Module Compatibility**: Updated scripts to work with modern JavaScript modules
- **Process Cleanup**: Improved process termination for cleaner development experience
- **Runtime Improvements**:
  - Fixed Tauri context detection with `isTauriContext()` function
  - Fixed safe command execution with `safeInvoke()` wrapper
  - Fixed TypeScript compatibility issues with modpack status types
  - Added development mode warning banner for browser testing

### 📦 Dependencies Added

#### **Frontend**
- `@tauri-apps/plugin-updater` - Automatic update checking and installation
- `@tauri-apps/plugin-process` - App restart functionality

#### **Backend**
- `tauri-plugin-updater = "2"` - Tauri updater plugin

### 🔄 Breaking Changes
- **None** - Full backward compatibility maintained
- **API Enhancement**: Added new automatic update methods while preserving existing functionality

### 📚 Documentation

#### **New Documentation**
- **LAUNCHER_API_UPDATER_REQUIREMENTS.md**: Comprehensive backend API requirements
- **AUTOMATIC_UPDATES_SUMMARY.md**: Complete implementation summary
- **UPDATE_FEATURE_SUMMARY.md**: Enhanced with automatic installation details
- **LYCERIS_INTEGRATION_SUMMARY.md**: Technical implementation details
- **Migration Guide**: Step-by-step upgrade instructions

### 🎯 Future Enhancements
- ✅ **Auto-Install**: ~~Implement automatic update installation~~ **COMPLETED**
- **Update Notifications**: System tray notifications
- **Rollback Support**: Ability to revert updates
- **Beta Channel**: Support for pre-release versions
- **Update History**: Show changelog and update history