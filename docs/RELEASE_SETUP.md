# 🚀 Release System for LuminaKraft Launcher

Complete guide for creating and managing releases of the LuminaKraft Launcher.

## 📋 Repository Architecture

### 🔒 Private Repository (Source Code)
- **Repository**: `kristiangarcia/luminakraft-launcher`
- **Content**: Complete source code, development, build workflows
- **Access**: Private (developers only)
- **Purpose**: Protect source code and execute builds

### 🌍 Public Repository (Distribution)
- **Repository**: `kristiangarcia/luminakraft-launcher-releases`
- **Content**: Releases, binaries, and user documentation only
- **Access**: Public (all users)
- **Purpose**: Public distribution of the launcher

### 💰 Hybrid Benefits
- **🔒 Security**: Source code remains private
- **💸 Cost**: Uses unlimited free GitHub Actions minutes on public repo
- **🚀 Efficiency**: Parallel builds on multiple platforms
- **👥 Community**: Users can report issues and download releases publicly

## 🎮 Release Commands

### 📋 Stable Releases
```bash
# Automatic version increments
npm run release:patch      # 0.3.1 → 0.3.2
npm run release:minor      # 0.3.1 → 0.4.0  
npm run release:major      # 0.3.1 → 1.0.0

# Specific version
npm run release:version 1.2.3     # Stable release v1.2.3
```

### 🧪 Pre-Releases
```bash
# Pre-releases with increments
npm run release:patch-pre     # Pre-release patch
npm run release:minor-pre     # Pre-release minor

# Pre-release with specific version
npm run release:pre 0.5.0                # Pre-release v0.5.0
npm run release:pre 1.0.0-alpha.1        # Pre-release v1.0.0-alpha.1
```

### 🛠️ Direct Commands (Advanced)
```bash
# Using the release script directly
node release.js 0.5.0                    # Stable (with confirmation)
node release.js 0.5.0 --prerelease       # Pre-release (with confirmation)
node release.js 0.5.0 --push             # Stable (auto-push)
node release.js 0.5.0 --prerelease --push # Pre-release (auto-push)

# Through npm with flags
npm run release -- 0.5.0 --prerelease    # Specific version pre-release
npm run release -- patch --push          # Auto-increment with push
```

### ⚡ Available Flags
- `--prerelease`: Mark release as pre-release
- `--push`: Auto-push without confirmation (for CI)

## 🏗️ Multi-Platform Workflow

### 📦 Automatic Builds
- **🪟 Windows**: MSI + NSIS installers
- **🐧 Linux**: DEB + RPM packages  
- **🍎 macOS**: DMG for ARM64 (Apple Silicon) + x86_64 (Intel)

### 🔄 Automatic Process
1. **Tag Detection**: Workflow triggers on `v*` tags
2. **Multi-Platform Build**: Parallel builds on 3 runners
3. **Dual Release**: Publishes to both public and private repositories
4. **Spanish Content**: Releases in Spanish with short format

## 📝 Release Content

### 🌍 Public Release (Spanish)
- Download instructions by platform
- Main launcher features
- Support links (Discord, Issues)
- Warnings for pre-releases

### 🔒 Private Release (Internal Tracking)
- Technical build information
- Links to public release
- Development team data

## ✅ Current System Status

- ✅ **Multi-Platform Workflow**: Complete setup
- ✅ **Dual Repository**: Public + private working
- ✅ **Manual Pre-release**: Control with `--prerelease` flag
- ✅ **Dynamic Versions**: Sidebar updates automatically
- ✅ **Spanish Content**: Short and clear releases
- ✅ **TOKEN Configured**: `PUBLIC_REPO_TOKEN` working

## 🔧 Technical Configuration

### 🔑 GitHub Secrets (Already Configured)
- `PUBLIC_REPO_TOKEN`: Token to write to public repo
- `TAURI_PRIVATE_KEY`: App signing (optional)
- `TAURI_KEY_PASSWORD`: Signing password (optional)

### 📋 Package.json Extensions
- `version`: Current version (auto-updated)
- `isPrerelease`: Flag for pre-releases

