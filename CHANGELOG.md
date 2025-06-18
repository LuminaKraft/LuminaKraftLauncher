# Changelog

All notable changes to the LuminaKraft Launcher will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.5] - 2024-05-22

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