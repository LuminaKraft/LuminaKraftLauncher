# 📚 LuminaKraft Launcher Documentation

This directory contains essential documentation for the LuminaKraft Launcher project.

## 📋 Available Documentation

### Development & Testing
- **[Testing Guide](TESTING_GUIDE.md)** - Comprehensive testing procedures and quality assurance
- **[Lyceris Integration Summary](LYCERIS_INTEGRATION_SUMMARY.md)** - Core Minecraft launcher library integration details
- **[Release Workflow](RELEASE_WORKFLOW.md)** - Complete automated release process and workflow diagram

## 🚀 Quick Start for Developers

### Development Setup
```bash
# Clone the repository
git clone https://github.com/LuminaKraft/LuminaKraftLauncher.git
cd LuminaKraftLauncher

# Install dependencies
npm install

# Start development server
npm run tauri:dev
```

### Creating Releases
All builds are now handled automatically via GitHub Actions:

```bash
# Create a standard release
npm run release patch   # 1.0.0 -> 1.0.1
npm run release minor   # 1.0.0 -> 1.1.0
npm run release major   # 1.0.0 -> 2.0.0

# Create prereleases
npm run release -- 1.0.0-beta.1    # Beta prerelease
npm run release -- 1.0.0-alpha.1   # Alpha prerelease
npm run release -- 1.0.0-rc.1      # Release candidate

# Push to trigger GitHub Actions build
npm run release:push
```

### GitHub Actions Workflow
- **Triggered by**: Git tags (`v*`) or manual dispatch
- **Builds for**: Windows (NSIS + MSI), macOS (Intel + ARM64), Linux (AppImage + packages)
- **Automatic**: Release creation and artifact upload
- **Monitor**: https://github.com/LuminaKraft/LuminaKraftLauncher/actions

## 📖 Project Resources

### Main Documentation
- **[README.md](../README.md)** - Main project documentation
- **[Contributing Guidelines](../CONTRIBUTING.md)** - How to contribute
- **[Code of Conduct](../CODE_OF_CONDUCT.md)** - Community guidelines
- **[Changelog](../CHANGELOG.md)** - Version history

### Technical Resources
- **[Tauri Documentation](https://tauri.app/v1/guides/)** - Cross-platform framework
- **[Lyceris Library](../lyceris-main/)** - Minecraft launcher core
- **[React Documentation](https://react.dev/)** - Frontend framework

## 🔧 Development Guidelines

### Code Quality
- Follow existing code style and patterns
- Use TypeScript for type safety
- Test your changes thoroughly
- Update documentation when needed

### Release Process
1. **Development**: Work on features in branches
2. **Testing**: Run comprehensive tests
3. **Version**: Use semantic versioning
4. **Release**: Let GitHub Actions handle builds
5. **Distribution**: Automatic release creation

## 🌍 Multi-Platform Support

The launcher is built for:
- **Windows**: NSIS installer (recommended) + MSI installer
- **macOS**: Universal DMG (Intel + Apple Silicon)
- **Linux**: AppImage + .deb/.rpm packages

All builds are generated automatically via GitHub Actions for consistency and reliability.

---

For more detailed information, refer to the individual documentation files or the main project README. 