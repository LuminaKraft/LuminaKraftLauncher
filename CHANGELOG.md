# Changelog

All notable changes to the LuminaKraft Launcher will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.9-alpha.3] - 2025-07-05

### ⚠️ **Breaking Changes**
- **Removed Modpack Changelog Feature**
  - Deleted `ModpackChangelog` component and its usage in UI.
  - Dropped `changelog` & `jvmargs` field from `Modpack` interfaces/structs (TypeScript & Rust).
  - Service no longer sends/receives changelog and jvmargs data to the backend.

### ♻️ **Refactors & Architecture**
- **Shared Meta Storage — Symlinkless**  
  - Globally replaced per-instance symlink/junction approach with Lyceris’ built-in ability to read libraries, assets, versions and runtimes directly from the shared `meta/` folder.  
  - Removed all symlink/junction creation and fallback copy logic on every platform.  
  - Instances are now lightweight folders containing only `mods/`, `config/`, saves, etc.; no privilege elevation required on Windows.
- **MetaDirectories Simplification**  
  - Deleted unused fields (`base_dir`, `assets_index_dir`, `objects_dir`, `natives_dir`) and associated dead code.  
  - Added `caches_dir` and cleaned up initialisation logic; compiler warnings eliminated.
- **Java / JVM Cleanup**
  - Eliminated custom JVM detection & override logic; Lyceris now fully manages Java handling.
  - Deleted `JavaVersionCard` component and related service helpers (`validateJavaPath`, `installJava`, etc.).
  - Backend `generate_custom_jvm_args` now returns an empty vector; removed `LYCERIS_JAVA_PATH` support.
- **Modpack Details Modularization**
  - Introduced `LogsSection` (auto-scroll) and `ScreenshotsSection` under `Modpacks/Details/Sections` for a cleaner layout.
  - Added `variant` prop to screenshot gallery and renamed component to `ModpackScreenshotGallery`.
  - Reorganized file structure accordingly and updated imports project-wide.

### 🎨 **User Interface Improvements**
- `ModpackCard` and `ModpackDetailsRefactored` now stay in sync with live download/launch state.
- Tabbed interface gains screenshot counter badge and smoother transitions.
- Improved animation handling via `AnimationContext` utilities.

### 🚦 **Runtime & Instance Control**
* **Stop Button**
  * Added fully-functional **Detener** button to both `ModpackCard` and `ModpackDetailsRefactored`.
  * Frontend now registers `minecraft-started-*`, `minecraft-stopping-*` and `minecraft-exited-*` events **before** invoking backend commands, guaranteeing that early events are never missed.
  * State machine extended with `running` and `stopping` statuses; UI now switches instantly and stays in sync.
* **Reliable Process Termination**
  * Fixed parameter mismatch (`instanceId` vs `modpackId`) when calling `stop_instance` – the backend now receives the correct identifier and successfully kills the Java process.
  * Backend emits `minecraft-stopping-*` → `minecraft-exited-*` sequence so the launcher can update UI without polling.
* **Logs Enhancements**
  * Logs are **cleared automatically** each time a new game session starts, providing a clean terminal view.
  * Real-time colour-coding: `ERROR` lines in red, `WARN`/`Warning` in yellow, informational lines in green.
* **Launch Progress UX**
  * Added faster fake progress bar for the `launching` phase (0→100 % in ~2.5 s) when backend progress is absent.
  * Progress bar and button texts are fully localised (`Iniciando…`, `Deteniendo…`).

### 🧹 **Cleanup & Maintenance**
- Removed leftover debug prints & unused imports after Java refactor.
- Ensured global Lyceris runtime directory is created under `.runtime_dir(meta_dirs.java_dir)`.
- Resolved ESLint/TypeScript warnings introduced during refactors.

### 🐛 **Bug Fixes**
- **Instance Installation (All Platforms)**  
  - Installation could fail with an "Unknown error" when the launcher attempted to create directory symlinks/junctions without sufficient privileges (most visible on Windows).  
  - Symlink logic has been removed entirely; the launcher now relies on Lyceris to read resources directly from the shared `meta/` storage.  
  - This eliminates the error and speeds-up installs on every operating system.

---

## [0.0.9-alpha.2] - 2025-07-03

### ✨ **New Features**
- **Screenshot Card Backgrounds**
  - Modpack cards now display a subtle, darkened version of the first screenshot behind the logo
  - Uses a 35 %-opacity image with a low-cost brightness filter instead of heavy blur for better performance
  - Removed the gradient helper entirely, trimming unused code and eliminating GPU-heavy effects

