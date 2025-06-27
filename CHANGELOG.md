# Changelog

All notable changes to the LuminaKraft Launcher will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## ⚠️ **Alpha Development Status**

**All current versions (0.0.1 through 0.0.6) are alpha releases.** These versions are intended for testing and development purposes. Alpha releases may contain bugs, incomplete features, and are subject to significant changes.

**What this means:**
- 🧪 **Testing Phase**: Features are experimental and may change
- 🐛 **Bug Reports Welcome**: Please report any issues you encounter
- ⚡ **Rapid Development**: Frequent updates with new features and fixes
- 🔄 **Breaking Changes Possible**: Updates may require fresh installations

**Stable Release Timeline:** We plan to release the first stable version (1.0.0) after comprehensive testing and feature completion.

## [0.0.6-alpha.1] - 2025-01-07

### 🔧 **Release System & Update Detection Overhaul**

#### **Enhanced Version Comparison System**
- **Semantic Version Support**: Complete rewrite of version comparison logic with proper semver support
- **Prerelease Detection**: Now correctly handles alpha, beta, and RC version comparisons
- **Alpha Progression**: Properly detects updates between `0.0.6-alpha.1` → `0.0.6-alpha.2`
- **Version Precedence**: Follows semantic versioning rules: `alpha < beta < rc < stable`
- **Mixed Format Support**: Handles both `alpha` and `alpha.1` version formats

#### **GitHub Actions & Release Automation**
- **Clean Release Titles**: Removed "(Pre-release)" suffix from release titles for cleaner appearance
- **Professional Descriptions**: Updated all release descriptions to match modern GitHub Actions format
- **Repository Migration**: Migrated update system from old repository to main `LuminaKraft/LuminaKraftLauncher`
- **Automated Descriptions**: Release descriptions now generated automatically with comprehensive download instructions

#### **Update System Improvements**
- **Repository Update**: App now checks for updates from the correct `LuminaKraft/LuminaKraftLauncher` repository
- **Smart Prerelease Detection**: Update dialog shows specific prerelease types (Alpha/Beta/RC)
- **Enhanced UI**: Update notifications now display appropriate warnings and descriptions for each prerelease type
- **Multilingual Support**: Updated English and Spanish translations for prerelease terminology

### 🎯 **Version Standardization**

#### **Alpha Versioning Consistency**
- **Standardized Format**: All releases now follow consistent `X.Y.Z-alpha.N` format
- **Retroactive Updates**: Updated all existing releases (0.0.1 through 0.0.6) to use `-alpha.1` format
- **Tag Consistency**: All Git tags updated to reflect proper alpha versioning
- **Documentation**: Clear guidelines for alpha, beta, and stable release progression

#### **Release Description Modernization**
- **Unified Format**: All releases now use identical professional description format
- **Platform Instructions**: Comprehensive download and installation instructions for all platforms
- **Clean Presentation**: Removed duplicate titles from descriptions (title is already shown by GitHub)
- **Consistent Branding**: Professional appearance across all releases

### 🔄 **Technical Improvements**

#### **Version Parsing & Comparison**
- **Robust Parsing**: New version parser handles complex prerelease identifiers
- **Numeric Comparison**: Properly compares numeric prerelease versions (`alpha.1` vs `alpha.2`)
- **Type Precedence**: Implements correct precedence ordering for prerelease types
- **Edge Case Handling**: Handles mixed formats, version prefixes, and malformed versions

#### **Update Service Enhancements**
- **Comprehensive Testing**: Extensive test suite covering all version comparison scenarios
- **Performance Optimization**: Efficient parsing and comparison algorithms
- **Error Handling**: Graceful handling of malformed versions and network issues
- **Backward Compatibility**: Maintains compatibility with existing version formats

### 📋 **Breaking Changes**
- **None**: All changes are backward compatible with existing installations

### 🔧 **Migration Notes**
- **Automatic**: Version comparison improvements activate automatically
- **No User Action**: Existing installations will benefit from improved update detection
- **Settings Preserved**: All user settings and authentication maintained

## [0.0.6] - 2025-06-23

