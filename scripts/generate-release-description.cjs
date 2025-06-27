#!/usr/bin/env node

const fs = require('fs');

function extractChangelogSection(version) {
  try {
    const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
    const versionRegex = new RegExp(`## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\].*?(?=## \\[|$)`, 's');
    const match = changelog.match(versionRegex);
    
    if (!match) {
      return null;
    }
    
    const section = match[0];
    const lines = section.split('\n').slice(1); // Skip version header
    
    // Extract key features and improvements
    const features = [];
    const improvements = [];
    const bugFixes = [];
    
    let currentSection = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.includes('### 🚀') || trimmed.includes('Major Features')) {
        currentSection = 'features';
        continue;
      } else if (trimmed.includes('### 🎨') || trimmed.includes('Enhanced User Interface')) {
        currentSection = 'improvements';
        continue;
      } else if (trimmed.includes('### 🐛') || trimmed.includes('Bug Fixes')) {
        currentSection = 'bugFixes';
        continue;
      } else if (trimmed.includes('### 🔧') || trimmed.includes('Technical Enhancements')) {
        currentSection = 'improvements';
        continue;
      }
      
      // Extract bullet points
      if (trimmed.startsWith('- **') && trimmed.includes('**:')) {
        const feature = trimmed.replace(/^- \*\*(.*?)\*\*:?\s*(.*)/, '$1 - $2');
        if (currentSection === 'features') {
          features.push(feature);
        } else if (currentSection === 'improvements') {
          improvements.push(feature);
        } else if (currentSection === 'bugFixes') {
          bugFixes.push(feature);
        }
      }
    }
    
    // Build summary
    const summary = [];
    
    if (features.length > 0) {
      summary.push('**🚀 New Features:**');
      features.slice(0, 3).forEach(feature => summary.push(`- ${feature}`));
      if (features.length > 3) summary.push(`- ...and ${features.length - 3} more features`);
      summary.push('');
    }
    
    if (improvements.length > 0) {
      summary.push('**🔧 Improvements:**');
      improvements.slice(0, 2).forEach(improvement => summary.push(`- ${improvement}`));
      if (improvements.length > 2) summary.push(`- ...and ${improvements.length - 2} more improvements`);
      summary.push('');
    }
    
    if (bugFixes.length > 0) {
      summary.push('**🐛 Bug Fixes:**');
      bugFixes.slice(0, 2).forEach(fix => summary.push(`- ${fix}`));
      if (bugFixes.length > 2) summary.push(`- ...and ${bugFixes.length - 2} more fixes`);
      summary.push('');
    }
    
    return summary.join('\n').trim();
    
  } catch (error) {
    console.error('Error reading changelog:', error.message);
    return null;
  }
}

function generateReleaseDescription(version, isPrerelease = false) {
  const changelogSection = extractChangelogSection(version);
  
  const description = [
    `💎 **LuminaKraft Launcher v${version}${isPrerelease ? ' (Pre-release)' : ''}**`,
    '',
    isPrerelease ? '🧪 **Pre-release version for testing** - This version contains experimental features and may have bugs.' : '',
    isPrerelease ? '' : null,
    '## 📋 What\'s New',
    '',
    changelogSection || 'Check the [full changelog](https://github.com/LuminaKraft/LuminaKraftLauncher/blob/main/CHANGELOG.md) for complete details.',
    '',
    '## 📥 Download Instructions',
    '',
    '### 🪟 **Windows**',
    '- **NSIS Installer (*.exe)** - Recommended (universal installer with uninstall options)',
    '- **MSI Installer (*.msi)** - Alternative for enterprise environments',
    '',
    '### 🐧 **Linux**',
    '- **AppImage (*.AppImage)** - Portable executable (recommended)',
    '- **DEB Package (*.deb)** - Debian/Ubuntu/Mint',
    '- **RPM Package (*.rpm)** - Red Hat/Fedora/openSUSE',
    '',
    '### 🍎 **macOS**',
    '- **Apple Silicon DMG (*_aarch64.dmg)** - For M1/M2/M3/M4 Macs',
    '- **Intel Mac DMG (*_x64.dmg)** - For Intel Macs',
    '',
    '## 🔗 Links',
    '- 📖 **Full Changelog**: [CHANGELOG.md](https://github.com/LuminaKraft/LuminaKraftLauncher/blob/main/CHANGELOG.md)',
    '- 💬 **Discord**: Join our community',
    '- 🐛 **Report Bugs**: [GitHub Issues](https://github.com/LuminaKraft/LuminaKraftLauncher/issues)',
    '- 📖 **Documentation**: [Project README](https://github.com/LuminaKraft/LuminaKraftLauncher/blob/main/README.md)',
    '',
    '## 🛠️ Technical Details',
    '- **Built with**: Tauri 2.5.1 + React 18 + TypeScript',
    '- **Platforms**: Windows, macOS (Intel + ARM64), Linux',
    '- **Minecraft Library**: Lyceris for robust game management',
    '',
    isPrerelease ? '⚠️ **Warning**: This pre-release version may contain bugs. Use at your own risk and provide feedback if you encounter issues.' : null,
    isPrerelease ? '' : null,
    '---',
    '*Built automatically via GitHub Actions*'
  ].filter(line => line !== null).join('\n');
  
  return description;
}

// If called directly from command line
if (process.argv.length >= 3) {
  const version = process.argv[2];
  const isPrerelease = process.argv.includes('--prerelease');
  
  console.log(generateReleaseDescription(version, isPrerelease));
}

module.exports = { generateReleaseDescription, extractChangelogSection }; 