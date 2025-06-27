# Scripts Directory

This directory contains utility scripts for development and release management of the LuminaKraft Launcher.

> **⚠️ Note**: Build scripts have been removed in favor of GitHub Actions for automated, reliable cross-platform compilation.

## 🚀 Release Management

### Release Script
- **`release.js`** - Automated release management script
  - Version bumping (patch, minor, major)
  - Git tagging and pushing
  - Automated GitHub release creation via Actions

### Release Usage
```bash
# Create patch release (updates version and creates tag)
npm run release:patch

# Create minor release
npm run release:minor

# Create major release
npm run release:major

# Push release to trigger GitHub Actions build
npm run release:push
```

## 🛠 Development Utilities

### Development Tools
- **`kill-port.js`** - Kill processes on specific ports (useful for dev server)
- **`check-modpack-urls.sh`** - Validate modpack URLs and metadata
- **`clean-duplicates.sh`** - Remove duplicate files in target directories
- **`generate-release-description.cjs`** - Generate comprehensive release descriptions

### Release Description Generator
- **Purpose**: Creates detailed GitHub release descriptions
- **Features**: 
  - Extracts key changes from CHANGELOG.md
  - Supports stable releases and prereleases
  - Includes download instructions for all platforms
  - Adds technical details and useful links
- **Usage**: Automatically used by GitHub Actions workflow

### Development Usage
```bash
# Kill port 1420 (default Vite dev server)
npm run kill-port 1420

# Start dev server with stable port (kills port first)
npm run tauri:dev-stable

# Check modpack URLs
bash scripts/check-modpack-urls.sh

# Generate release description (manual testing)
node scripts/generate-release-description.cjs 0.0.6
node scripts/generate-release-description.cjs 0.0.6-beta.1 --prerelease
```

## 📋 Build Process (GitHub Actions)

All builds are now handled automatically via GitHub Actions:

### Automatic Builds
1. **Tag Push**: Push a version tag to trigger builds
2. **GitHub Actions**: Automatically builds for all platforms
3. **Release Creation**: Creates GitHub release with all artifacts
4. **Multi-Platform**: Windows (NSIS + MSI), macOS (Intel + ARM64), Linux (AppImage + packages)

### Creating a Release
```bash
# Update version in package.json and src-tauri/tauri.conf.json
# Then create and push tag
git tag v0.0.7
git push origin v0.0.7

# GitHub Actions will automatically:
# - Build for all platforms
# - Create installers and packages
# - Upload to GitHub Releases
```

### Manual Trigger
You can also manually trigger builds from the GitHub Actions tab in your repository.

## 🔍 Available Platforms

### Automated Build Outputs
```
GitHub Releases/
├── LuminaKraft Launcher_x.x.x_x64-setup.exe          # Windows NSIS (RECOMMENDED)
├── LuminaKraft Launcher_x.x.x_x64_en-US.msi          # Windows MSI
├── LuminaKraft Launcher_x.x.x_x64.dmg                # macOS Intel
├── LuminaKraft Launcher_x.x.x_aarch64.dmg            # macOS ARM64
├── LuminaKraft Launcher_x.x.x_amd64.AppImage         # Linux AppImage
├── LuminaKraft Launcher_x.x.x_amd64.deb              # Linux Debian
└── LuminaKraft Launcher-x.x.x-1.x86_64.rpm           # Linux RPM
```

## 🌟 Benefits of GitHub Actions

### Advantages Over Local Builds
- ✅ **Consistent Environment**: Same build environment every time
- ✅ **No Local Dependencies**: No need for Docker, cross-compilation tools
- ✅ **Automated Process**: No manual intervention required
- ✅ **Multi-Platform**: All platforms built simultaneously
- ✅ **Reliable Artifacts**: Guaranteed working builds
- ✅ **Easy Releases**: Automatic release creation and upload

### Removed Complexity
- ❌ Docker setup and maintenance
- ❌ Cross-compilation toolchain management
- ❌ Platform-specific build scripts
- ❌ Manual artifact organization
- ❌ Build environment inconsistencies

## 📝 Migration Notes

### What Was Removed
- `build-all.sh` - Master build script
- `build-macos.sh` - macOS build script
- `build-windows.sh` - Windows Docker build
- `build-linux.sh` - Linux Docker build
- `clean-artifacts.sh` - Build cleanup script
- `clean-docker.sh` - Docker cleanup script
- `download-nsis-deps.js` - NSIS dependencies

### What Remains
- Release management scripts
- Development utilities
- URL validation tools
- Port management utilities

## 🔗 GitHub Actions Workflow

The build process is now handled by `.github/workflows/build-and-release.yml`:
- Triggered on tag push (`v*`) or manual dispatch
- Builds on native runners (no Docker needed)
- Creates draft release automatically
- Uploads all build artifacts
- Publishes release when builds complete

This provides a much more reliable and maintainable build process compared to local scripts.

---

# Modpack URL Checker 🔍

## check-modpack-urls.sh

Script to verify which mods in a CurseForge modpack have empty URLs and need to be included in `overrides/mods/`.

### 🎯 **Purpose**

This script helps workers verify modpacks **before** uploading them to the server, identifying which mods cannot be downloaded automatically and need to be included manually in the `overrides/mods/` folder.

### 📋 **System Requirements**

The script requires standard tools that are pre-installed on most systems:

- **unzip** - To extract ZIP files
- **curl** - To make HTTP requests
- **jq** - To process JSON

#### Installing dependencies:

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install unzip curl jq
```

**macOS (with Homebrew):**
```bash
brew install jq
# unzip and curl are already pre-installed
```

**CentOS/RHEL/Fedora:**
```bash
sudo yum install unzip curl jq
```

### 🚀 **Usage**

```bash
# Make executable (first time only)
chmod +x check-modpack-urls.sh

# Check a modpack
./check-modpack-urls.sh my-modpack-1.0.0.zip
```

### 🔄 **Recommended Workflow**

1. **Export modpack** from CurseForge App
2. **Run script** to verify URLs
3. **If there are mods with empty URLs:**
   - Download manually using provided links
   - Create `overrides/mods/` folder in modpack
   - Place downloaded `.jar` files in `overrides/mods/`
   - Repackage the modpack ZIP
   - **Optional:** Run script again to confirm
4. **Upload modpack** to server

This script ensures all mods in your modpack can be properly downloaded by the launcher.