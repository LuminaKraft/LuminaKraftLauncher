# 🔨 Cross-Compilation Guide for LuminaKraft Launcher

This guide explains how to build the LuminaKraft Launcher for multiple platforms using Docker from macOS.

## 🚀 Quick Start

The simplest way to build for all platforms:

```bash
# Build for all platforms
npm run release -- <version> [--prerelease]

# Or use individual build scripts
bash scripts/build-windows.sh    # Windows (MSI + NSIS)
bash scripts/build-linux.sh      # Linux (DEB + RPM)
bash scripts/build-macos.sh      # macOS (DMG + APP)
```

## 📋 Prerequisites

- **macOS** (Intel or Apple Silicon)
- **Docker Desktop** installed and running
- **Node.js 20+** and npm
- **Rust** and Cargo (for local macOS builds)

## 🏗️ Build Architecture

The project uses **Docker-based cross-compilation** for reliable builds:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   macOS (Host)  │    │  Docker Windows  │    │  Docker Linux   │
│                 │    │                  │    │                 │
│ • Native Build  │    │ • MinGW-w64      │    │ • Ubuntu 22.04  │
│ • Rust + Cargo  │    │ • Node.js 20     │    │ • GTK + WebKit  │
│ • DMG + APP     │    │ • NSIS + WiX     │    │ • pkg-config    │
│                 │    │ • MSI + EXE      │    │ • DEB + RPM     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🪟 Windows Cross-Compilation

### Build Process
   ```bash
bash scripts/build-windows.sh
```

**What it does:**
1. Uses `docker/Dockerfile.windows-builder`
2. Sets up MinGW-w64 cross-compilation environment
3. Installs NSIS and WiX toolset for installers
4. Builds both MSI and NSIS installers
5. Outputs to `src-tauri/target/x86_64-pc-windows-gnu/release/bundle/`

### Key Components
- **MinGW-w64**: Cross-compiler for Windows
- **NSIS**: Creates `.exe` installers
- **WiX**: Creates `.msi` packages
- **liblzma**: Compression library (auto-configured)

## 🐧 Linux Cross-Compilation

### Build Process
```bash
bash scripts/build-linux.sh
```

**What it does:**
1. Uses `docker/Dockerfile.linux-builder`
2. Sets up Ubuntu 22.04 with GTK dependencies
3. Installs both DEB and RPM packaging tools
4. Builds both DEB and RPM packages
5. Outputs to `src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/`

### Key Components
- **Ubuntu 22.04**: Base Linux environment
- **GTK 3**: UI framework dependencies
- **WebKit2GTK**: Web engine for Tauri
- **pkg-config**: Library configuration
- **rpm**: RPM package creation

## 🍎 macOS Native Compilation

### Build Process
   ```bash
bash scripts/build-macos.sh
```

**What it does:**
1. Native compilation on macOS
2. Builds for both Intel (x64) and Apple Silicon (aarch64)
3. Creates DMG and APP bundles
4. Uses system Rust and Xcode tools

## 🛠️ Troubleshooting

### Common Issues and Solutions

#### ❌ "rustc interrupted by SIGBUS"
**Cause**: Memory issues during cross-compilation on ARM Macs

**Solution**: 
- Docker containers now use memory limits (`-m 4g --memory-swap 6g`)
- Optimized Rust compilation flags in `.cargo/config.toml`
- Use specific Rust version (1.76.0) for stability

#### ❌ "pkg-config has not been configured to support cross-compilation"
**Cause**: Missing cross-compilation configuration for Linux

**Solution**: 
- Linux Dockerfile includes proper pkg-config setup
- Environment variables configured automatically
- `.cargo/config.toml` includes cross-compilation settings

#### ❌ "Cannot connect to the Docker daemon"
**Solution**: Ensure Docker Desktop is running

#### ❌ "No space left on device"
**Solution**: Clean Docker cache:
```bash
docker system prune -a
```

#### ❌ "The package does not contain this feature: custom-protocol"
**Solution**: Don't use `--features` flags - they're configured in `tauri.conf.json`

#### ❌ HTTP 503 errors (NSIS dependencies)
**Solution**: 
```bash
npm run download-nsis  # Pre-download NSIS dependencies
```

## ⚙️ Configuration Files

### Bundle Configuration
Tauri automatically selects appropriate bundle types based on the target platform:

- **Linux**: DEB, RPM, and AppImage packages (DEB/RPM succeed, AppImage may fail in Docker)
- **Windows**: NSIS installer (.exe) when cross-compiling
  - *Note: MSI requires native Windows build with WiX Toolset*
- **macOS**: DMG and APP bundles (native builds)

The `tauri.conf.json` uses `"targets": "all"` to allow all bundle types, and build scripts use `--target` to specify the platform without bundle restrictions.

### Cross-Compilation Settings (`src-tauri/.cargo/config.toml`)
```toml
[target.x86_64-pc-windows-gnu]
linker = "x86_64-w64-mingw32-gcc"

[target.x86_64-unknown-linux-gnu]
linker = "x86_64-linux-gnu-gcc"

[env]
CARGO_NET_GIT_FETCH_WITH_CLI = "true"
PKG_CONFIG_ALLOW_CROSS = "1"
```

## 🚀 Release Integration

The cross-compilation system integrates with the release process:

1. **Local Development**: Use individual build scripts
2. **Release Process**: `npm run release` builds all platforms automatically
3. **GitHub Actions**: Automated builds triggered by version tags
4. **Output**: Ready-to-distribute packages for all platforms

## 📦 Build Outputs

After successful builds, you'll find:

**Windows**: `src-tauri/target/x86_64-pc-windows-gnu/release/bundle/`
- `msi/LuminaKraft Launcher_X.Y.Z_x64_en-US.msi`
- `nsis/LuminaKraft Launcher_X.Y.Z_x64-setup.exe`

**Linux**: `src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/`
- `deb/luminakraft-launcher_X.Y.Z_amd64.deb`
- `rpm/luminakraft-launcher-X.Y.Z-1.x86_64.rpm`

**macOS**: `src-tauri/target/{arch}/release/bundle/`
- `dmg/LuminaKraft Launcher_X.Y.Z_{arch}.dmg`
- `macos/LuminaKraft Launcher.app` (zipped for distribution)

## 💡 Best Practices

1. **Clean builds**: Always clean cache between version changes
2. **Memory management**: Use Docker memory limits on ARM Macs
3. **Dependency caching**: Mount `.tauri` directory for faster rebuilds
4. **Version consistency**: Let the release script manage version updates
5. **Testing**: Use fast test workflows before full releases

## 🪟 MSI Installer Generation (Advanced)

**Current Limitation**: Cross-compilation produces NSIS installers only.

**For MSI installers, you need a native Windows environment:**

### Option 1: Windows Machine
```bash
# Install WiX Toolset on Windows
npm run tauri build -- --bundles msi,nsis
```

### Option 2: GitHub Actions (Recommended)
```yaml
- name: Build Windows MSI
  if: matrix.platform == 'windows-latest'
  run: npm run tauri build -- --bundles msi,nsis
```

### Why Cross-Compilation Can't Generate MSI:
- **MSI format** requires WiX Toolset integration
- **WiX Toolset** is Windows-specific and doesn't work in Linux containers  
- **MinGW target** (`x86_64-pc-windows-gnu`) produces executables, not installers
- **NSIS works** because it's available on Linux and cross-platform

**🎯 Current Solution**: NSIS installer provides excellent Windows compatibility and user experience.

---

**🎯 Result**: Cross-platform builds that work reliably from macOS, producing native packages for Windows, Linux, and macOS users. 