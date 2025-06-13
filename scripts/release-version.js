#!/usr/bin/env node

/**
 * 🚀 LuminaKraft Launcher - Version Release Helper
 * 
 * Usage:
 *   npm run release:version 0.0.2           # Release 0.0.2 (stable)
 *   npm run release:version 0.0.2 --pre     # Release 0.0.2 (prerelease)
 *   npm run release:version 1.0.0-beta.1    # Release beta version
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
    log('🚀 LuminaKraft Launcher - Version Release Helper', 'bright');
    log('');
    log('Usage:', 'cyan');
    log('  npm run release:version <version>        Release specific version (stable)', 'yellow');
    log('  npm run release:version <version> --pre  Release specific version (prerelease)', 'yellow');
    log('');
    log('Examples:', 'cyan');
    log('  npm run release:version 0.0.2           # Release 0.0.2 (stable)', 'green');
    log('  npm run release:version 0.0.2 --pre     # Release 0.0.2 (prerelease)', 'green');
    log('  npm run release:version 1.0.0-beta.1    # Release beta version', 'green');
    log('  npm run release:version 2.0.0-rc.1 --pre # Release candidate as prerelease', 'green');
    log('');
    process.exit(0);
  }

  const version = args[0];
  const isPrerelease = args.includes('--pre') || args.includes('--prerelease');
  
  if (!version) {
    log('❌ No version specified!', 'red');
    log('💡 Usage: npm run release:version <version> [--pre]', 'cyan');
    process.exit(1);
  }

  log('🚀 Creating version release...', 'cyan');
  log(`📦 Version: ${version}`, 'magenta');
  log(`🏷️  Type: ${isPrerelease ? '🧪 Prerelease' : '🎉 Stable'}`, isPrerelease ? 'yellow' : 'green');
  log('');

  try {
    // Build the command
    let command = `node release.js ${version}`;
    if (isPrerelease) {
      command += ' --prerelease';
    }
    command += ' --push';
    
    log(`🔄 Executing: ${command}`, 'blue');
    
    execSync(command, { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    log('');
    log('🎉 Version release completed successfully!', 'green');
    
  } catch (error) {
    log('❌ Version release failed!', 'red');
    log(`Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

main(); 