- **Enhanced "Coming Soon" Modpack Styling**
  - "Próximamente" status badge changed from yellow to blue for better visual hierarchy
  - Coming soon modpacks now feature special blue glowing borders and shadows
  - Added subtle pulse animation and hover effects for coming soon items
  - Status badges now properly positioned above modpack logos with improved z-index

### 🎨 **User Interface Improvements**
- **Optimized Tooltip System**
  - Removed tooltips from player avatar to reduce visual clutter
  - Sidebar button tooltips now only appear when sidebar is collapsed
  - Improved overall navigation experience with cleaner hover states

- **Faster Refresh Animation**
  - Refresh button animation speed increased from 600ms to 300ms
  - Icon transition optimized from 300ms to 150ms for snappier response
  - Animation now properly returns to original position without visual jumps

- **Enhanced Animation System**
  - Improved AnimationContext with better conditional animation handling
  - Added staggered animations for modpack cards with index-based delays
  - Better performance when animations are disabled in settings
  - All animations now respect user preferences for low-end devices

### 🐛 **Bug Fixes**
- **Code Quality Improvements**
  - Fixed all ESLint warnings and unused imports
  - Removed unused React state variables and imports
  - Improved TypeScript strict mode compliance
  - Better parameter naming conventions for unused function parameters

- **Status Badge Positioning**
  - Status badges now properly appear above modpack logos
  - Improved z-index stacking for better visibility
  - Fixed badge positioning consistency across all modpack cards

### 🔧 **Technical Improvements**
- **ModpackCard Enhancements**
  - Added index prop for better animation timing
  - Replaced gradient generation with lightweight screenshot overlays and removed the gradient utility helper
  - Better error handling for missing modpack images
  - Optimized component rendering performance

- **Animation Performance**
  - Reduced animation complexity for better performance on low-end devices
  - Improved animation timing functions for smoother transitions
  - Better memory management for animation states

### 🧰 **Tooling**
- **ESLint Compliance**
  - All code now passes ESLint checks without warnings
  - Improved code consistency and maintainability
  - Better TypeScript integration with proper type checking

## [0.0.9-alpha.1] - 2025-07-02

### ✨ **New Features**
- **Interactive Sidebar**
  - Avatar now shows player head (or animated loader) and is clickable to start Microsoft authentication.
  - Sidebar auto-expands when hovering over avatar or navigation buttons and auto-collapses on mouse leave.
  - Added pin/unpin button with new icons; pin state (expanded or collapsed) is persisted across restarts.

- **Settings Validation**
  - Username field: required and max 16 chars with inline error & toast; ESLint configured to enforce rules.

### 🛠 **Improvements**
- PlayerHeadLoader animation centered & fixed artifacts.
- Added validation to Minecraft usernames.

### 🐛 **Bug Fixes**
- Fixed ModpackDetails not showing installation progress information like ModpackCard
- Removed download speed checks that were not implemented in backend
- Fixed Microsoft authentication fallback: browser method now opens page & shows URL input only on genuine failures (not on user cancel).
- Alignment: avatar now aligns with navigation buttons.

### 🧰 **Tooling**
- Added project-level **ESLint** config with React + TypeScript presets and integrated `npm run lint` script.

### 🔍 **Misc**
- Changelog entries consolidated; previous minor fixes retained.

## [0.0.8-alpha.5] - 2025-07-01

### ♻️ **Manifest & Auto-Update Refinements**

#### **Signed Prerelease Manifests**
- New smart logic merges the signed `latest.json` generated by **tauri-action** with correct prerelease version (`-alpha.X`) and URLs pointing to the tagged release.
- Guarantees **valid signatures** for prereleases while preserving accurate metadata.

#### **Single-Source Manifest**
- Removed redundant `prerelease-latest.json`; the launcher now relies exclusively on **latest.json**.
- For prereleases, `latest.json` is committed to *main* and served from raw-GitHub; for stable releases it is downloaded from the latest GitHub release assets.

#### **GitHub Actions Workflow**
- Workflow no longer attempts to download the defective manifest from tauri-action; instead our script always generates / fixes the manifest for prereleases.
- Commit step simplified to add **only** `latest.json`.

#### **Scripts**
- `scripts/generate-prerelease-manifest.cjs` now:
  - Downloads the signed manifest created by tauri-action.
  - Patches version and URLs, preserving signatures.
  - Writes the result to `latest.json` **only**.

#### **UpdateService Improvements**
- Ensures automatic download & silent install for prereleases when signatures are present.
- Manual fallback retained if updater reports no update.

### 🩹 **Bug Fixes**
- Fixed TypeScript error caused by unused custom `endpoints` option.
- Resolved scenario where Install button opened GitHub page despite update being downloadable.

