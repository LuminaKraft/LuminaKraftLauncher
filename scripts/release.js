#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Repository configuration
const REPO_OWNER = 'LuminaKraft';
const REPO_NAME = 'LuminaKraftLauncher';

function validateVersion(version) {
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;
  if (!semverRegex.test(version)) {
    log(`❌ Invalid version format: ${version}`, 'red');
    log(`   Expected format: X.Y.Z or X.Y.Z-suffix (e.g., 1.0.0 or 1.0.0-beta.1)`, 'yellow');
    process.exit(1);
  }
}

function updateVersion(newVersion, isPrerelease = false) {
  const files = [
    {
      path: 'package.json',
      update: (content) => {
        const pkg = JSON.parse(content);
        pkg.version = newVersion;
        pkg.isPrerelease = isPrerelease;
        return JSON.stringify(pkg, null, 2);
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
      path: 'src-tauri/Cargo.toml',
      update: (content) => {
        return content.replace(/version\s*=\s*".*?"/, `version = "${newVersion}"`);
      }
    },
    {
      path: 'src/components/Layout/Sidebar.tsx',
      update: (content) => {
        return content.replace(/const currentVersion = ".*?"/, `const currentVersion = "${newVersion}"`);
      }
    }
  ];

  log(`📝 Updating version to ${newVersion}${isPrerelease ? ' (pre-release)' : ''} in all files...`, 'cyan');
  
  files.forEach(file => {
    try {
      if (fs.existsSync(file.path)) {
        const content = fs.readFileSync(file.path, 'utf8');
        const updatedContent = file.update(content);
        fs.writeFileSync(file.path, updatedContent);
        log(`  ✅ Updated ${file.path}`, 'green');
      } else {
        log(`  ⚠️ File not found: ${file.path}`, 'yellow');
      }
    } catch (error) {
      log(`  ❌ Error updating ${file.path}: ${error.message}`, 'red');
      process.exit(1);
    }
  });
}

function commitAndTag(version, isPrerelease = false) {
  log('📝 Creating Git commit and tag...', 'cyan');
  try {
    // Check if there are changes to commit
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (!status.trim()) {
      log('  ℹ️ No changes to commit', 'yellow');
      return;
    }

    // Check for unstaged changes beyond version files
    const versionFiles = ['package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml'];
    const statusLines = status.trim().split('\n');
    const unstagedChanges = statusLines.filter(line => {
      const file = line.slice(3).trim();
      return line.startsWith(' M') && !versionFiles.includes(file);
    });

    if (unstagedChanges.length > 0) {
      log('  ⚠️ Warning: There are unstaged changes in other files:', 'yellow');
      unstagedChanges.forEach(line => log(`    ${line}`, 'yellow'));
      log('  ℹ️ Only committing version files. Please commit other changes separately.', 'cyan');
    }

    // Add only version files
    versionFiles.forEach(file => {
      try {
        execSync(`git add ${file}`, { stdio: 'pipe' });
      } catch (error) {
        // File might not exist or have changes, ignore
      }
    });
    
    // Check if any version files were actually staged
    const stagedStatus = execSync('git status --porcelain', { encoding: 'utf8' })
      .split('\n')
      .filter(line => line.startsWith('A ') || line.startsWith('M ')); // Only look for added or modified files
    if (!stagedStatus.length) {
      log('  ℹ️ No version files to commit', 'yellow');
      return;
    }
    
    // Create commit
    const commitMessage = `Release v${version}${isPrerelease ? ' (pre-release)' : ''}`;
    execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
    
    // Create tag
    const tagName = `v${version}`;
    const tagMessage = `Version ${version}${isPrerelease ? ' (pre-release)' : ''}`;
    execSync(`git tag -a ${tagName} -m "${tagMessage}"`, { stdio: 'inherit' });
    
    log('✅ Git commit and tag created successfully', 'green');
  } catch (error) {
    log(`❌ Error creating Git commit: ${error.message}`, 'red');
    process.exit(1);
  }
}

function pushChanges() {
  log('🚀 Pushing changes to remote repository...', 'cyan');
  try {
    // Push commits
    execSync('git push origin main', { stdio: 'inherit' });
    
    // Push tags (this will trigger GitHub Actions)
    execSync('git push origin --tags', { stdio: 'inherit' });
    
    log('✅ Changes pushed to remote successfully', 'green');
    log(`🎯 GitHub Actions will now build and create the release automatically`, 'cyan');
    log(`📍 Check progress at: https://github.com/${REPO_OWNER}/${REPO_NAME}/actions`, 'cyan');
  } catch (error) {
    log(`❌ Error pushing to remote: ${error.message}`, 'red');
    process.exit(1);
  }
}

function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    log('❌ No command provided', 'red');
    log('📖 Usage:', 'cyan');
    log('  npm run release patch                    # Increment patch version (1.0.0 -> 1.0.1)', 'yellow');
    log('  npm run release minor                    # Increment minor version (1.0.0 -> 1.1.0)', 'yellow');
    log('  npm run release major                    # Increment major version (1.0.0 -> 2.0.0)', 'yellow');
    log('  npm run release -- 1.0.0-beta.1         # Custom version (including prereleases)', 'yellow');
    log('  npm run release:push                     # Push latest commit and tags to trigger build', 'yellow');
    log('', 'reset');
    log('🧪 Prerelease examples:', 'cyan');
    log('  npm run release -- 1.0.0-alpha.1        # Alpha prerelease', 'yellow');
    log('  npm run release -- 1.0.0-beta.1         # Beta prerelease', 'yellow');
    log('  npm run release -- 1.0.0-rc.1           # Release candidate', 'yellow');
    process.exit(1);
  }

  const command = args[0];

  // Handle push command
  if (command === 'push' || process.argv.includes('--push')) {
    pushChanges();
    return;
  }

  // Handle custom version (e.g., npm run release -- 1.0.0-beta.1)
  if (command.match(/^\d+\.\d+\.\d+/)) {
    const newVersion = command;
    const isPrerelease = newVersion.includes('-');
    
    log(`🚀 Creating ${isPrerelease ? 'pre-release' : 'release'}: ${newVersion}`, 'cyan');

    // Validate version
    validateVersion(newVersion);

    // Update version in files
    updateVersion(newVersion, isPrerelease);

    // Commit and tag
    commitAndTag(newVersion, isPrerelease);

    // Push if --push flag is provided
    if (process.argv.includes('--push')) {
      pushChanges();
    } else {
      log('\n✅ Release prepared successfully!', 'green');
      log('📋 Next steps:', 'cyan');
      log(`  1. Review the changes with: git log --oneline -5`, 'yellow');
      log(`  2. Push to trigger GitHub Actions: npm run release:push`, 'yellow');
      log(`  3. Monitor build progress at: https://github.com/${REPO_OWNER}/${REPO_NAME}/actions`, 'yellow');
    }
    return;
  }

  // Handle version bump commands
  if (!['patch', 'minor', 'major'].includes(command)) {
    log(`❌ Invalid command: ${command}`, 'red');
    log('✅ Valid commands: patch, minor, major, push, or custom version', 'yellow');
    process.exit(1);
  }

  try {
    // Get current version
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const currentVersion = packageJson.version;
    
    // Extract base version (remove prerelease suffix if present)
    const baseVersion = currentVersion.split('-')[0];
    const [major, minor, patch] = baseVersion.split('.').map(Number);
    
    let newVersion;
    
    switch (command) {
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

    log(`🚀 Creating ${command} release: ${currentVersion} → ${newVersion}`, 'cyan');

    // Validate version
    validateVersion(newVersion);

    // Update version in files
    updateVersion(newVersion, false);

    // Commit and tag
    commitAndTag(newVersion, false);

    // Push if --push flag is provided
    if (process.argv.includes('--push')) {
      pushChanges();
    } else {
      log('\n✅ Release prepared successfully!', 'green');
      log('📋 Next steps:', 'cyan');
      log(`  1. Review the changes with: git log --oneline -5`, 'yellow');
      log(`  2. Push to trigger GitHub Actions: npm run release:push`, 'yellow');
      log(`  3. Monitor build progress at: https://github.com/${REPO_OWNER}/${REPO_NAME}/actions`, 'yellow');
    }

  } catch (error) {
    log(`❌ Release process failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Execute main function
main(); 