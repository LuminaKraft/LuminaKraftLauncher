#!/usr/bin/env node

/**
 * 🧪 LuminaKraft Launcher - Prerelease Helper
 * 
 * Usage:
 *   npm run release:pre 0.0.2        # Release 0.0.2 as prerelease
 *   npm run release:pre patch         # Next patch version as prerelease
 *   npm run release:pre minor         # Next minor version as prerelease
 *   npm run release:pre major         # Next major version as prerelease
 */

import { execSync } from 'child_process';

function log(message, color = 'reset') {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    bright: '\x1b[1m',
    reset: '\x1b[0m'
  };
  
  const colorCode = colors[color] || colors.reset;
  console.log(`${colorCode}${message}${colors.reset}`);
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    log('🧪 LuminaKraft Launcher - Prerelease Helper', 'bright');
    log('');
    log('Usage:', 'cyan');
    log('  npm run release:pre <version>     Release specific version as prerelease', 'yellow');
    log('  npm run release:pre patch         Next patch version as prerelease', 'yellow');
    log('  npm run release:pre minor         Next minor version as prerelease', 'yellow');
    log('  npm run release:pre major         Next major version as prerelease', 'yellow');
    log('');
    log('Examples:', 'cyan');
    log('  npm run release:pre 0.0.2         # Release 0.0.2 as prerelease', 'green');
    log('  npm run release:pre patch          # 0.0.3 → 0.0.4 (prerelease)', 'green');
    log('  npm run release:pre 1.0.0-beta.1  # Release beta version', 'green');
    log('');
    process.exit(0);
  }

  const version = args[0];
  
  log('🧪 Creating prerelease...', 'cyan');
  log(`📦 Version: ${version}`, 'magenta');
  log('');

  try {
    // Call the main release script with prerelease flag
    const command = `node release.js ${version} --prerelease --push`;
    log(`🔄 Executing: ${command}`, 'blue');
    
    execSync(command, { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    log('');
    log('🎉 Prerelease completed successfully!', 'green');
    
  } catch (error) {
    log('❌ Prerelease failed!', 'red');
    log(`Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

main(); 