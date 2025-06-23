#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

// Load environment variables from .env
const dotenvResult = dotenv.config();
if (dotenvResult.error) {
  console.log(`\x1b[33m ⚠️  No .env file found, using system environment variables if available.\x1b[0m`);
} else {
  console.log(`\x1b[32m ✅  .env file loaded successfully.\x1b[0m`);
}

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Check for GitHub token
const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  log('❌ ERROR: GitHub token not found in environment variables.', 'red');
  log('ℹ️  Make sure to create a .env file with GITHUB_TOKEN=your_personal_token', 'yellow');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PUBLIC_REPO_OWNER = 'kristiangarcia';
const PUBLIC_REPO_NAME = 'luminakraft-launcher-releases';
const PRIVATE_REPO_OWNER = 'kristiangarcia';
const PRIVATE_REPO_NAME = 'luminakraft-launcher';

// Check if a version was provided as argument
const versionArgIndex = process.argv.findIndex(arg => arg.match(/^\d+\.\d+\.\d+/));
if (versionArgIndex === -1) {
  log('❌ ERROR: No version argument provided', 'red');
  log('ℹ️  Usage: npm run release -- X.Y.Z [--prerelease]', 'yellow');
  process.exit(1);
}

const newVersion = process.argv[versionArgIndex];
const isPrerelease = process.argv.includes('--prerelease');
const forceFlag = process.argv.includes('--force');

log(`🚀 Starting release process v${newVersion}${isPrerelease ? ' (pre-release)' : ''}...`, 'cyan');

// Create GitHub API client
const octokit = new Octokit({
  auth: githubToken
});

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return packageJson.version;
}

function updateVersion(newVersion, isPrerelease = false) {
  const numericVersion = newVersion.match(/^\d+\.\d+\.\d+/)[0];
  const files = [
    {
      path: 'package.json',
      update: (content) => {
        const pkg = JSON.parse(content);
        pkg.version = numericVersion;
        pkg.isPrerelease = isPrerelease;
        return JSON.stringify(pkg, null, 2);
      }
    },
    {
      path: 'src-tauri/tauri.conf.json',
      update: (content) => {
        const config = JSON.parse(content);
        config.version = numericVersion;
        return JSON.stringify(config, null, 2);
      }
    },
    {
      path: 'src-tauri/Cargo.toml',
      update: (content) => {
        return content.replace(/version\s*=\s*".*?"/, `version = "${numericVersion}"`);
      }
    },
    {
      path: 'src/components/Layout/Sidebar.tsx',
      update: (content) => {
        return content.replace(/const\s+currentVersion\s*=\s*".*?"/, `const currentVersion = "${newVersion}"`);
      }
    }
  ];

  log(`📝 Updating version to ${newVersion}${isPrerelease ? ' (pre-release)' : ''} in all files...`, 'cyan');
  
  files.forEach(file => {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const updatedContent = file.update(content);
      fs.writeFileSync(file.path, updatedContent);
      log(`  ✅ Updated ${file.path}`, 'green');
    } catch (error) {
      log(`  ❌ Error updating ${file.path}: ${error.message}`, 'red');
      process.exit(1);
    }
  });
}

// Create a Git commit and tag for the release
function createGitCommit(version, isPrerelease) {
  log('📝 Creating Git commit and tag...', 'cyan');
  try {
    // Add all modified files
    execSync('git add .', { stdio: 'inherit' });
    
    // Create commit
    const commitMessage = `Release v${version}${isPrerelease ? ' (pre-release)' : ''}`;
    execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
    
    // Create tag
    const tagName = `v${version}`;
    const tagMessage = `Version ${version}${isPrerelease ? ' (pre-release)' : ''}`;
    execSync(`git tag -f -a ${tagName} -m "${tagMessage}"`, { stdio: 'inherit' });
    
    log('✅ Git commit and tag created successfully', 'green');
    return true;
  } catch (error) {
    log(`❌ Error creating Git commit: ${error.message}`, 'red');
    return false;
  }
}

