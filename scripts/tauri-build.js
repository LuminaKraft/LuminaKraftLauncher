#!/usr/bin/env node

import { spawn } from 'child_process';

async function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      // No shell needed - we use npx which works cross-platform
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  try {
    console.log('🚀 Starting Tauri build process...');

    // Check Linux dependencies first
    console.log('🔍 Checking Linux dependencies...');
    await runCommand('node', ['scripts/check-linux-deps.js']);

    // Run Tauri build
    console.log('🔨 Running Tauri build...');
    await runCommand('npx', ['tauri', 'build']);

    console.log('✅ Build completed successfully!');

  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

main();