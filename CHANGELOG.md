# Changelog

All notable changes to the LuminaKraft Launcher will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.8-alpha.1] - 2025-06-29

### 🎨 **UI/UX Improvements**

#### **Enhanced Sidebar Navigation**
- **Optimized Layout**: Reduced expanded sidebar width from 256px to 224px for better space utilization
- **Consistent Icon Positioning**: Fixed icon jumping during sidebar transitions with consistent left padding
- **Smoother Animations**: 
  - Faster footer transitions (150ms) for snappier collapse/expand
  - Optimized opacity transitions (200ms) for header and navigation items
  - Immediate footer text hiding when collapsing
- **Professional Polish**: Improved overall transition smoothness and visual consistency

#### **Enhanced Mod Download Status**
- **Status Indicators**: Added color-coded status indicators for mod downloads:
  - Green bullet for completed or existing mods
  - Red bullet for errors or unavailable mods
  - Blue pulsing bullet for active downloads
- **Cleaner Interface**: Removed emojis from status messages for a more professional look
- **Clear Status Messages**: Improved status text clarity:
  - "Descargando: {nombre_mod}" for active downloads
  - "Ya existe: {nombre_mod}" for existing mods
  - "Error: {nombre_mod}" for failed downloads
  - "No disponible: {nombre_mod}" for unavailable mods

#### **Progress System Refinements**
- **Progress Distribution**: Adjusted progress ranges for smoother feedback:
  - CurseForge processing: 70%-100%
  - Mod downloads: Proportional distribution within the range
  - Final steps properly reaching 100%
- **Message Handling**: Fixed "preparing_mod_downloads" translation display

### 🐛 **Bug Fixes**
- Fixed progress bar getting stuck at 90% during mod downloads
- Resolved missing translations for mod download status messages
- Fixed inconsistent status indicator colors during mod installation

### 📋 **Breaking Changes**
- None - all changes maintain backward compatibility

### 🔧 **Migration Notes**
- Automatic improvements upon update
- All user settings and installed modpacks preserved

## [0.0.7-alpha.2] - 2025-06-28

### 🎨 **UI/UX Improvements**

#### **Enhanced Mod Download Status**
- **Status Indicators**: Added color-coded status indicators for mod downloads:
  - Green bullet for completed or existing mods
  - Red bullet for errors or unavailable mods
  - Blue pulsing bullet for active downloads
- **Cleaner Interface**: Removed emojis from status messages for a more professional look
- **Clear Status Messages**: Improved status text clarity:
  - "Descargando: {nombre_mod}" for active downloads
  - "Ya existe: {nombre_mod}" for existing mods
  - "Error: {nombre_mod}" for failed downloads
  - "No disponible: {nombre_mod}" for unavailable mods

#### **Progress System Refinements**
- **Progress Distribution**: Adjusted progress ranges for smoother feedback:
  - CurseForge processing: 70%-100%
  - Mod downloads: Proportional distribution within the range
  - Final steps properly reaching 100%
- **Message Handling**: Fixed "preparing_mod_downloads" translation display

### 🐛 **Bug Fixes**
- Fixed progress bar getting stuck at 90% during mod downloads
- Resolved missing translations for mod download status messages
- Fixed inconsistent status indicator colors during mod installation

### 📋 **Breaking Changes**
- None - all changes maintain backward compatibility

### 🔧 **Migration Notes**
- Automatic improvements upon update
- All user settings and installed modpacks preserved

## [0.0.7-alpha.1] - 2025-06-28

### 🔄 **Meta Storage System Migration** 

#### **Professional Terminology Update**
- **Renamed "Shared Storage" to "Meta"**: Aligned with industry standards (Modrinth, CurseForge)
- **Directory Structure**: Reorganized to use `meta/`, `caches/`, `profiles/` for better clarity
- **Code Refactoring**: Updated all references from `shared` to `meta` across the codebase
- **Documentation**: Removed outdated shared storage docs, updated all references

#### **UI/UX Improvements**
- **Professional Interface**: Removed emojis in favor of proper icons
- **Storage Info Display**: Added Minecraft versions and Java installations count
- **Toast Notifications**: Replaced alerts with modern toast notifications
- **Loading States**: Enhanced loading indicators and error states