### 🚀 Major Features Added

#### **Enhanced Progress Tracking & User Experience**
- **Real-time Progress Bars**: Detailed progress indicators for all modpack operations
- **ETA Calculation**: Smart estimated time remaining with exponential smoothing (10-entry window)
- **Dual Message System**: Separate general and detail messages for better context
- **Progress Text Stability**: Fixed flickering issues with persistent detail messages
- **Installation Location Display**: Added clickable folder icon to open instance directory

#### **Smart Mod Management**
- **Override Detection**: Automatically detects mods in `overrides/` to prevent false positives in failed mods dialog
- **Failed Mods Dialog**: New dialog showing mods with empty URLs, with direct CurseForge download links
- **Hash Verification**: Enhanced file integrity checking before showing failed mods
- **Intelligent URL Filtering**: Only shows truly missing mods, not those available in overrides

#### **CurseForge API Optimization**
- **Batch API Requests**: Optimized from individual requests to batches of 50 mods (massive performance improvement)
- **Rate Limiting Protection**: Smart delays between batches to prevent API throttling
- **Enhanced Error Handling**: Graceful handling of 404s and API errors with detailed logging
- **Debug Information**: Comprehensive mod status reporting (File Status, Project/File IDs, availability)

#### **Instance Management**
- **Delete Modpack Button**: New red delete button with confirmation dialog for instance removal
- **Folder Access**: Quick access to modpack installation folder via folder icon
- **Status Validation**: Improved modpack status detection and error handling

#### **Developer Tools**
- **Modpack URL Checker Script**: New bash script (`check-modpack-urls.sh`) for workers to validate modpacks before upload
- **Independent Tool**: No dependencies required, uses system tools (unzip, curl, jq)
- **Detailed Analysis**: Identifies mods with empty URLs and provides direct download links
- **Worker Documentation**: Complete README with usage examples and troubleshooting

### 🎨 Enhanced User Interface

#### **Progress System Improvements**
- **Visual Progress Bars**: Real-time progress visualization for all operations
- **Status Indicators**: Clear status messages during installation/update/repair
- **ETA Display**: Shows estimated completion time for operations (10-95% progress range)
- **Message Persistence**: Detail messages no longer disappear during progress updates

#### **Failed Mods Dialog**
- **Modern Design**: Consistent with existing dialog styling
- **Action Buttons**: Direct links to CurseForge mod pages
- **Mod Information**: Display of mod names, file names, Project/File IDs
- **Loading States**: Proper loading indicators while fetching mod details

#### **Instance Actions**
- **Delete Confirmation**: Safe deletion with confirmation dialog
- **Location Access**: One-click folder opening for easy mod management
- **Visual Feedback**: Clear success/error states for all operations

### 🔧 Technical Enhancements

#### **Backend Optimizations (Rust)**
- **Processing Order**: Changed to process overrides BEFORE downloading mods
- **Batch Processing**: Implemented efficient 50-mod batches for CurseForge API
- **Memory Management**: Optimized API response handling and caching
- **Error Tolerance**: Enhanced resilience to network issues and API errors

#### **Frontend Optimizations (TypeScript/React)**
- **Progress State Management**: Improved progress tracking with `lastEtaSeconds` property
- **API Integration**: New service methods for failed mod tracking
- **Component Optimization**: Reduced re-renders and improved performance
- **Type Safety**: Enhanced TypeScript interfaces for better development experience

#### **Build Process**
- **Script Organization**: Added developer scripts with proper documentation
- **Cross-platform Compatibility**: Bash script works on Linux, macOS, and Windows (WSL/Git Bash)

### 🐛 Bug Fixes

#### **Progress Display Issues**
- **Fixed Flickering**: Progress text no longer disappears during "Progress:" updates
- **Message Caching**: Implemented proper message state management
- **ETA Stability**: Smoothed ETA calculations to prevent erratic jumps

#### **Mod Installation Fixes**
- **Override Recognition**: Fixed false positives where overrides mods appeared as failed
- **Hash Verification**: Improved file integrity checking accuracy
- **Empty URL Handling**: Better detection and categorization of unavailable mods

