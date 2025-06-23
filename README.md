# LuminaKraft Launcher 🚀

A modern, cross-platform Minecraft launcher built with Tauri and React, featuring automatic updates, Microsoft authentication, and modpack management using the Lyceris library.

## ✨ Features

- 🔐 **Microsoft Authentication**: Secure login with your Microsoft account
- 📦 **Modpack Management**: Browse and install modpacks from CurseForge
- 🔄 **Automatic Updates**: Self-updating launcher with seamless version management
- 🌍 **Multi-language Support**: Internationalization ready
- 🖥️ **Cross-Platform**: Available for Windows, macOS, and Linux
- ⚡ **Modern UI**: Beautiful, responsive interface built with React and Tailwind CSS

## 🎯 **Cross-Platform Build Success!**

All platforms now build successfully with optimized performance:

### ✅ **Supported Platforms**
- **Windows**: `.exe` executable + NSIS installer
- **macOS**: Universal DMG files (Intel + ARM64) + `.app` bundles  
- **Linux**: AppImage + .deb/.rpm packages + binary

### 📦 **Build Artifacts**
All build outputs are generated in the `dist/` directory:
```
dist/
├── LuminaKraft Launcher_0.0.5_x64-setup.exe          # Windows installer
├── luminakraft-launcher.exe                           # Windows executable
├── LuminaKraft Launcher_0.0.5_x64.dmg                # macOS Intel DMG
├── LuminaKraft Launcher_0.0.5_aarch64.dmg            # macOS ARM64 DMG
├── LuminaKraft Launcher_0.0.5_amd64.AppImage         # Linux AppImage (portable)
├── LuminaKraft Launcher_0.0.5_amd64.deb              # Linux Debian package
├── LuminaKraft Launcher-0.0.5-1.x86_64.rpm           # Linux RPM package
└── luminakraft-launcher                               # Linux binary
```

## 🛠 **Building from Source**

### Prerequisites
- **Node.js** 20+ and npm
- **Rust** 1.82.0+
- **Docker** (for Windows/Linux cross-compilation on macOS)

### Quick Build Commands

```bash
# Install dependencies
npm install

# Build for current platform only
npm run tauri build

# Build all platforms (fast mode - recommended for development)
bash scripts/build-all.sh all

# Build all platforms (with Docker cleanup - for first build or CI)
bash scripts/build-all.sh all --clean-docker

# Build specific platforms
bash scripts/build-macos.sh    # macOS (Intel + ARM64)
bash scripts/build-windows.sh  # Windows (via Docker)
bash scripts/build-linux.sh    # Linux AppImage (via Docker)
```

### 🚀 **Build Performance**

- **Fast Mode**: Skip Docker cleanup for 2-3x faster subsequent builds
- **Reliable Mode**: Full Docker cleanup for maximum compatibility
- **Memory Optimized**: Uses 6GB max memory with 2-core limits
- **Sequential Builds**: Prevents memory conflicts between platforms

## 📋 **Development**

### Local Development
```bash
npm install
npm run tauri dev
```

### Project Structure
```
src/                    # React frontend
├── components/         # UI components
├── services/          # API services
└── types/             # TypeScript definitions

src-tauri/             # Rust backend
├── src/               # Rust source code
└── tauri.conf.json    # Tauri configuration
```

## 🔧 **Technical Details**

### Architecture
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Rust + Tauri 2.5.1
- **Cross-compilation**: Docker + MinGW/GNU toolchains
- **Packaging**: Native installers + AppImage for Linux

### Memory Optimization
- Docker containers limited to 6GB RAM, 2 CPU cores
- Rust compilation optimized for memory efficiency
- Incremental builds for faster iteration

## 📚 **Documentation**

- [Complete Build Guide](docs/BUILD_SUCCESS_SUMMARY.md) - Comprehensive build documentation
- [Memory Optimization](docs/MEMORY_OPTIMIZATION_GUIDE.md) - Performance tuning details
- [Windows Build Success](docs/WINDOWS_BUILD_SUCCESS.md) - Windows-specific solutions

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test builds on your target platform
5. Submit a pull request

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**🎉 Ready for multi-platform distribution!** The launcher successfully builds for Windows, macOS, and Linux with optimized performance and automated build processes.
