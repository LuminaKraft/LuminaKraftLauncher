# 📚 LuminaKraft Launcher Documentation

This folder contains comprehensive technical documentation for the LuminaKraft Launcher project.

## 📋 Documentation Index

### 🏗️ **Build & Development**
- [`CROSS_COMPILATION_GUIDE.md`](./CROSS_COMPILATION_GUIDE.md) - Complete guide for building across platforms using Docker
- [`RELEASE_SETUP.md`](./RELEASE_SETUP.md) - Complete release system guide with commands and workflows

### 🧪 **Testing & Troubleshooting**
- [`TESTING_GUIDE.md`](./TESTING_GUIDE.md) - Testing procedures for releases and fixes
- [`CACHE_FIX_GUIDE.md`](./CACHE_FIX_GUIDE.md) - Solutions for build cache and version conflict issues

### ⚡ **Technical Integration**
- [`LYCERIS_INTEGRATION_SUMMARY.md`](./LYCERIS_INTEGRATION_SUMMARY.md) - Details of the Lyceris v1.1.3 Minecraft launcher library integration

## 🎯 Quick Navigation

### 👨‍💻 **For Developers**
1. **First Time Setup**: Start with `CROSS_COMPILATION_GUIDE.md` for build environment setup
2. **Creating Releases**: Use `RELEASE_SETUP.md` for release commands and workflows
3. **Technical Details**: Check `LYCERIS_INTEGRATION_SUMMARY.md` for architecture understanding

### 🔧 **For Troubleshooting**
1. **Build Issues**: Check `CROSS_COMPILATION_GUIDE.md` troubleshooting section
2. **Release Problems**: See `CACHE_FIX_GUIDE.md` for version conflicts
3. **Testing**: Use `TESTING_GUIDE.md` for validation procedures

### 👥 **For Users**
- **Installation & Usage**: See the main [`README.md`](../README.md) in the project root
- **Version History**: Check [`CHANGELOG.md`](../CHANGELOG.md) in the project root

## 🚀 Quick Start Commands

### Build Commands
```bash
# Build all platforms
npm run release -- 1.0.0

# Individual platform builds
bash scripts/build-windows.sh    # Windows (MSI + NSIS)
bash scripts/build-linux.sh      # Linux (DEB + RPM)
bash scripts/build-macos.sh      # macOS (DMG + APP)
```

### Release Commands
```bash
# Stable releases
npm run release:patch      # Bug fixes
npm run release:minor      # New features
npm run release:major      # Major changes

# Pre-releases
npm run release:patch-pre  # Pre-release bug fixes
npm run release:minor-pre  # Pre-release new features
```

## 🔄 **Update System**

The launcher uses a **simplified GitHub-based update system**:

- **Automatic Detection**: Checks GitHub releases for new versions
- **Simple Comparison**: Compares current version with latest release tag
- **Direct Download**: Opens browser to download the latest release
- **No API Required**: Works directly with GitHub's public API

### How it Works

1. **Startup Check**: App checks GitHub releases API on startup
2. **Version Comparison**: Compares current version with latest release tag
3. **Update Dialog**: Shows update dialog if newer version available
4. **Direct Download**: Opens GitHub releases page in browser for download
5. **Manual Installation**: User downloads and installs manually

### Benefits

- ✅ **Simple**: No complex API backend required
- ✅ **Reliable**: Uses GitHub's robust infrastructure
- ✅ **Transparent**: Users can see all releases and changelogs
- ✅ **Secure**: Downloads directly from GitHub
- ✅ **Maintainable**: No additional infrastructure to maintain

## 📊 Documentation Structure

The documentation has been consolidated from 12 files to 5 focused guides:

- **Removed Duplicates**: Eliminated 7 overlapping documents
- **Merged Content**: Combined related information into comprehensive guides
- **Improved Navigation**: Clear structure for developers and users
- **Better Maintenance**: Fewer files to keep updated

## 🔗 External Links

- **🔨 GitHub Actions**: https://github.com/kristiangarcia/luminakraft-launcher/actions
- **📦 Public Releases**: https://github.com/kristiangarcia/luminakraft-launcher-releases/releases
- **💬 Discord Community**: https://discord.gg/UJZRrcUFMj
- **🐛 Report Issues**: https://github.com/kristiangarcia/luminakraft-launcher-releases/issues

---

**Need help?** Join our [Discord](https://discord.gg/UJZRrcUFMj) or check the specific guides above for detailed information. 