### 📚 **Docs**
- README "Automatic Updates System" section updated: prerelease channel now also consumes `latest.json` (from *main*) — removal of `prerelease-latest.json`.

## [0.0.8-alpha.4] - 2025-07-01

### 🚀 **Smart Hybrid Update System - Complete Rewrite**

#### **Intelligent Update Detection**
- **Smart Channel Detection**: System now intelligently detects user preferences and serves appropriate updates
  - **Stable Users**: Only receive stable releases via Tauri's built-in updater
  - **Beta Testers**: Get latest prereleases via GitHub API with automatic installation
- **Hybrid Architecture**: Combines GitHub's automatic `latest.json` for stability with custom GitHub API for prerelease detection
- **Zero False Positives**: Prerelease users no longer see outdated stable versions when newer prereleases exist

#### **Universal Automatic Installation**
- **Both Channels Automatic**: Prereleases now install automatically just like stable releases (no more manual downloads)
- **Intelligent Fallback**: If automatic prerelease installation fails, gracefully falls back to manual download page
- **Tauri-Native Installation**: Uses Tauri's cryptographically verified installation for all updates
- **Seamless Experience**: Same one-click installation experience for stable and experimental users

#### **Simplified Architecture & Maintenance**
- **Eliminated Complex Scripts**: Removed unnecessary `sign-update.cjs`, `update-manifest.cjs`, and `generate-unified-manifest.cjs`
- **Cleaned Codebase**: Deleted redundant files and simplified workflow to essential components only
- **GitHub Actions Optimization**: Streamlined CI/CD pipeline with intelligent manifest generation
- **Zero Manual Maintenance**: GitHub Actions automatically handles all manifest updates for both stable and prereleases

#### **Enhanced GitHub Actions Workflow**
- **Automatic Manifest Management**: Workflow intelligently downloads and commits appropriate `latest.json` based on release type
- **Prerelease Manifest Generation**: Custom script generates prerelease manifests with correct URLs and metadata
- **Smart Release Detection**: Automatically determines if release is stable or prerelease and handles accordingly
- **Improved Error Handling**: Better fallback mechanisms and error reporting in CI/CD pipeline

### 🔧 **Technical Architecture Improvements**

#### **UpdateService Complete Rewrite**
- **Hybrid Detection Logic**: Intelligently routes update checks based on user settings
- **GitHub API Integration**: Direct integration with GitHub releases API for prerelease detection
- **Version Comparison**: Smart version comparison logic handling both stable and prerelease versioning
- **Tauri Integration**: Seamless integration with Tauri's native updater for actual installations

#### **Endpoint Configuration**
- **Dual Endpoint Strategy**: Primary endpoint points to repository-hosted manifest, fallback to GitHub's automatic latest.json
- **Dynamic Manifest Updates**: Repository manifest automatically updated by GitHub Actions for all release types
- **Correct URL Patterns**: Fixed all platform-specific file naming patterns to match actual Tauri build outputs

#### **Script & Tooling Simplification**
- **New `generate-prerelease-manifest.cjs`**: Focused script for generating prerelease manifests with correct metadata
- **Removed Legacy Scripts**: Eliminated complex signing and manifest scripts that caused maintenance overhead
- **Package.json Cleanup**: Removed unused script references and maintained only essential commands

### 🐛 **Bug Fixes & Stability**
- **Fixed Pubkey Management**: Eliminated scripts that were corrupting the cryptographic public key in `tauri.conf.json`
- **Corrected Workflow Syntax**: Fixed bash syntax errors in GitHub Actions that were causing CI failures
- **Proper File Naming**: Corrected platform-specific file name patterns to match Tauri's actual build outputs
- **Endpoint Reliability**: Fixed unreliable update endpoints and eliminated 404 errors

### 📚 **Documentation Updates**
- **Updated README**: Comprehensive documentation of the new smart hybrid update system
- **Architecture Explanation**: Clear explanation of how stable vs prerelease detection works
- **User Experience Documentation**: Detailed explanation of what users experience in each update channel
- **Developer Workflow**: Updated documentation for simplified release process

### 🔄 **Migration & Compatibility**
- **Seamless Migration**: Existing users automatically benefit from improved update system
- **Preserved User Settings**: All existing prerelease preferences maintained
- **Backward Compatibility**: No breaking changes to user experience or data
- **Enhanced Performance**: Faster and more reliable update detection and installation

## [0.0.8-alpha.3] - 2025-07-01

### 🚀 **Automatic Update System Implementation**

