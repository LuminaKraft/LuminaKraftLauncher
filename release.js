#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for pretty output
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

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return packageJson.version;
}

function updateVersion(newVersion, isPrerelease = false) {
  const files = [
    {
      path: 'package.json',
      update: (content) => {
        const pkg = JSON.parse(content);
        pkg.version = newVersion;
        pkg.isPrerelease = Boolean(isPrerelease);
        return JSON.stringify(pkg, null, 2);
      }
    },
    {
      path: 'src-tauri/Cargo.toml',
      update: (content) => {
        return content.replace(/^version = ".*"$/m, `version = "${newVersion}"`);
      }
    },
    {
      path: 'src-tauri/tauri.conf.json',
      update: (content) => {
        const config = JSON.parse(content);
        config.version = newVersion;
        return JSON.stringify(config, null, 2);
      }
    },
    {
      path: 'src/components/About/AboutPage.tsx',
      update: (content) => {
        return content.replace(
          /const currentVersion = ['"].*['"];/,
          `const currentVersion = "${newVersion}";`
        );
      }
    },
    {
      path: 'src/components/Layout/Sidebar.tsx',
      update: (content) => {
        return content.replace(
          /const currentVersion = ['"].*['"];/,
          `const currentVersion = "${newVersion}";`
        );
      }
    }
  ];

  log(`📝 Updating version to ${newVersion} in all files...`, 'cyan');
  
  files.forEach(file => {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const updatedContent = file.update(content);
      fs.writeFileSync(file.path, updatedContent);
      log(`  ✅ Updated ${file.path}`, 'green');
    } catch (error) {
      log(`  ❌ Failed to update ${file.path}: ${error.message}`, 'red');
      process.exit(1);
    }
  });
  
  // Debug: verify package.json was updated correctly
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    log(`🔍 Verification: package.json isPrerelease = ${packageJson.isPrerelease} (type: ${typeof packageJson.isPrerelease})`, 'cyan');
  } catch (error) {
    log(`⚠️  Could not verify package.json: ${error.message}`, 'yellow');
  }
}

