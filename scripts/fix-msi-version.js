#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

const TAURI_CONFIG_PATH = path.join(process.cwd(), 'src-tauri', 'tauri.conf.json');
const PACKAGE_JSON_PATH = path.join(process.cwd(), 'package.json');

function isWindows() {
  return os.platform() === 'win32';
}

function getPackageVersion() {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  return packageJson.version;
}

function backupTauriConfig() {
  const configContent = fs.readFileSync(TAURI_CONFIG_PATH, 'utf8');
  fs.writeFileSync(TAURI_CONFIG_PATH + '.backup', configContent);
  return configContent;
}

function restoreTauriConfig() {
  if (fs.existsSync(TAURI_CONFIG_PATH + '.backup')) {
    fs.renameSync(TAURI_CONFIG_PATH + '.backup', TAURI_CONFIG_PATH);
    console.log('✅ Restored original tauri.conf.json');
  }
}

function fixMsiVersion() {
  if (!isWindows()) {
    console.log('ℹ️ Not Windows, skipping MSI version fix');
    return false;
  }

  const version = getPackageVersion();
  console.log(`📦 Current version: ${version}`);

  // Check for alpha or beta patterns
  const alphaMatch = version.match(/(\d+)\.(\d+)\.(\d+)-alpha\.(\d+)/);
  const betaMatch = version.match(/(\d+)\.(\d+)\.(\d+)-beta\.(\d+)/);

  if (!alphaMatch && !betaMatch) {
    console.log('ℹ️ No prerelease version detected, no MSI fix needed');
    return false;
  }

  // Backup current config
  const originalConfig = backupTauriConfig();

  // Extract base version (major.minor.patch)
  const match = alphaMatch || betaMatch;
  const [, major, minor, patch] = match;
  const msiVersion = `${major}.${minor}.${patch}`;

  console.log(`🔧 ${alphaMatch ? 'Alpha' : 'Beta'} prerelease detected, using base semver ${msiVersion} for MSI`);

  // Update tauri.conf.json with MSI-compatible version
  const updatedConfig = originalConfig.replace(
    /"version":\s*"[^"]*"/,
    `"version": "${msiVersion}"`
  );

  fs.writeFileSync(TAURI_CONFIG_PATH, updatedConfig);
  console.log('✅ Updated tauri.conf.json with MSI-compatible version');

  return true;
}

// Handle cleanup on process exit
process.on('exit', restoreTauriConfig);
process.on('SIGINT', () => {
  restoreTauriConfig();
  process.exit(0);
});
process.on('SIGTERM', () => {
  restoreTauriConfig();
  process.exit(0);
});

export { fixMsiVersion, restoreTauriConfig };

// If script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixMsiVersion();
}