#### **Complete Automatic Update Infrastructure**
- **Tauri Updater Integration**: Implemented native Tauri updater plugin for seamless automatic updates
- **Cryptographic Signing**: Added secure update signing with password-protected private keys
- **Cross-Platform Support**: Automatic updates work on Windows, macOS (Intel/ARM), and Linux
- **Progress Tracking**: Real-time download and installation progress with percentage indicators
- **Automatic Restart**: App automatically restarts after successful update installation

#### **Prerelease Update Support**
- **Experimental Updates Toggle**: Added settings option to enable/disable prerelease updates (alpha, beta, rc)
- **Dual Update System**: 
  - Stable releases: Automatic installation via Tauri updater
  - Prereleases: Manual download page opening for GitHub releases
- **Smart Version Detection**: Automatically detects prerelease vs stable versions
- **User Choice**: Users can opt-in to experimental updates with clear warnings

#### **Enhanced Update User Experience**
- **Elegant Update Dialog**: Beautiful update notification with version info and release notes
- **Progress Visualization**: Real-time progress bars showing download and installation status
- **Automatic Background Checks**: App checks for updates on startup and periodically
- **Fallback Handling**: Graceful fallback to manual restart if automatic restart fails

### 🔧 **Release Workflow Automation**

#### **Automated Release Process**
- **Integrated Update Manifest**: `release.js` now automatically updates `updater.json` with correct URLs
- **Smart URL Generation**: Automatically generates correct URLs for stable vs prerelease versions
- **Version Management**: Single command updates all version files across the project
- **Git Integration**: Automatic commit and tag creation for releases

#### **New Scripts and Tools**
- **`update-manifest.cjs`**: Automatically configures updater endpoints for different release types
- **`sign-update.js`**: Manual signing tool with password support for development releases
- **Enhanced `release.js`**: Now includes automatic manifest updates in the release workflow

#### **GitHub Actions Enhancement**
- **Automatic Signing**: GitHub Actions now automatically signs all release artifacts
- **Secret Management**: Secure handling of signing keys via GitHub Secrets
- **Cross-Platform Builds**: Automated builds for all platforms with proper signing

### 🎨 **Settings and Configuration**

#### **New Prerelease Settings**
- **Experimental Updates Toggle**: New checkbox in Settings to enable prerelease updates
- **Clear Warnings**: Descriptive text explaining risks of experimental versions
- **Default Disabled**: Prereleases disabled by default for stability
- **Bilingual Support**: Full English and Spanish translations for new settings

#### **Enhanced Settings UI**
- **Shield Icon**: Added visual indicator for experimental features section
- **Improved Layout**: Better organization of settings with clear sections
- **User Feedback**: Toast notifications for settings changes

### 🔐 **Security and Infrastructure**

#### **Cryptographic Security**
- **Password-Protected Keys**: Private signing keys now support password protection
- **GitHub Secrets Integration**: Secure storage of signing keys and passwords
- **Signature Verification**: All updates verified with cryptographic signatures
- **HTTPS-Only**: All update endpoints use secure HTTPS connections

#### **Update Endpoint Configuration**
- **Corrected URLs**: Fixed all references to use current repository structure
- **Dynamic Endpoints**: Different endpoints for stable vs prerelease versions
- **Raw GitHub Integration**: Uses raw.githubusercontent.com for reliable manifest access

### 📚 **Documentation and Workflow**

#### **Comprehensive Documentation**
- **Release Workflow Guide**: Complete documentation with Mermaid diagram showing automated process
- **Auto-Update Setup Guide**: Detailed setup instructions for automatic updates
- **Troubleshooting**: Common issues and solutions for update system
- **Visual Diagrams**: Mermaid diagrams showing complete workflow automation

#### **Developer Experience**
- **Automated Commands**: Single commands for complete release process
- **Visual Feedback**: Clear progress indicators and status messages
- **Error Handling**: Comprehensive error handling with helpful messages
- **Workflow Integration**: Seamless integration with existing development workflow

### 🐛 **Bug Fixes and Improvements**
- Fixed incorrect API endpoints pointing to non-existent repositories
- Resolved module import issues with CommonJS/ES modules
- Corrected updater.json URL patterns for different release types
- Fixed version comparison logic for prerelease detection
- Improved error handling in update service
- Replaced `scripts/sign-update.js` with CommonJS `scripts/sign-update.cjs` to fix `require` errors under ESM configuration
- `sign-update` now generates concise *What's New* notes and writes only the latest version to `updater.json`
- Updated `package.json` script `sign-update` to reference the new `.cjs` script