function updateChangelog(version) {
  const changelogPath = 'CHANGELOG.md';
  const today = new Date().toISOString().split('T')[0];
  
  try {
    let content = fs.readFileSync(changelogPath, 'utf8');
    
    // Find the "Unreleased" section and replace it with the new version
    const unreleasedRegex = /## \[Unreleased\]/;
    if (unreleasedRegex.test(content)) {
      content = content.replace(
        unreleasedRegex,
        `## [${version}] - ${today}`
      );
      
      // Add a new Unreleased section at the top
      const firstVersionRegex = /## \[\d+\.\d+\.\d+\]/;
      content = content.replace(
        firstVersionRegex,
        `## [Unreleased]\n\n### 🚀 Features\n- \n\n### 🐛 Bug Fixes\n- \n\n### 🔧 Technical\n- \n\n$&`
      );
    } else {
      // If no Unreleased section, add the version after the existing first version
      const firstVersionRegex = /(## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2})/;
      if (firstVersionRegex.test(content)) {
        content = content.replace(
          firstVersionRegex,
          `## [${version}] - ${today}\n\n### 🚀 New Release\n- Version ${version} released with latest improvements\n- See previous versions below for detailed changes\n\n$&`
        );
      } else {
        // Fallback: add after the header
        const headerRegex = /(# Changelog\n\n.*?\n\n)/s;
        content = content.replace(
          headerRegex,
          `$1## [${version}] - ${today}\n\n### 🚀 New Release\n- Version ${version} released\n\n`
        );
      }
    }
    
    fs.writeFileSync(changelogPath, content);
    log(`  ✅ Updated CHANGELOG.md with version ${version}`, 'green');
    log(`  📝 You can edit the changelog later to add specific changes`, 'cyan');
  } catch (error) {
    log(`  ⚠️  Could not update CHANGELOG.md: ${error.message}`, 'yellow');
  }
}

function validateVersion(version) {
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/;
  if (!semverRegex.test(version)) {
    log(`❌ Invalid version format: ${version}`, 'red');
    log(`   Expected format: X.Y.Z or X.Y.Z-suffix`, 'yellow');
    process.exit(1);
  }
}

function runCommand(command, description) {
  try {
    log(`🔄 ${description}...`, 'cyan');
    execSync(command, { stdio: 'inherit' });
    log(`✅ ${description} completed`, 'green');
  } catch (error) {
    log(`❌ Failed to ${description.toLowerCase()}: ${error.message}`, 'red');
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  

  
  if (args.length === 0) {
    log('🚀 LuminaKraft Launcher Release Tool', 'bright');
    log('');
    log('Usage:', 'cyan');
    log('  node release.js <version>     Create a new release', 'yellow');
    log('  node release.js patch         Increment patch version (0.3.1 → 0.3.2)', 'yellow');
    log('  node release.js minor         Increment minor version (0.3.1 → 0.4.0)', 'yellow');
    log('  node release.js major         Increment major version (0.3.1 → 1.0.0)', 'yellow');
    log('');
    log('Flags:', 'cyan');
    log('  --prerelease                  Mark as pre-release', 'yellow');
    log('  --push                        Auto-push without confirmation', 'yellow');
    log('');
    log('Examples:', 'cyan');
    log('  node release.js 0.4.0         Release version 0.4.0', 'green');
    log('  node release.js patch          Release next patch version', 'green');
    log('  node release.js 1.0.0-beta.1  Release beta version', 'green');
    log('  node release.js 0.5.0 --prerelease  Release 0.5.0 as pre-release', 'green');
    log('  npm run release:patch-pre      Release next patch as pre-release', 'green');
    log('  npm run release -- 0.5.0 --prerelease   Pass flags via npm', 'green');
    log('');
    log(`Current version: ${getCurrentVersion()}`, 'magenta');
    process.exit(0);
  }

  // Parse flags from anywhere in arguments
  const isPrerelease = args.includes('--prerelease');
  const isPushAuto = args.includes('--push');
  
  // Get version argument (first non-flag argument)
  const versionArg = args.find(arg => !arg.startsWith('--'));
  
  if (!versionArg) {
    log('❌ No version specified!', 'red');
    log('💡 Usage: node release.js <version> [--prerelease] [--push]', 'cyan');
    process.exit(1);
  }
  
  let newVersion;

  // Handle semantic version increments
  if (['patch', 'minor', 'major'].includes(versionArg)) {
    const currentVersion = getCurrentVersion();
    const [major, minor, patch] = currentVersion.split('.').map(Number);
    
    switch (versionArg) {
      case 'patch':
        newVersion = `${major}.${minor}.${patch + 1}`;
        break;
      case 'minor':
        newVersion = `${major}.${minor + 1}.0`;
        break;
      case 'major':
        newVersion = `${major + 1}.0.0`;
        break;
    }
  } else {
    newVersion = versionArg;
  }

  validateVersion(newVersion);

  const currentVersion = getCurrentVersion();
  
  log('🚀 LuminaKraft Launcher Release Process', 'bright');
  log('');
  log(`📊 Current version: ${currentVersion}`, 'magenta');
  log(`🎯 New version:     ${newVersion}`, 'green');
  log(`📋 Release type:    ${isPrerelease ? '🧪 Pre-release' : '🎉 Stable'}`, isPrerelease ? 'yellow' : 'green');
  log(`🔧 Auto-push:      ${isPushAuto ? '✅ Enabled' : '❌ Disabled'}`, isPushAuto ? 'green' : 'yellow');
  log('');

  // Confirm the release
  if (process.env.CI !== 'true' && !isPushAuto) {
    log('⚠️  This will:', 'yellow');
    log('   1. Update version in all files', 'yellow');
    log('   2. Update CHANGELOG.md', 'yellow');
    log('   3. Create git commit', 'yellow');
    log('   4. Create git tag', 'yellow');
    log('   5. Push to GitHub (triggers automatic build & release)', 'yellow');
    log('');
    log('💡 To skip confirmation, use --push flag or run:', 'cyan');
    log(`   npm run release:minor`, 'yellow');
    log('');
    
    // Cross-platform confirmation
    try {
      if (process.platform === 'win32') {
        // Windows PowerShell confirmation
        execSync('powershell -Command "& {$response = Read-Host \'Continue? (y/N)\'; if ($response -ne \'y\' -and $response -ne \'Y\') { exit 1 }}"', { stdio: 'inherit' });
      } else {
        // Unix/Linux/macOS confirmation
        execSync('read -p "Continue? (y/N): " -n 1 -r && echo && [[ $REPLY =~ ^[Yy]$ ]]', { stdio: 'inherit', shell: '/bin/bash' });
      }
    } catch {
      log('❌ Release cancelled', 'red');
      process.exit(0);
    }
  }

  log('');
  log('🔧 Starting release process...', 'bright');
  log('');

  // Step 1: Update version in all files
  updateVersion(newVersion, isPrerelease);

  // Step 2: Update changelog
  log(`📝 Updating CHANGELOG.md...`, 'cyan');
  updateChangelog(newVersion);

  // Step 3: Build and test
  log(`🔨 Running build test...`, 'cyan');
  try {
    execSync('npm run build', { stdio: 'inherit' });
    log(`✅ Build test passed`, 'green');
  } catch (error) {
    log(`❌ Build failed! Please fix errors before releasing.`, 'red');
    process.exit(1);
  }

  // Step 4: Git operations
  runCommand('git add .', 'Staging changes');
  runCommand(`git commit -m "🚀 Release v${newVersion}${isPrerelease ? ' (pre-release)' : ''}"`, 'Creating commit');
  runCommand(`git tag v${newVersion}`, 'Creating tag');

  log('');
  log('🎉 Release prepared successfully!', 'green');
  log('');
  log('Next steps:', 'cyan');
  log(`  git push origin main --tags`, 'yellow');
  log('');
  log('This will trigger:', 'cyan');
  log('  ✅ GitHub Actions build', 'green');
  log('  ✅ Automatic GitHub release creation', 'green');
  log(`  ✅ ${isPrerelease ? 'Pre-release' : 'Stable release'} in public repository`, isPrerelease ? 'yellow' : 'green');
  log('  ✅ Internal tracking in private repository', 'green');
  log('  ✅ User notifications for updates', 'green');
  log('');

  // Auto-push if in CI or if --push flag is provided
  if (process.env.CI === 'true' || isPushAuto) {
    runCommand('git push origin main --tags', 'Pushing to GitHub');
    log('');
    log('🚀 Release pushed to GitHub!', 'bright');
    log('🔗 Check GitHub Actions for build progress:', 'cyan');
    log('   https://github.com/kristiangarcia/luminakraft-launcher/actions', 'blue');
  } else {
    log('💡 To complete the release, run:', 'cyan');
    log('   git push origin main --tags', 'yellow');
  }
}

main(); 