#### **API Reliability**
- **Rate Limit Handling**: Proper delays and retry logic for API calls
- **404 Tolerance**: Treats 404 responses as valid (missing files) rather than errors
- **Batch Error Recovery**: Continues processing even if individual batches fail

### 📊 Performance Improvements

#### **CurseForge Integration**
- **Reduced API Calls**: From hundreds of individual requests to a few batch requests
- **Faster Processing**: Batch requests reduce total processing time by 70-80%
- **Better Caching**: Improved response caching and state management

#### **Progress Calculation**
- **Optimized ETA**: Uses larger windows (10 entries) for stable calculations
- **Reduced Updates**: Less frequent progress updates to reduce UI overhead
- **Smart Filtering**: Only shows ETA for reasonable timeframes (< 30 minutes)

### 🌍 Internationalization

#### **Extended Translations**
- **Progress Messages**: All new progress states translated to English and Spanish
- **Error Handling**: Localized error messages for failed mod scenarios
- **UI Components**: All new dialog and button text properly internationalized

### 🔒 Security & Reliability

#### **Input Validation**
- **File Path Security**: Enhanced validation for modpack file paths
- **API Security**: Proper escaping and validation of CurseForge responses
- **Error Boundaries**: Better error isolation to prevent crashes

#### **Data Integrity**
- **Hash Verification**: Enhanced file integrity checking with multiple hash algorithms
- **Backup Handling**: Better handling of corrupted downloads and retries
- **State Consistency**: Improved synchronization between backend and frontend states

### 🛠️ Developer Experience

#### **New Tools**
- **Modpack Validator**: Complete bash script for pre-upload validation
- **Debug Information**: Enhanced logging for mod processing and API interactions
- **Error Reporting**: Detailed error messages with context for easier debugging

#### **Documentation**
- **Script Documentation**: Complete README for the modpack checker tool
- **Usage Examples**: Real-world examples and troubleshooting guides
- **Technical Specs**: Detailed API integration and batch processing documentation

### 📋 Breaking Changes
- **None**: All changes are backward compatible with existing modpacks and user data

### 🎯 Migration Notes
- **Automatic**: No user action required, all improvements activate automatically
- **Settings Preserved**: All existing user settings and authentication maintained
- **Progressive Enhancement**: New features activate as needed without disrupting existing functionality

## [0.0.5] - 2025-05-22

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
- **Cross-Platform Building**: When running on macOS, automatically builds for all platforms with proper toolchains

#### **Cross-Compilation Requirements**
- **Docker-based Building**: Usa contenedores Docker para compilación cruzada
- **Windows Support**: Compila para Windows desde macOS usando contenedores
- **Linux Support**: Compila para Linux desde macOS usando contenedores
- **No External Dependencies**: No requiere toolchains adicionales, solo Docker
- **Intelligent Detection**: Detecta automáticamente Docker y crea las imágenes necesarias

### 🔧 Optimized and Fixed

- **Path optimization**: Simplified internal paths for macOS, Windows and Linux
- **Improved release process**: 
  - Standardized build scripts for all platforms
  - Added support for both Intel and Apple Silicon in a single release
  - Fixed file upload issues - now replaces files instead of adding timestamps
  - Reduced release script complexity for easier maintenance
- **Docker builds**: Docker images are now created automatically if they don't exist
- **Build script organization**: Modularized build process with dedicated scripts for each platform

### 🔧 Build System Improvements

#### **Docker Environment Updates**
- **Node.js 20 Upgrade**: Updated Windows Docker builder from Node.js 18 to 20 for Octokit compatibility
- **Linux Build Fix**: Simplified Linux build process with DEB package support
- **Environment Consistency**: Standardized Node.js versions across all build environments

#### **Release Process Enhancements**
- **Git Integration**: Added automatic Git commit and tag creation during release process
- **Push Option**: New `--push` flag to automatically push changes to remote repository
- **Streamlined Scripts**: Updated npm scripts with consistent naming for push operations
- **Release Documentation**: Improved release command documentation

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
- **Tauri Built-in Updater** - Integrated `