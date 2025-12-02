#!/usr/bin/env node

/**
 * Generate prerelease manifest for Tauri updater
 * This script creates a latest.json file for the current prerelease
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

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
  const baseVersion = baseVersionOf(version);

  switch (platform) {
    case 'darwin-x86_64':
      return `LuminaKraft.Launcher_x64.app.tar.gz`;
    case 'darwin-aarch64':
      return `LuminaKraft.Launcher_aarch64.app.tar.gz`;
    case 'linux-x86_64':
      return `LuminaKraft.Launcher_${version}_amd64.AppImage.tar.gz`;
    case 'windows-x86_64':
      // Tauri updater on Windows uses .msi files with base version (no prerelease suffix)
      return `LuminaKraft.Launcher_${baseVersion}_x64_en-US.msi`;
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

// Function to download signed manifest from tauri-action
function downloadSignedManifest(version) {
  return new Promise((resolve, reject) => {
    const url = `https://github.com/LuminaKraft/LuminakraftLauncher/releases/download/v${version}/latest.json`;
    
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        https.get(res.headers.location, (redirectRes) => {
          let data = '';
          redirectRes.on('data', chunk => data += chunk);
          redirectRes.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              reject(new Error(`Failed to parse signed manifest: ${error.message}`));
            }
          });
        }).on('error', reject);
      } else if (res.statusCode === 200) {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error(`Failed to parse signed manifest: ${error.message}`));
          }
        });
      } else {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }
    }).on('error', reject);
  });
}

async function generatePrereleaseManifest() {
  try {
    console.log(`📝 Generating prerelease manifest for version ${version}...`);

    let manifest;
    
    try {
      // Try to download the signed manifest from tauri-action
      console.log(`🔍 Attempting to download signed manifest from tauri-action...`);
      const signedManifest = await downloadSignedManifest(version);
      
      // Fix the version and URLs while keeping signatures
      manifest = {
        version: version, // Fix: Use correct prerelease version
        notes: `Prerelease ${version} - Experimental version with latest features`,
        pub_date: signedManifest.pub_date || new Date().toISOString(),
        platforms: {}
      };

      // Fix URLs and keep signatures
      for (const platform of PLATFORMS) {
        const fileName = fileNameForPlatform(platform, version);
        manifest.platforms[platform] = {
          signature: signedManifest.platforms[platform]?.signature || '', // Keep original signature
          url: `https://github.com/LuminaKraft/LuminakraftLauncher/releases/download/v${version}/${encodeURIComponent(fileName)}`
        };
      }
      
      console.log(`✅ Successfully downloaded and fixed signed manifest`);
      
    } catch (error) {
      console.log(`⚠️ Failed to download signed manifest (${error.message}), generating fallback`);
      
      // Fallback: Generate manifest without signatures
      manifest = {
        version: version,
        notes: `Prerelease ${version} - Experimental version with latest features`,
        pub_date: new Date().toISOString(),
        platforms: {}
      };

      // Generate platform URLs without signatures
      for (const platform of PLATFORMS) {
        const fileName = fileNameForPlatform(platform, version);
        manifest.platforms[platform] = {
          signature: '', // No signature available
          url: `https://github.com/LuminaKraft/LuminakraftLauncher/releases/download/v${version}/${encodeURIComponent(fileName)}`
        };
      }
    }

    // Write latest.json (consumed by Tauri updater)
    const mainLatestPath = path.join(__dirname, '..', 'latest.json');
    fs.writeFileSync(mainLatestPath, JSON.stringify(manifest, null, 2));
    
    console.log('✅ Generated prerelease manifest:');
    console.log(`  📄 latest.json (version: ${version})`);
    console.log(`  🔗 URLs point to release tag: v${version}`);

  } catch (error) {
    console.error(`❌ Failed to generate prerelease manifest: ${error.message}`);
    process.exit(1);
  }
}

generatePrereleaseManifest(); 