// Push changes and tags to remote repository
function pushToGitRemote() {
  log('🚀 Pushing changes to remote repository...', 'cyan');
  try {
    // Push commits
    execSync('git push', { stdio: 'inherit' });
    
    // Push tags
    execSync('git push --tags --force', { stdio: 'inherit' });
    
    log('✅ Changes pushed to remote successfully', 'green');
    return true;
  } catch (error) {
    log(`❌ Error pushing to remote: ${error.message}`, 'red');
    return false;
  }
}

function validateVersion(version) {
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;
  if (!semverRegex.test(version)) {
    log(`❌ Formato de versión inválido: ${version}`, 'red');
    log(`   Formato esperado: X.Y.Z o X.Y.Z-suffix (ej: 1.0.0-beta.1)`, 'yellow');
    process.exit(1);
  }
}

function cleanBuildCache() {
  log('🧹 Limpiando caché de builds anteriores...', 'cyan');
  try {
    const bundlePaths = [
      'src-tauri/target/release/bundle',
      'src-tauri/target/debug/bundle'
    ];

    bundlePaths.forEach(bundlePath => {
      if (fs.existsSync(bundlePath)) {
        fs.rmSync(bundlePath, { recursive: true, force: true });
        log(`  ✅ Eliminado: ${bundlePath}`, 'green');
      }
    });
  } catch (error) {
    log(`  ⚠️ Error al limpiar caché: ${error.message}`, 'yellow');
  }
}

function cleanDuplicateInstallers() {
  log('🧹 Cleaning duplicate installer files...', 'cyan');
  try {
    const nsisPath = 'src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis';
    
    if (fs.existsSync(nsisPath)) {
      const files = fs.readdirSync(nsisPath).filter(f => f.endsWith('.exe'));
      const duplicates = files.filter(f => / \d+\.exe$/.test(f));
      
      duplicates.forEach(duplicate => {
        const fullPath = path.join(nsisPath, duplicate);
        try {
          fs.unlinkSync(fullPath);
          log(`  🗑️ Removed duplicate: ${duplicate}`, 'green');
        } catch (error) {
          log(`  ⚠️ Could not remove ${duplicate}: ${error.message}`, 'yellow');
        }
      });
      
      if (duplicates.length === 0) {
        log('  ✅ No duplicate installers found', 'green');
      } else {
        log(`  ✅ Cleaned ${duplicates.length} duplicate installer(s)`, 'green');
      }
    }
    
    // Clean duplicate macOS .app files
    const macOSPaths = [
      'src-tauri/target/x86_64-apple-darwin/release/bundle/macos',
      'src-tauri/target/aarch64-apple-darwin/release/bundle/macos'
    ];
    
    macOSPaths.forEach(macOSPath => {
      if (fs.existsSync(macOSPath)) {
        const appFiles = fs.readdirSync(macOSPath).filter(f => f.endsWith('.app'));
        const duplicateApps = appFiles.filter(f => / \d+\.app$/.test(f));
        
        duplicateApps.forEach(duplicate => {
          const fullPath = path.join(macOSPath, duplicate);
          try {
            fs.rmSync(fullPath, { recursive: true, force: true });
            log(`  🗑️ Removed duplicate app: ${duplicate}`, 'green');
          } catch (error) {
            log(`  ⚠️ Could not remove ${duplicate}: ${error.message}`, 'yellow');
          }
        });
      }
    });
    
  } catch (error) {
    log(`  ⚠️ Error cleaning duplicates: ${error.message}`, 'yellow');
  }
}

function buildApp() {
  log('🔨 Building the application...', 'cyan');
  try {
    // Install dependencies if needed
    if (!fs.existsSync('node_modules')) {
      log('📦 Installing dependencies...', 'cyan');
      execSync('npm install', { stdio: 'inherit' });
    }

    // Clean cache before building
    cleanBuildCache();
    
    // Use the build-all.sh script to build for all platforms
    log('🔨 Running build-all.sh script...', 'cyan');
    execSync('bash scripts/build-all.sh all', { stdio: 'inherit' });
    log('✅ Build completed successfully', 'green');
    
    // Clean up duplicate installer files after build
    cleanDuplicateInstallers();
  } catch (error) {
    log(`❌ Build error: ${error.message}`, 'red');
    throw error;
  }
}