#### **Technical Enhancements**
- **Code Organization**: Consolidated shared/meta functionality into unified modules
- **Error Handling**: Improved error messages and recovery procedures
- **Type Safety**: Enhanced TypeScript interfaces for better development
- **Performance**: Optimized storage info retrieval and cleanup operations

### 🔧 **Critical Bug Fixes & Code Refactoring**

#### **ZIP Extraction Error Resolution**
- **Fixed "Unknown error" during modpack installation**: Resolved "No such file or directory (os error 2)" errors preventing installations
- **Enhanced validation**: Added comprehensive file existence, size, and readability checks before ZIP extraction
- **Improved directory creation**: Added robust error handling and write permission testing
- **Better error messages**: Enhanced error context with specific file paths and failure reasons in English/Spanish

#### **Major Code Refactoring**
- **Removed Lyceris ZIP dependencies**: Simplified to use only standard Rust `zip` library
- **Eliminated code duplication**: Removed duplicate `extract_zip` and `download_file` functions
- **Created modular structure**: Reorganized 1,578-line monolith into clean, maintainable modules:
  ```
  src/modpack/curseforge/  # CurseForge-specific logic
  src/utils/               # General utilities (downloader, cleanup)
  ```
- **Proper separation of concerns**: General utilities vs domain-specific logic

#### **Enhanced Error Handling & Translation**
- **Sequential validation flow**: Download → Validate → Create Directories → Test Permissions → Extract → Verify
- **New translation keys**: Added comprehensive error messages for ZIP extraction scenarios
- **Download improvements**: Added 5-minute timeout, better retry logic, and file validation
- **Safe cleanup**: Added proper temporary file and directory cleanup functions

### 🐛 **Bug Fixes**
- Fixed ZIP extraction crashes and file system errors
- Resolved directory creation issues and permission problems
- Eliminated import conflicts and cleaned up unused code
- Enhanced download validation and corrupted file detection

### 📊 **Performance & Quality Improvements**
- **Faster compilation**: Reduced dependencies and cleaner build process
- **Better maintainability**: Each module 200-300 lines with single responsibility
- **Reduced warnings**: From 8 compiler warnings down to 2 minor ones
- **Enhanced developer experience**: Better code organization and debugging

### 📋 **Breaking Changes**
- None - all changes maintain backward compatibility

### 🔧 **Migration Notes**
- Automatic improvements upon update
- All user settings and installed modpacks preserved

## [0.0.6-alpha.2] - 2025-06-27

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

### 📝 **Release Description & Documentation Improvements**

#### **Release Description Formatting**
- **Fixed Line Breaks**: Corrected release descriptions that were appearing as single lines
- **Improved Readability**: Proper formatting with line breaks and spacing
- **Enhanced Structure**: Better organization of download instructions and sections

#### **Community Integration**
- **Discord Integration**: Added official Discord community link to all release descriptions
- **Community Support**: Direct access to community support and discussions
- **Feedback Channels**: Easier access for users to provide feedback and report issues

#### **Documentation Updates**
- **Version Consistency**: Updated all changelog entries to use proper `-alpha.1` format
- **Alpha Status Clarification**: Enhanced documentation about alpha development status
- **Release Process**: Improved release description generation and formatting

### 📋 **Breaking Changes**
- **None**: All changes are backward compatible with existing installations

### 🔧 **Migration Notes**
- **Automatic**: All improvements activate automatically
- **No User Action**: Users will see improved release descriptions in future updates
- **Settings Preserved**: All user settings and authentication maintained

## [0.0.6-alpha.1] - 2025-06-23

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

## [0.0.5-alpha.1] - 2025-05-22

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

## [0.0.4-alpha.1] - 2025-06-15

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

## [0.0.3-alpha.1] - 2025-06-14

### 🐛 Bug Fixes
- **CPU Compatibility Fix**: Resolved a startup crash (`Exception code: 0xc000001d`) on older PCs by removing CPU-specific optimizations (`target-cpu=native`). The launcher is now compatible with a wider range of processors.

## [0.0.2-alpha.1] - 2025-06-13

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
  - Tauri commands: `