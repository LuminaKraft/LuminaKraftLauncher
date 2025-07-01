#!/usr/bin/env node

/**
 * Generate prerelease manifest for Tauri updater
 * This script creates a latest.json file for the current prerelease
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('❌ Usage: node scripts/generate-prerelease-manifest.cjs <version>');
  console.error('📖 Example: node scripts/generate-prerelease-manifest.cjs 0.0.8-alpha.3');
  process.exit(1);
}

const version = args[0];
const isPrerelease = version.includes('alpha') || version.includes('beta') || version.includes('rc');

if (!isPrerelease) {
  console.log('ℹ️ Version is not a prerelease, skipping prerelease manifest generation');
  process.exit(0);
}

// Helper to strip prerelease suffix for certain files
function baseVersionOf(v) {
  return v.split('-')[0];
}

// Function to get the correct filename for each platform
function fileNameForPlatform(platform, version) {
  switch (platform) {
    case 'darwin-x86_64':
      return `LuminaKraft.Launcher_x64.app.tar.gz`;
    case 'darwin-aarch64':
      return `LuminaKraft.Launcher_aarch64.app.tar.gz`;
    case 'linux-x86_64':
      return `LuminaKraft.Launcher_${version}_amd64.AppImage.tar.gz`;
    case 'windows-x86_64':
      return `LuminaKraft.Launcher_${baseVersionOf(version)}_x64-setup.nsis.zip`;
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

const PLATFORMS = [
  'darwin-x86_64',
  'darwin-aarch64',
  'linux-x86_64',
  'windows-x86_64'
];

function generatePrereleaseManifest() {
  try {
    console.log(`📝 Generating prerelease manifest for version ${version}...`);

    const manifest = {
      version: version,
      notes: `Prerelease ${version} - Experimental version with latest features`,
      pub_date: new Date().toISOString(),
      platforms: {}
    };

    // Generate platform URLs
    for (const platform of PLATFORMS) {
      const fileName = fileNameForPlatform(platform, version);
      manifest.platforms[platform] = {
        signature: '', // Will be populated by Tauri during build
        url: `https://github.com/LuminaKraft/LuminakraftLauncher/releases/download/v${version}/${encodeURIComponent(fileName)}`
      };
    }

    // Write prerelease manifest
    const outputPath = path.join(__dirname, '..', 'prerelease-latest.json');
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
    
    console.log('✅ Generated prerelease manifest:');
    console.log(`  📄 prerelease-latest.json (version: ${version})`);
    console.log(`  🔗 URLs point to release tag: v${version}`);
    
    // Also update the main latest.json to point to this prerelease
    const mainLatestPath = path.join(__dirname, '..', 'latest.json');
    fs.writeFileSync(mainLatestPath, JSON.stringify(manifest, null, 2));
    console.log(`  📄 Updated latest.json to point to prerelease ${version}`);

  } catch (error) {
    console.error(`❌ Failed to generate prerelease manifest: ${error.message}`);
    process.exit(1);
  }
}

generatePrereleaseManifest(); 