function getInstallerFiles() {
  const installers = [];
  const version = getCurrentVersion();
  
  // Define the base tauri directory
  const tauriDir = path.join(process.cwd(), 'src-tauri');
  
  // Helper function to find Windows files
  function findWindowsFiles(basePath) {
    const windowsFiles = [];
    const nsisDir = path.join(basePath, 'bundle', 'nsis');
    
    if (fs.existsSync(nsisDir)) {
      const nsisFiles = fs.readdirSync(nsisDir).filter(f => f.endsWith('.exe'));
      
      // Filter out numbered duplicates - prefer the original file without numbers
      const filteredFiles = [];
      const seenBaseNames = new Set();
      
      // Sort files so non-numbered versions come first
      const sortedFiles = nsisFiles.sort((a, b) => {
        const aHasNumber = / \d+\.exe$/.test(a);
        const bHasNumber = / \d+\.exe$/.test(b);
        
        if (aHasNumber && !bHasNumber) return 1;  // b comes first
        if (!aHasNumber && bHasNumber) return -1; // a comes first
        return a.localeCompare(b); // alphabetical for same type
      });
      
      for (const file of sortedFiles) {
        // Extract base name without numbered suffix
        const baseName = file.replace(/ \d+\.exe$/, '.exe');
        
        // Only keep the first occurrence (which will be the non-numbered version)
        if (!seenBaseNames.has(baseName)) {
          seenBaseNames.add(baseName);
          filteredFiles.push(file);
        } else {
          log(`  ⚠️ Skipping duplicate: ${file} (keeping original version)`, 'yellow');
        }
      }
      
      for (const file of filteredFiles) {
        windowsFiles.push({
          type: 'file',
          path: path.join(nsisDir, file),
          name: file
        });
      }
      
      log(`  📦 Found ${filteredFiles.length} NSIS installer(s) for Windows (${nsisFiles.length - filteredFiles.length} duplicates filtered)`, 'cyan');
    }
    
    // Note: MSI files are not generated during cross-compilation
    // They require native Windows build environment with WiX Toolset
    
    return windowsFiles;
  }
  
  // Helper function to find Linux files
  function findLinuxFiles(basePath) {
    const linuxFiles = [];
    const debianDir = path.join(basePath, 'bundle', 'deb');
    const rpmDir = path.join(basePath, 'bundle', 'rpm');
    
    // Find DEB files
    if (fs.existsSync(debianDir)) {
      const debFiles = fs.readdirSync(debianDir).filter(f => f.endsWith('.deb'));
      for (const file of debFiles) {
        linuxFiles.push({
          type: 'file',
          path: path.join(debianDir, file),
          name: file
        });
      }
      log(`  📦 Found ${debFiles.length} DEB files for Linux`, 'cyan');
    }
    
    // Find RPM files
    if (fs.existsSync(rpmDir)) {
      const rpmFiles = fs.readdirSync(rpmDir).filter(f => f.endsWith('.rpm'));
      for (const file of rpmFiles) {
        linuxFiles.push({
          type: 'file',
          path: path.join(rpmDir, file),
          name: file
        });
      }
      log(`  📦 Found ${rpmFiles.length} RPM files for Linux`, 'cyan');
    }

    // Find AppImage files in dist directory
    const distDir = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      const appImageFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.AppImage'));
      for (const file of appImageFiles) {
        linuxFiles.push({
          type: 'file',
          path: path.join(distDir, file),
          name: file
        });
      }
      log(`  📦 Found ${appImageFiles.length} AppImage files for Linux`, 'cyan');
    }
    
    // Also check the dist/linux directories for packages
    const distDebDir = path.join(process.cwd(), 'dist', 'linux', 'deb');
    if (fs.existsSync(distDebDir)) {
      const distDebFiles = fs.readdirSync(distDebDir).filter(f => f.endsWith('.deb'));
      for (const file of distDebFiles) {
        linuxFiles.push({
          type: 'file',
          path: path.join(distDebDir, file),
          name: file
        });
      }
      log(`  📦 Found ${distDebFiles.length} DEB files in dist/linux/deb`, 'cyan');
    }
    
    const distRpmDir = path.join(process.cwd(), 'dist', 'linux', 'rpm');
    if (fs.existsSync(distRpmDir)) {
      const distRpmFiles = fs.readdirSync(distRpmDir).filter(f => f.endsWith('.rpm'));
      for (const file of distRpmFiles) {
        linuxFiles.push({
          type: 'file',
          path: path.join(distRpmDir, file),
          name: file
        });
      }
      log(`  📦 Found ${distRpmFiles.length} RPM files in dist/linux/rpm`, 'cyan');
    }
    
    return linuxFiles;
  }
  
  // Helper function to find macOS files
  function findMacOSFiles(basePath, arch) {
    const macosFiles = [];
    const dmgDir = path.join(basePath, 'bundle', 'dmg');
    const macosDir = path.join(basePath, 'bundle', 'macos');
    
    // Find DMG files
    if (fs.existsSync(dmgDir)) {
      const dmgFiles = fs.readdirSync(dmgDir).filter(f => f.endsWith('.dmg'));
      for (const file of dmgFiles) {
        macosFiles.push({
          type: 'file',
          path: path.join(dmgDir, file),
          name: file
        });
      }
      log(`  📦 Found ${dmgFiles.length} DMG files for macOS ${arch}`, 'cyan');
    }
    
    // Find APP files to zip
    if (fs.existsSync(macosDir)) {
      const appFiles = fs.readdirSync(macosDir).filter(f => f.endsWith('.app'));
      
      // Filter out numbered duplicates - prefer the original file without numbers
      const filteredAppFiles = [];
      const seenBaseNames = new Set();
      
      // Sort files so non-numbered versions come first
      const sortedAppFiles = appFiles.sort((a, b) => {
        const aHasNumber = / \d+\.app$/.test(a);
        const bHasNumber = / \d+\.app$/.test(b);
        
        if (aHasNumber && !bHasNumber) return 1;  // b comes first
        if (!aHasNumber && bHasNumber) return -1; // a comes first
        return a.localeCompare(b); // alphabetical for same type
      });
      
      for (const appFile of sortedAppFiles) {
        if (appFile.startsWith("LuminaKraft")) {
          // Extract base name without numbered suffix
          const baseName = appFile.replace(/ \d+\.app$/, '.app');
          
          // Only keep the first occurrence (which will be the non-numbered version)
          if (!seenBaseNames.has(baseName)) {
            seenBaseNames.add(baseName);
            filteredAppFiles.push(appFile);
          } else {
            log(`  ⚠️ Skipping duplicate app: ${appFile} (keeping original version)`, 'yellow');
          }
        }
      }
      
      for (const appFile of filteredAppFiles) {
        const appNameWithoutExt = appFile.replace('.app', '');
        const formattedName = `${appNameWithoutExt}_${version}_${arch}.app.zip`;
        
        macosFiles.push({
          isApp: true,
          originalPath: path.join(macosDir, appFile),
          formattedName
        });
      }
    }
    
    return macosFiles;
  }
  
  log('🔍 Searching for build artifacts...', 'cyan');
  
  // Define paths for all architectures
  const paths = {
    windows: path.join(tauriDir, 'target', 'x86_64-pc-windows-gnu', 'release'),
    linux: path.join(tauriDir, 'target', 'x86_64-unknown-linux-gnu', 'release'),
    macosIntel: path.join(tauriDir, 'target', 'x86_64-apple-darwin', 'release'),
    macosArm: path.join(tauriDir, 'target', 'aarch64-apple-darwin', 'release')
  };
  
  // Check Windows files
  log('🔍 Looking for Windows artifacts...', 'cyan');
  if (fs.existsSync(paths.windows)) {
    const windowsFiles = findWindowsFiles(paths.windows);
        installers.push(...windowsFiles);
      } else {
    log('  ⚠️ Windows build directory not found', 'yellow');
      }
  
  // Check Linux files
  log('🔍 Looking for Linux artifacts...', 'cyan');
  if (fs.existsSync(paths.linux)) {
    const linuxFiles = findLinuxFiles(paths.linux);
    installers.push(...linuxFiles);
    } else {
    log('  ⚠️ Linux build directory not found', 'yellow');
    }
    
  // Check macOS Intel files
  log('🔍 Looking for macOS Intel artifacts...', 'cyan');
  if (fs.existsSync(paths.macosIntel)) {
    const macosIntelFiles = findMacOSFiles(paths.macosIntel, 'x64');
    installers.push(...macosIntelFiles);
      } else {
    log('  ⚠️ macOS Intel build directory not found', 'yellow');
      }
  
  // Check macOS ARM files
  log('🔍 Looking for macOS ARM artifacts...', 'cyan');
  if (fs.existsSync(paths.macosArm)) {
    const macosArmFiles = findMacOSFiles(paths.macosArm, 'aarch64');
    installers.push(...macosArmFiles);
    } else {
    log('  ⚠️ macOS ARM build directory not found', 'yellow');
  }
  
  log(`📦 Total: ${installers.length} files to upload`, 'cyan');
  return installers;
}

