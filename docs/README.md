# 📚 LuminaKraft Launcher Documentation

This folder contains detailed technical documentation for the LuminaKraft Launcher project.

## 📋 Documentation Index

### ⚡ **Technical Integration**
- [`LYCERIS_INTEGRATION_SUMMARY.md`](./LYCERIS_INTEGRATION_SUMMARY.md) - Details of the Lyceris v1.1.3 Minecraft launcher library integration

## 🔗 **Main Documentation**

For general information, installation, and usage instructions, see the main [`README.md`](../README.md) in the project root.

For version history and changes, see [`CHANGELOG.md`](../CHANGELOG.md) in the project root.

## 🎯 **Quick Links**

- **For Developers**: Start with `LYCERIS_INTEGRATION_SUMMARY.md` to understand the technical architecture
- **For Users**: Check the main README for installation and usage instructions

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

---

**Need help?** Join our [Discord](https://discord.gg/UJZRrcUFMj) or check the main README for support information. 