### 🔄 Auto-Version Updates
The release script automatically updates version in:
- `package.json`: Main version
- `src-tauri/Cargo.toml`: Rust version
- `src-tauri/tauri.conf.json`: Tauri configuration
- `src/components/Layout/Sidebar.tsx`: Version in Sidebar

## 🎯 Practical Examples

### 🚀 Stable Release
```bash
npm run release:version 1.0.0
# Result:
# - ✅ Stable release v1.0.0
# - 📦 All binaries generated
# - 🌍 Public release in Spanish
# - 🔒 Internal tracking
```

### 🧪 Pre-Release
```bash
npm run release:pre 1.1.0-beta.1
# Result:
# - 🧪 Pre-release v1.1.0-beta.1
# - ⚠️ Marked as pre-release on GitHub
# - 📝 Warnings in description
# - 🔍 Visible in releases but marked as experimental
```

### 📈 Automatic Increment
```bash
# If current version is 0.5.2
npm run release:minor-pre
# Result: Pre-release v0.6.0
```

## 🔄 Release Workflow

### 🏷️ **Complete Release** (Tag)

```
Developer creates tag v1.0.0
           ↓
push-to-public.yml executes
           ↓
Cleans sensitive files
           ↓
Push code to public repo
           ↓
Push tags to public repo
           ↓
Trigger build-release.yml
           ↓
Build on 4 parallel platforms
           ↓
Automatic release with assets
           ↓
Users can download
```

### 🔄 **Continuous Development** (Push to main)

```
Developer push to main
           ↓
push-to-public.yml executes
           ↓
Syncs code only
           ↓
test-build.yml verifies compilation
           ↓
No release generated
```

## 🛠️ Troubleshooting

### Common Issues

#### ❌ Build Cache Problems
**Solution**: Release script includes automatic cache cleaning
```bash
# Manual cache clean if needed
rm -rf src-tauri/target/release/bundle/
```

#### ❌ Version Conflicts in Releases
**Solution**: Implemented in GitHub Actions:
- Automatic cache cleaning before builds
- Version conflict detection
- Detailed debugging output

#### ❌ "Failed to trigger build workflow"
**Solution**: Verify workflow exists in public repo
```bash
curl -H "Authorization: token $TOKEN" \
     https://api.github.com/repos/kristiangarcia/luminakraft-launcher-releases/actions/workflows
```

#### ❌ 403 Error in Update Service
**Solution**: Update service now has fallback strategy to private repo

## 📊 Monitoring

### Metrics to Monitor
- ✅ **Sync Success Rate**: % of successful syncs
- ⏱️ **Build Time**: Average build time
- 📦 **Release Size**: Size of generated assets
- 🔄 **Sync Frequency**: Frequency of synchronizations

### Configured Alerts
- 🚨 Automatic sync failure
- ⚠️ Build time > 30 minutes
- 📧 Draft release generated (notification)

## 🔗 Important Links

- **🔨 GitHub Actions**: https://github.com/kristiangarcia/luminakraft-launcher/actions
- **📦 Public Releases**: https://github.com/kristiangarcia/luminakraft-launcher-releases/releases
- **🔒 Private Releases**: https://github.com/kristiangarcia/luminakraft-launcher/releases

## 📋 Maintenance Commands

### 🗑️ Clean Tags
```bash
# Delete all local tags
git tag | xargs git tag -d

# Delete remote tags (careful!)
git push origin --delete $(git tag -l)
```

### 🔍 Verify Status
```bash
# View current tags
git tag -l

# View last commit
git log --oneline -1

# View remote configuration
git remote -v
```

## 🚀 Quick Start

For most releases, use these commands:

```bash
# Development/testing
npm run release:minor-pre    # New features (pre-release)
npm run release:patch-pre    # Bug fixes (pre-release)

# Production releases
npm run release:minor        # New features (stable)
npm run release:patch        # Bug fixes (stable)
npm run release:major        # Major changes (stable)
```

---

**🎉 System fully operational and ready for production use!** 