// Define the artifacts path
const ARTIFACTS_PATH = path.join(process.cwd(), 'src-tauri/target/release');

// Helper to find a release by tag even if tag ref is missing (or turned draft)
async function findReleaseByTagSafe(octokit, owner, repo, tag) {
  try {
    const { data } = await octokit.repos.getReleaseByTag({ owner, repo, tag });
    return data;
  } catch {
    // Fallback: iterate releases and drafts
    const { data: releases } = await octokit.repos.listReleases({ owner, repo, per_page: 100 });
    return releases.find(r => r.tag_name === tag);
  }
}

async function publishToPublic(version, isPrerelease, forceFlag, octokit) {
  log(`📦 Publishing v${version}${isPrerelease ? ' (pre-release)' : ''} to public repo...`, 'cyan');
  
  try {
    // Check if release/tag exists
    const existingRelease = await findReleaseByTagSafe(octokit, PUBLIC_REPO_OWNER, PUBLIC_REPO_NAME, `v${version}`);
    const releaseExists = Boolean(existingRelease);
    const existingReleaseId = existingRelease?.id;
    
    // Initialize variables
    let release;
    let existingAssets = [];
    
    if (releaseExists) {
      log('🔍 Found existing release with same version', 'yellow');
      
      // Get list of existing assets
      const { data: assets } = await octokit.repos.listReleaseAssets({
        owner: PUBLIC_REPO_OWNER,
        repo: PUBLIC_REPO_NAME,
        release_id: existingReleaseId
      });
      
      existingAssets = assets;
      log(`📋 Existing release has ${assets.length} uploaded files`, 'yellow');
      
      // Use existing release
      release = existingRelease;
    } else {
      // Create new release
      log('🔄 Creating new release on GitHub...', 'cyan');
      
      const { data: newRelease } = await octokit.repos.createRelease({
        owner: PUBLIC_REPO_OWNER,
        repo: PUBLIC_REPO_NAME,
        tag_name: `v${version}`,
        name: `🚀 LuminaKraft Launcher v${version}${isPrerelease ? ' (Pre-release)' : ''}`,
        body: `## 📥 Instrucciones de Descarga

${isPrerelease ? '🧪 **Versión Pre-Release** - Esta es una versión de prueba con características experimentales' : '🎉 **Versión Estable** - Versión lista para producción'}

### 🪟 **Windows**
- **NSIS Installer** (\`*.exe\`) - Recomendado (instalador universal)

### 🐧 **Linux**
- **AppImage** (\`*.AppImage\`) - Portable executable (recommended)
- **DEB Package** (\`*.deb\`) - Debian/Ubuntu/Mint
- **RPM Package** (\`*.rpm\`) - Red Hat/Fedora/openSUSE

### 🍎 **macOS**
- **Apple Silicon DMG** (\`*_aarch64.dmg\`) - Para M1/M2/M3/M4
- **Apple Silicon APP** (\`*_aarch64.app.zip\`) - Versión portátil para ARM (aplicación .app comprimida)
- **Intel Mac DMG** (\`*_x64.dmg\`) - Para Macs Intel
- **Intel Mac APP** (\`*_x64.app.zip\`) - Versión portátil para Intel (aplicación .app comprimida)

## 🔗 Enlaces
- 💬 **Discord**: [Únete a nuestra comunidad](https://discord.gg/UJZRrcUFMj)
- 🐛 **Reportar bugs**: [GitHub Issues](https://github.com/kristiangarcia/luminakraft-launcher-releases/issues)

${isPrerelease ? '⚠️ **Advertencia**: Esta versión puede contener errores. Úsala bajo tu propio riesgo.' : '✅ **Versión estable y recomendada para todos los usuarios.**'}`,
        draft: false,
        prerelease: isPrerelease
      });
      
      release = newRelease;
    }

    // Get list of installers
    log('📄 Preparing installers...', 'cyan');
    const installers = getInstallerFiles();
      
    if (installers.length === 0) {
      throw new Error('No installers found to publish');
    }

    // Upload files to the release
    log('📤 Uploading files to release...', 'cyan');
    let uploadedCount = 0;
    let replacedCount = 0;
    
    for (const installer of installers) {
      // Handle .app files (special format for macOS)
      if (installer.isApp) {
        const filePath = installer.originalPath;
        const zipFileName = installer.formattedName;
        
        log(`  📦 Uploading ${path.basename(filePath)} as ${zipFileName}...`, 'cyan');
        
        // Check if file already exists in the release
        const existingAsset = existingAssets.find(asset => asset.name === zipFileName);
        if (existingAsset) {
          // Delete existing asset
          log(`  🗑️ Deleting existing asset: ${zipFileName}`, 'yellow');
          await octokit.repos.deleteReleaseAsset({
            owner: PUBLIC_REPO_OWNER,
            repo: PUBLIC_REPO_NAME,
            asset_id: existingAsset.id
          });
          replacedCount++;
        }
        
        // Create a temporary .zip file from the .app directory
        const zipFilePath = path.join(os.tmpdir(), `temp_app_upload_${Date.now()}.zip`);
        
        try {
          // Compress the .app into a .zip
          log(`  📦 Compressing ${path.basename(filePath)}...`, 'cyan');
          execSync(`cd "${path.dirname(filePath)}" && zip -r "${zipFilePath}" "${path.basename(filePath)}"`, { stdio: 'inherit' });
          
          // Upload the .zip with the formatted name
          await octokit.repos.uploadReleaseAsset({
            owner: PUBLIC_REPO_OWNER,
            repo: PUBLIC_REPO_NAME,
            release_id: release.id,
            name: zipFileName,
            data: fs.readFileSync(zipFilePath)
          });
          
          // Clean up temporary zip file
          if (fs.existsSync(zipFilePath)) {
            fs.unlinkSync(zipFilePath);
          }
          
          log(`  ✅ Uploaded: ${zipFileName}`, 'green');
          uploadedCount++;
        } catch (error) {
          log(`  ❌ Error processing .app: ${error.message}`, 'red');
        }
      } else if (installer.type === 'file') {
        // Normal files (DMG, etc)
        const filePath = installer.path;
        const fileName = installer.name;
        
        // Check if file already exists in the release
        const existingAsset = existingAssets.find(asset => asset.name === fileName);
        if (existingAsset) {
          // Delete existing asset
          log(`  🗑️ Deleting existing asset: ${fileName}`, 'yellow');
          await octokit.repos.deleteReleaseAsset({
            owner: PUBLIC_REPO_OWNER,
            repo: PUBLIC_REPO_NAME,
            asset_id: existingAsset.id
          });
          replacedCount++;
        }
        
        log(`  📦 Uploading ${fileName}...`, 'cyan');
        try {
          await octokit.repos.uploadReleaseAsset({
            owner: PUBLIC_REPO_OWNER,
            repo: PUBLIC_REPO_NAME,
            release_id: release.id,
            name: fileName,
            data: fs.readFileSync(filePath)
          });
          log(`  ✅ Uploaded: ${fileName}`, 'green');
          uploadedCount++;
        } catch (error) {
          log(`  ❌ Error uploading ${fileName}: ${error.message}`, 'red');
        }
      }
    }
    
    log(`\n✨ Release v${version}${isPrerelease ? ' (pre-release)' : ''} updated!`, 'green');
    log('📝 Summary:', 'cyan');
    log(`  • ${uploadedCount} files uploaded`, 'green');
    log(`  • ${replacedCount} files replaced`, 'yellow');
    log(`  • Release ${releaseExists ? 'updated' : 'created'} on GitHub`, 'green');
    log(`  • URL: ${release.html_url}`, 'green');

    return release;
    
  } catch (error) {
    log(`❌ Error publishing to public repo: ${error.message}`, 'red');
    throw error;
  }
}

