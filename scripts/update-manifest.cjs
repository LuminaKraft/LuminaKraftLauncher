#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Update updater.json manifest for different release types
 * Usage: node scripts/update-manifest.js <version> [--prerelease]
 */

// Configuration
const REPO = 'LuminaKraft/LuminakraftLauncher';
const UPDATER_JSON_PATH = './updater.json';

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('❌ Usage: node scripts/update-manifest.js <version> [--prerelease]');
  console.error('📖 Examples:');
  console.error('  node scripts/update-manifest.js v0.0.8           # Stable release');
  console.error('  node scripts/update-manifest.js v0.0.8-alpha.2 --prerelease  # Prerelease');
  process.exit(1);
}

const version = args[0];
const isPrerelease = args.includes('--prerelease') || version.includes('alpha') || version.includes('beta') || version.includes('rc');

console.log(`📝 Updating updater.json for ${isPrerelease ? 'prerelease' : 'stable'} version ${version}...`);

// Platform-specific file mappings
const platforms = {
  'darwin-x86_64': `LuminaKraft.Launcher_x64.app.tar.gz`,
  'darwin-aarch64': `LuminaKraft.Launcher_aarch64.app.tar.gz`,
  'linux-x86_64': `LuminaKraft.Launcher_amd64.AppImage.tar.gz`,
  'windows-x86_64': `LuminaKraft.Launcher_x64-setup.nsis.zip`
};

function updateManifest() {
  try {
    // Load existing updater.json or create new one
    let updaterConfig;
    if (fs.existsSync(UPDATER_JSON_PATH)) {
      updaterConfig = JSON.parse(fs.readFileSync(UPDATER_JSON_PATH, 'utf8'));
      console.log('📄 Loaded existing updater.json');
    } else {
      updaterConfig = {
        version: '',
        notes: '',
        pub_date: '',
        platforms: {}
      };
      console.log('📄 Created new updater.json structure');
    }

    // Update version and metadata
    updaterConfig.version = version.replace('v', '');
    updaterConfig.notes = isPrerelease 
      ? `Nueva versión experimental ${version} disponible` 
      : `Nueva versión estable ${version} disponible`;
    updaterConfig.pub_date = new Date().toISOString();

    // Update platform URLs
    for (const [platform, fileName] of Object.entries(platforms)) {
      if (!updaterConfig.platforms[platform]) {
        updaterConfig.platforms[platform] = {
          signature: '',
          url: ''
        };
      }

      // Different URL patterns for stable vs prerelease
      if (isPrerelease) {
        // Point to specific tag for prereleases
        updaterConfig.platforms[platform].url = 
          `https://github.com/${REPO}/releases/download/${version}/${fileName}`;
      } else {
        // Point to 'latest' for stable releases
        updaterConfig.platforms[platform].url = 
          `https://github.com/${REPO}/releases/latest/download/${fileName}`;
      }

      console.log(`✅ Updated ${platform} URL`);
    }

    // Write updated updater.json
    fs.writeFileSync(UPDATER_JSON_PATH, JSON.stringify(updaterConfig, null, 2));
    
    console.log('✅ Successfully updated updater.json');
    console.log('📋 Configuration:');
    console.log(`  Version: ${updaterConfig.version}`);
    console.log(`  Type: ${isPrerelease ? 'Prerelease' : 'Stable'}`);
    console.log(`  Date: ${updaterConfig.pub_date}`);
    
    console.log('\n🔗 URLs:');
    for (const [platform, config] of Object.entries(updaterConfig.platforms)) {
      console.log(`  ${platform}: ${config.url}`);
    }

    console.log('\n🚀 Next steps:');
    if (isPrerelease) {
      console.log('  1. This manifest points to a specific prerelease');
      console.log('  2. Users with prereleases enabled will receive this update');
      console.log('  3. Sign the update files: npm run sign-update ' + version);
    } else {
      console.log('  1. This manifest points to the latest stable release');
      console.log('  2. All users will receive this update');
      console.log('  3. Sign the update files: npm run sign-update ' + version);
    }
    console.log('  4. Commit and push the updated updater.json');

  } catch (error) {
    console.error(`❌ Failed to update manifest: ${error.message}`);
    process.exit(1);
  }
}

updateManifest(); 