### 📋 **Breaking Changes**
- **Update System**: New automatic update system replaces manual download links
- **Settings Schema**: Added `enablePrereleases` field to user settings
- **Backend API**: New Tauri commands for update checking and platform detection

### 🔧 **Migration Notes**
- **Automatic Migration**: Existing users will automatically receive the new update system
- **Settings Reset**: New prerelease setting defaults to disabled for stability
- **Backward Compatibility**: All existing functionality preserved
- **Update Experience**: Users will see new update dialogs and progress indicators

### ✨ **Recent Additions & UX Polishing (post-alpha.2 hotfixes)**
- **Global toast notifications**: Migrated to `react-hot-toast` with custom dark theme matching launcher palette. Notifications no longer shift layout.
- **Settings enhancements**:
  - Added "Discard changes" button next to "Save" with toast feedback.
  - Java path validation hardened (symlink support, real-time feedback, always-visible "Use detected Java" button).
  - Settings/About pages now use full width; removed legacy `max-w-*` constraints.
- **Meta-storage panel**:
  - Counts & lists now expandable. Clicking "Minecraft versions" or "Java installations" reveals complete lists with lazy load from backend.
  - User-selected Java executable and system Java are counted; duplicates hidden when paths match.
  - Added missing Spanish translation for "Tamaño de la caché".
- **Modpack card cleanup**: Hidden server IP address and copy-IP button for cleaner presentation (connect action preserved internally).
- **Backend API**:
  - New Tauri commands `list_minecraft_versions` and `list_java_installations` to feed the expandable lists.
- **Translations**: Added keys `settings.discardChanges`, `settings.changesDiscarded`, and Spanish equivalents.

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

#### **Enhanced ModpackCard Layout & Status System**
- **Repositioned Status Badges**: Moved modpack status badges (Nuevo, Activo, Próximamente, Inactivo) to top-right corner of cards for better visibility
- **Cleaner Status Design**: Removed emojis from status badges for a more professional appearance
- **Improved Card Layout**: Restored proper two-column layout in ModpackDetails with main info on left and technical details on right
- **Better Visual Hierarchy**: Enhanced card positioning and spacing for improved readability

#### **Enhanced Progress Indicators**
- **Fixed Bullet Point Consistency**: Standardized bullet point size to `w-2 h-2` (8x8px) across all mod download states
- **Removed Animations**: Eliminated `animate-pulse` effect to prevent visual size changes during downloads
- **Color-Coded Status**: Maintained intuitive color system:
  - Blue bullet for active downloads
  - Green bullet for completed/existing mods
  - Red bullet for errors/unavailable mods
- **Cleaner Mod Names**: Removed status prefixes ("Descargando:", "Ya existe:", etc.) showing only clean mod filenames

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

#### **Improved Translations & Terminology**
- **Updated Button Labels**: Changed "Open Folder" to "Instance" in English and "Abrir Carpeta" to "Instancia" in Spanish
- **Consistent Terminology**: Aligned UI terminology with launcher functionality

#### **Progress System Refinements**
- **Progress Distribution**: Adjusted progress ranges for smoother feedback:
  - CurseForge processing: 70%-100%
  - Mod downloads: Proportional distribution within the range
  - Final steps properly reaching 100%
- **Message Handling**: Fixed "preparing_mod_downloads" translation display

### 🔧 **Technical Improvements**

#### **Code Organization & Type Safety**
- **Created Utility Functions**: Added `formatNumber.ts` and `formatPlayTime.ts` for consistent data formatting
- **Enhanced Type Definitions**: Improved `ModpackProgress` interface and type handling
- **Fixed Import Structure**: Created proper index.ts exports for utility functions
- **Better Error Handling**: Enhanced error handling for instance folder operations

#### **Backend Message Processing**
- **Simplified Mod Status Messages**: Removed redundant text prefixes from mod download status messages
- **Cleaner Progress Data**: Modified Rust backend to send clean mod filenames without status prefixes
- **Maintained Status Logic**: Preserved color-coded status system while simplifying message content

### 🐛 **Bug Fixes**
- Fixed progress bar getting stuck at 90% during mod downloads
- Resolved missing translations for mod download status messages
- Fixed inconsistent status indicator colors during mod installation
- Fixed ModpackCard layout issues with duplicate content sections
- Resolved type errors in progress handling and state management
- Fixed status badge positioning and visual consistency
- Corrected import paths for utility functions
- Eliminated bullet point size inconsistencies during mod downloads

### 📋 **Breaking Changes**
- None - all changes maintain backward compatibility

### 🔧 **Migration Notes**
- Automatic improvements upon update
- All user settings and installed modpacks preserved
- Enhanced UI elements will be visible immediately after update

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