async function publishToPrivate(version, isPrerelease, publicReleaseUrl, forceFlag, octokit) {
    log(`📝 Creating/updating informational release in private repo...`, 'cyan');
    try {
        const commitHash = execSync('git rev-parse HEAD').toString().trim();
        const platform = os.platform();

        // Get platform-specific build info
        const platformInfo = {
            win32: "Windows",
            linux: "Linux",
            darwin: "macOS"
        };
        
        // Check if release already exists
        const existingRelease = await findReleaseByTagSafe(octokit, PRIVATE_REPO_OWNER, PRIVATE_REPO_NAME, `v${version}`);
        const releaseExists = Boolean(existingRelease);
        
        // Check if build-all.sh was used by looking at command line args or environment
        const buildAllUsed = process.argv.includes('build-all') || 
                           process.env.BUILD_ALL === 'true' ||
                           fs.existsSync('src-tauri/target/x86_64-pc-windows-gnu') &&
                           fs.existsSync('src-tauri/target/x86_64-unknown-linux-gnu') &&
                           fs.existsSync('src-tauri/target/x86_64-apple-darwin');
        
        // Generate build status based on current platform or build-all usage
        let buildsCompleted = '';
        
        // Generate build status for all platforms
        const buildStatus = {
            windows: '❌ **Windows**: Not built',
            linux: '❌ **Linux**: Not built', 
            macos: '❌ **macOS**: Not built'
        };
        
        // If build-all was used, mark all platforms as completed
        if (buildAllUsed) {
            buildStatus.windows = '✅ **Windows**: NSIS Installer';
            buildStatus.linux = '✅ **Linux**: AppImage + DEB + RPM';
            buildStatus.macos = '✅ **macOS**: DMG + APP (Apple Silicon + Intel)';
        } else {
            // Individual platform builds
            if (platform === 'win32') buildStatus.windows = '✅ **Windows**: NSIS Installer';
            if (platform === 'linux') buildStatus.linux = '✅ **Linux**: AppImage + DEB + RPM';
            if (platform === 'darwin') buildStatus.macos = '✅ **macOS**: DMG + APP (Apple Silicon + Intel)';
        }
            
        // Combine build statuses
        buildsCompleted = `- ${buildStatus.windows}\n- ${buildStatus.linux}\n- ${buildStatus.macos}`;

        const body = `## 🔗 **Public Release**
**🌐 Download**: ${publicReleaseUrl}

## 🏗️ **Build Info**
- **Version**: \`${version}\`
- **Commit**: \`${commitHash}\`
- **Pre-release**: \`${isPrerelease}\`

### 📦 **Completed Builds**
${buildsCompleted}

${isPrerelease ? '🧪 **PRE-RELEASE** - Testing version' : '✅ **STABLE RELEASE**'}

---
**🔒 Internal use only** - Tracking for development team.`;

        // Update or create release
        if (releaseExists) {
            // Update existing release
            await octokit.repos.updateRelease({
                owner: PRIVATE_REPO_OWNER,
                repo: PRIVATE_REPO_NAME,
                release_id: existingRelease.id,
                body,
                prerelease: isPrerelease
            });
            
            log(`✨ Informational release updated in ${PRIVATE_REPO_NAME}!`, 'green');
            log(`  • URL: ${existingRelease.html_url}`, 'green');
            log(`  • Added build info for ${platformInfo[platform] || platform}`, 'green');
        } else {
            // Create new release
            const { data: privateRelease } = await octokit.repos.createRelease({
                owner: PRIVATE_REPO_OWNER,
                repo: PRIVATE_REPO_NAME,
                tag_name: `v${version}`,
                name: `📝 Build v${version} Info`,
                body,
                prerelease: isPrerelease,
                draft: false
            });

            log(`✨ Informational release created in ${PRIVATE_REPO_NAME}!`, 'green');
            log(`  • URL: ${privateRelease.html_url}`, 'green');
            log(`  • Added build info for ${platformInfo[platform] || platform}`, 'green');
        }

    } catch (error) {
        log(`❌ Error creating/updating informational release: ${error.message}`, 'red');
        throw error;
    }
}

