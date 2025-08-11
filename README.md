# 💎 LuminaKraft Launcher

[![en](https://img.shields.io/badge/lang-en-red.svg)](https://github.com/LuminaKraft/LuminakraftLauncher/blob/main/README.md)
[![es](https://img.shields.io/badge/lang-es-yellow.svg)](https://github.com/LuminaKraft/LuminakraftLauncher/blob/main/README.es.md)

[![Downloads](https://img.shields.io/github/downloads/LuminaKraft/LuminakraftLauncher/total.svg)](https://github.com/LuminaKraft/LuminakraftLauncher/releases)
[![Release](https://img.shields.io/github/release/LuminaKraft/LuminakraftLauncher.svg)](https://github.com/LuminaKraft/LuminakraftLauncher/releases/latest)
[![License](https://img.shields.io/github/license/LuminaKraft/LuminakraftLauncher.svg)](LICENSE)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/LuminaKraft/LuminakraftLauncher/actions)

A modern, cross-platform Minecraft launcher built with **Tauri** and **React**, featuring automatic updates, Microsoft authentication, and modpack management using the **Lyceris** library.

![LuminaKraft Launcher Screenshot](assets/images/launcher-main.png)

## ✨ Features

- 🔐 **Microsoft Authentication**: Secure login with your Microsoft account
- 📦 **Modpack Management**: Browse and install modpacks from CurseForge
- 🔄 **Automatic Updates**: Self-updating launcher with seamless version management
- 🌍 **Multi-language Support**: Available in English and Spanish
- 🖥️ **Cross-Platform**: Native support for Windows, macOS, and Linux
- ⚡ **Modern UI**: Beautiful, responsive interface built with React and Tailwind CSS
- 🎮 **Minecraft Integration**: Powered by the Lyceris library for robust game management
- 🔧 **Easy Installation**: One-click modpack installation and management
- 📊 **Progress Tracking**: Real-time download and installation progress
- 🎨 **Custom Themes**: Light and dark mode support

## 📸 Screenshots

| Main Interface | Launcher Features | macOS Installation |
|:---:|:---:|:---:|
| ![Main Interface](assets/images/launcher-main.png) | ![Launcher Features](assets/images/launcher-main.png) | ![macOS Installation](assets/images/macos-installation.png) |

## 🎯 Cross-Platform Build Success

All platforms are built automatically via GitHub Actions:

### ✅ Supported Platforms
- **Windows**: `.exe` executable (NSIS) + `.msi` installer (WiX) 
- **macOS**: Universal DMG files (Intel + ARM64) + `.app` bundles  
- **Linux**: AppImage + .deb/.rpm packages

### 📦 Build Artifacts
All build outputs are automatically generated via GitHub Actions and available in Releases:
```
Releases/
├── LuminaKraft Launcher_x.x.x_x64-setup.exe          # Windows NSIS installer (RECOMMENDED)
├── LuminaKraft Launcher_x.x.x_x64_en-US.msi          # Windows MSI installer
├── LuminaKraft Launcher_x.x.x_x64.dmg                # macOS Intel DMG
├── LuminaKraft Launcher_x.x.x_aarch64.dmg            # macOS ARM64 DMG
├── LuminaKraft Launcher_x.x.x_amd64.AppImage         # Linux AppImage
├── LuminaKraft Launcher_x.x.x_amd64.deb              # Linux Debian package
└── LuminaKraft Launcher-x.x.x-1.x86_64.rpm           # Linux RPM package
```

## 🚀 Installation
## 🔐 API Authentication & Caching

### Authentication headers sent by the launcher

- Microsoft users: `Authorization: Bearer <msToken>`
- Offline users: `x-lk-token: <clientToken>` (stable token generated and stored in settings)
- Additional header: `x-luminakraft-client: luminakraft-launcher`

### Caching behavior

- Persistent cache (localStorage):
  - `launcher_data` TTL: 5 minutes
  - `translations_*`, `features_*`, `available_languages` TTL: 1 hour
- Tauri backend caches icon/screenshots to disk under meta storage; the frontend triggers this caching after loading launcher data.


### 📥 Quick Installation Guide

#### 🪟 **Windows** (Recommended Platform)

1. **Download**: Go to [Releases](https://github.com/LuminaKraft/LuminakraftLauncher/releases/latest)
   - **🔥 RECOMMENDED**: `LuminaKraft Launcher_x.x.x_x64-setup.exe` (NSIS installer - allows data cleanup on uninstall)
   - **Alternative**: `LuminaKraft Launcher_x.x.x_x64_en-US.msi` (MSI installer - for corporate environments)

2. **Run Installer**: Double-click the downloaded file

3. **⚠️ Windows Defender SmartScreen Warning**:
   - If you see "**Windows protected your PC**":
   - Click "**More info**"
   - Click "**Run anyway**"
   - This happens because the app isn't signed with an expensive certificate yet

4. **Install**: Follow the installer prompts → Launch!

> **Why .exe over .msi?** The NSIS `.exe` installer gives you the option to delete user data when uninstalling, while the `.msi` follows Windows standard behavior of preserving user data.

#### 🍎 **macOS**

1. **Download**: 
   - **Intel Macs**: `LuminaKraft Launcher_x.x.x_x64.dmg`
   - **Apple Silicon (M1/M2/M3)**: `LuminaKraft Launcher_x.x.x_aarch64.dmg`

2. **Open DMG**: Double-click the downloaded `.dmg` file

3. **Drag to Applications**: Drag `LuminaKraft Launcher.app` to Applications folder
   
   ![macOS Installation Process](assets/images/macos-installation.png)

4. **⚠️ Gatekeeper Issues** (Very Common):
   
   **If you get "App is damaged" or "Cannot verify developer":**
   
   **Method 1 - Right Click (Easiest):**
   - Right-click the app in Applications
   - Select "Open" 
   - Click "Open" when prompted
   
   **Method 2 - System Preferences:**
   - Go to Apple Menu → System Preferences → Security & Privacy
   - Click the lock to make changes
   - Find the blocked app message and click "Open Anyway"
   
   **Method 3 - Terminal (If above fail):**
   
   Open Terminal (⌘+Space, search "terminal"):
   
   ![Open Terminal](assets/images/macos-spotlight-terminal.png)
   
   Run this command:
   ```bash
   # Remove quarantine attribute
   xattr -cr "/Applications/LuminaKraft Launcher.app"
   ```
   
   ![Terminal Command](assets/images/macos-terminal-xattr.png)

5. **Launch the Launcher**: Search for "LuminaKraft Launcher" in Spotlight (⌘+Space):

   ![Search for Launcher](assets/images/macos-spotlight-launcher.png)

#### 🐧 **Linux**

1. **Download**: Choose your format:
   - **AppImage** (Universal): `LuminaKraft Launcher_x.x.x_amd64.AppImage`
   - **Debian/Ubuntu**: `LuminaKraft Launcher_x.x.x_amd64.deb`
   - **Fedora/RHEL**: `LuminaKraft Launcher-x.x.x-1.x86_64.rpm`

2. **Install**:
   ```bash
   # AppImage (No installation needed)
   chmod +x LuminaKraft\ Launcher_*_amd64.AppImage
   ./LuminaKraft\ Launcher_*_amd64.AppImage
   
   # Debian/Ubuntu
   sudo dpkg -i LuminaKraft\ Launcher_*_amd64.deb
   
   # Fedora/RHEL  
   sudo rpm -i LuminaKraft\ Launcher-*-1.x86_64.rpm
   ```

### 📋 System Requirements
- **Windows**: Windows 10 or later
- **macOS**: macOS 10.13 (High Sierra) or later
- **Linux**: Modern distribution with GTK 3.24+
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 1GB free space for launcher + modpack storage

### 🔧 Troubleshooting

#### Windows Issues
- **SmartScreen Warning**: Normal behavior, click "More info" → "Run anyway"
- **Antivirus Detection**: Add launcher to antivirus whitelist
- **Installation Failed**: Run installer as Administrator

#### macOS Issues  
- **"App is damaged"**: Remove quarantine with `xattr -cr "/Applications/LuminaKraft Launcher.app"` ([see visual guide](#️-gatekeeper-issues-very-common))
- **"Cannot verify developer"**: Right-click app → Open → Open ([see installation guide](#-macos))
- **Permission Denied**: Check Security & Privacy settings
- **App won't launch**: Try opening from Terminal: `open "/Applications/LuminaKraft Launcher.app"`

#### Linux Issues
- **AppImage won't run**: Make executable with `chmod +x`
- **Missing dependencies**: Install GTK 3.24+ and WebKit2GTK
- **Package conflicts**: Use AppImage for universal compatibility

#### Linux Display Servers (Wayland/X11)
- The launcher now automatically prefers Wayland and gracefully falls back to X11 if Wayland is unavailable.
- It also disables WebKit's DMABUF path and selects a compatible GTK renderer to avoid common crashes like:
  - `Gdk-Message: Error 71 (Protocol error) dispatching to Wayland display.`
  - `Failed to create GBM buffer of size 1200x800: Invalid argument`
- No manual environment setup is required. For troubleshooting, you can still override:
  - `GDK_BACKEND=wayland,x11` (backend preference)
  - `GSK_RENDERER=gl` (GTK renderer)
  - `WEBKIT_DISABLE_DMABUF_RENDERER=1` (disable fragile dmabuf path)
  - `LIBGL_ALWAYS_SOFTWARE=1` (software rendering fallback on X11)

### 🐧 Linux dependencies (Debian/Ubuntu/Kali-based)

Before building locally on Linux, install the required system packages:

```bash
sudo apt update && sudo apt install \
  pkg-config \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libglib2.0-dev
```

Notes:
- `libwebkit2gtk-4.1-dev` is preferred. If unavailable on your distro, `libwebkit2gtk-4.0-dev` may work.
- Our build scripts warn (but do not fail) if these are missing on APT-based systems.

## 🛠 Building and Releases

### Automated Builds via GitHub Actions

All builds are now handled automatically through GitHub Actions. No local compilation needed!

### Creating a Release

1. **Update Version**: Update version in `package.json` and `src-tauri/tauri.conf.json`
2. **Create Git Tag**: 
   ```bash
   git tag v0.0.7
   git push origin v0.0.7
   ```
3. **Automatic Build**: GitHub Actions will automatically build all platforms and create a release
4. **Manual Trigger**: You can also trigger builds manually from the GitHub Actions tab

### Local Development Build (Optional)

For development purposes only:

```bash
# Clone the repository
git clone https://github.com/LuminaKraft/LuminakraftLauncher.git
cd LuminakraftLauncher

# Install dependencies
npm install

# Build for current platform only (development)
npm run tauri build
```

> **Note**: Production releases should always use GitHub Actions for consistency and proper signing.

## 📋 Development

### Local Development
```bash
# Install dependencies
npm install

# Start development server
npm run tauri:dev

# Run with stable port (kills port 1420 first)
npm run tauri:dev-stable

# Lint code
npm run lint

# Clean build artifacts
npm run clean
```

### Project Structure
```
LuminakraftLauncher/
├── src/                    # React frontend source code
│   ├── components/         # UI components
│   ├── services/          # API and service layers
│   ├── types/             # TypeScript type definitions
│   ├── contexts/          # React contexts
│   ├── locales/           # Internationalization files
│   └── assets/            # Static assets
├── src-tauri/             # Tauri backend source code
│   ├── src/               # Rust source files
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
├── public/                # Static public assets
├── scripts/               # Build and utility scripts
├── docs/                  # Documentation
└── assets/                # Screenshots and images
```

## 🔧 Technical Details

### Architecture
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Rust + Tauri 2.5.1
- **Build System**: GitHub Actions with cross-platform compilation
- **Packaging**: Native installers (NSIS + MSI) + AppImage for Linux
- **Minecraft Library**: Lyceris for authentication and game management
- **UI Icons**: Lucide React for modern iconography
- **HTTP Client**: Axios (frontend) + Reqwest (backend)

### Key Libraries
- **Lyceris**: Minecraft launcher core functionality
- **Tauri**: Cross-platform app framework
- **React**: Frontend framework
- **Tailwind CSS**: Utility-first styling
- **i18next**: Internationalization
- **Lucide React**: Icon library

### Build Optimization
- Automated builds via GitHub Actions
- Cross-platform compilation without local Docker setup
- Optimized CI/CD pipeline for faster releases

## 🌍 Internationalization

LuminaKraft Launcher supports multiple languages:
- **English** (en) - Default
- **Spanish** (es) - Español

To contribute translations:
1. Check the `src/locales/` directory
2. Add or update translation files
3. Follow the existing key structure
4. Submit a pull request

## 📚 Documentation

- [Documentation Overview](docs/README.md) - Complete documentation guide
- [Release Workflow](docs/RELEASE_WORKFLOW.md) - Automated release process and workflow diagram
- [Testing Guide](docs/TESTING_GUIDE.md) - Testing procedures and quality assurance
- [Lyceris Integration](docs/LYCERIS_INTEGRATION_SUMMARY.md) - Core launcher library details
- [Contributing Guidelines](CONTRIBUTING.md) - How to contribute to the project
- [Code of Conduct](CODE_OF_CONDUCT.md) - Community guidelines

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Quick Start for Contributors
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following our [code style guidelines](CONTRIBUTING.md#code-style-and-formatting)
4. Test builds on your target platform
5. Commit your changes (`git commit -s -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Environment
- Follow our [Code of Conduct](CODE_OF_CONDUCT.md)
- Sign off your commits ([Developer Certificate of Origin](CONTRIBUTING.md#signing-your-work))
- Use conventional commit messages
- Test on multiple platforms when possible

## 🐛 Bug Reports & Feature Requests

Found a bug or have a feature request? Please check our [Issues page](https://github.com/LuminaKraft/LuminakraftLauncher/issues) and create a new issue if needed.

## 📄 License

This project is licensed under the **GNU General Public License v3.0** - see the [LICENSE](LICENSE) file for details.

### Third-Party Licenses
See [COPYING.md](COPYING.md) for detailed information about third-party dependencies and their licenses.

## 🏆 Acknowledgments

- **Lyceris Library**: Core Minecraft launcher functionality
- **Tauri Team**: Amazing cross-platform framework
- **React Community**: Excellent frontend ecosystem
- **Prism Launcher**: Inspiration for community guidelines
- **All Contributors**: Thank you for making this project better!

## 📞 Support

- 📖 **Documentation**: Check our [docs](docs/) directory
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/LuminaKraft/LuminakraftLauncher/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/LuminaKraft/LuminakraftLauncher/discussions)
- 🌐 **Website**: Coming soon!

---

**🎉 Ready for automated multi-platform distribution!** LuminaKraft Launcher builds automatically for Windows, macOS, and Linux via GitHub Actions with optimized CI/CD pipelines.

### 🔄 Automatic Updates System

LuminaKraft Launcher uses a **smart hybrid update system** that provides the best experience for both stable and experimental users:

- **📡 Intelligent Update Detection**: 
  - **Stable users**: Get only stable releases via Tauri's built-in updater
  - **Beta testers**: Get latest prereleases via GitHub API + automatic installation
- **🔐 Security**: All updates are cryptographically signed and verified by Tauri
- **🎯 Universal Installation**: Both stable and prereleases install automatically when possible
- **🧪 Beta Testing**: Users can opt-in to receive experimental prereleases (alpha/beta/rc)
- **⚡ Zero Maintenance**: GitHub Actions automatically updates manifests

**Update Flow:**
1. **Smart Detection**: Checks user settings to determine update channel
2. **Stable Channel**: Uses GitHub's `latest.json` **from the latest release assets**
3. **Prerelease Channel**: Uses repository `latest.json` (branch `main`) signed & updated automatically
4. **Automatic Installation**: Downloads, verifies signatures, installs, and restarts automatically
5. **Fallback Support**: Manual download only if the updater reports no downloadable package

<div align="center">
  <sub>Built with ❤️ by the LuminaKraft Studios team</sub>
</div>