// Main async function that orchestrates the release process
async function main() {
    try {
        // Get version from command line arguments
        const versionArgIndex = process.argv.findIndex(arg => arg.match(/^\d+\.\d+\.\d+/));
        if (versionArgIndex === -1) {
            log('❌ No version specified. Usage: npm run release -- X.Y.Z [--prerelease]', 'red');
            process.exit(1);
        }

        const newVersion = process.argv[versionArgIndex];
        const isPrerelease = process.argv.includes('--prerelease');
        const forceFlag = process.argv.includes('--force');
        const shouldPush = process.argv.includes('--push');

        log(`🚀 Starting release process for v${newVersion}${isPrerelease ? ' (pre-release)' : ''}...`, 'cyan');

        // 0. Install dependencies first
        log('📦 Installing dependencies...', 'cyan');
        try {
            execSync('npm install', { stdio: 'inherit' });
            log('✅ Dependencies installed successfully', 'green');
        } catch (error) {
            log(`❌ Error installing dependencies: ${error.message}`, 'red');
            process.exit(1);
        }

        // 1. Validate version format
        validateVersion(newVersion);

        // 2. Update version in files
        updateVersion(newVersion, isPrerelease);

        // 3. Create Git commit and tag
        createGitCommit(newVersion, isPrerelease);
        
        // Push changes if requested
        if (shouldPush) {
            pushToGitRemote();
        } else {
            log('ℹ️  Changes committed locally. Use --push flag to push to remote.', 'yellow');
        }

        // 4. Build the application
        log('🔨 Building the application for release...', 'cyan');
        try {
            buildApp();
            log('✅ Build completed successfully', 'green');
        } catch (error) {
            log(`❌ Build error: ${error.message}`, 'red');
            if (!forceFlag) {
                process.exit(1);
            }
        }

        // 5. Create GitHub client
        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN
        });

        // 6. Publish to public repo
        log('📤 Publishing to public repository...', 'cyan');
        let publicRelease;
        try {
            publicRelease = await publishToPublic(newVersion, isPrerelease, forceFlag, octokit);
            log('✅ Public release completed', 'green');
        } catch (error) {
            log(`❌ Public release error: ${error.message}`, 'red');
            // Continue anyway to create the private repo info
        }

        // 7. Publish info to private repo
        log('📝 Updating information in private repository...', 'cyan');
        try {
            await publishToPrivate(
                newVersion, 
                isPrerelease, 
                publicRelease ? publicRelease.html_url : `https://github.com/${PUBLIC_REPO_OWNER}/${PUBLIC_REPO_NAME}/releases/tag/v${newVersion}`,
                forceFlag,
                octokit
            );
            log('✅ Release information updated in private repository', 'green');
        } catch (error) {
            log(`❌ Error updating private information: ${error.message}`, 'red');
        }

        log(`\n🎉 Release process v${newVersion} completed!`, 'green');

    } catch (error) {
        log(`❌ Fatal error in release process: ${error.message}`, 'red');
        process.exit(1);
    }
}

// Execute the main function
main().catch(error => {
    log(`❌ Uncaught error: ${error.message}`, 'red');
    process.exit(1);
});