#!/usr/bin/env node

/**
 * Script para firmar actualizaciones automáticamente
 * Genera firmas para los archivos de actualización y actualiza el updater.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { generateReleaseDescription } = require('./generate-release-description.cjs');

// Configuración
const UPDATER_JSON_PATH = path.join(__dirname, '..', 'updater.json');
const PRIVATE_KEY_PATH = process.env.TAURI_SIGNING_PRIVATE_KEY || path.join(process.env.HOME, '.tauri', 'luminakraft-launcher.key');
const PRIVATE_KEY_PASSWORD = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;

// URLs de los archivos de actualización (se generan automáticamente en GitHub Actions)
const UPDATE_URLS = {
  'darwin-x86_64': 'https://github.com/LuminaKraft/LuminakraftLauncher/releases/latest/download/LuminaKraft.Launcher_x64.app.tar.gz',
  'darwin-aarch64': 'https://github.com/LuminaKraft/LuminakraftLauncher/releases/latest/download/LuminaKraft.Launcher_aarch64.app.tar.gz',
  'linux-x86_64': 'https://github.com/LuminaKraft/LuminakraftLauncher/releases/latest/download/LuminaKraft.Launcher_amd64.AppImage.tar.gz',
  'windows-x86_64': 'https://github.com/LuminaKraft/LuminakraftLauncher/releases/latest/download/LuminaKraft.Launcher_x64-setup.nsis.zip'
};

function getCurrentVersion() {
  try {
    const packageJson = require('../package.json');
    return packageJson.version;
  } catch (error) {
    console.error('Error reading package.json:', error);
    process.exit(1);
  }
}

function signFile(filePath) {
  try {
    console.log(`Signing file: ${filePath}`);
    
    const command = `tauri signer sign "${filePath}" -k "${PRIVATE_KEY_PATH}" ${PRIVATE_KEY_PASSWORD ? `-p "${PRIVATE_KEY_PASSWORD}"` : ''}`;
    const result = execSync(command, { encoding: 'utf8' });
    
    // Extraer la firma del resultado
    const signatureMatch = result.match(/signature: (.+)/);
    if (signatureMatch) {
      return signatureMatch[1].trim();
    } else {
      throw new Error('Could not extract signature from tauri signer output');
    }
  } catch (error) {
    console.error(`Error signing file ${filePath}:`, error);
    return '';
  }
}

function updateUpdaterJson(version, signatures) {
  try {
    const isPrerelease = version.includes('-');
    // Mantener solo la parte entre "## 📋 What's New" y "## 📥"  
    const fullDescription = generateReleaseDescription(version, isPrerelease);
    const afterWhatsNew = fullDescription.split('## 📋 What\'s New')[1] || fullDescription;
    let releaseNotes = afterWhatsNew.split('\n## 📥')[0].trim();
    // Eliminar cabeceras residuales (## ..., **🏷 ...**) y líneas en blanco iniciales
    releaseNotes = releaseNotes.replace(/^#+[^\n]*\n+/g, '').trim();

    const updaterData = {
      version: version,
      notes: releaseNotes,
      pub_date: new Date().toISOString(),
      platforms: {}
    };

    // Agregar las plataformas con sus firmas
    for (const [platform, url] of Object.entries(UPDATE_URLS)) {
      updaterData.platforms[platform] = {
        signature: signatures[platform] || '',
        url: url
      };
    }

    // Escribir el archivo updater.json
    fs.writeFileSync(UPDATER_JSON_PATH, JSON.stringify(updaterData, null, 2));
    console.log(`✅ Updated ${UPDATER_JSON_PATH} with version ${version}`);
  } catch (error) {
    console.error('Error updating updater.json:', error);
    process.exit(1);
  }
}

function main() {
  console.log('🔏 Starting update signing process...');
  
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error(`❌ Private key not found at ${PRIVATE_KEY_PATH}`);
    console.error('Please run: tauri signer generate -w ~/.tauri/luminakraft-launcher.key');
    process.exit(1);
  }

  const version = getCurrentVersion();
  console.log(`📦 Current version: ${version}`);

  // En un entorno real, aquí descargarías los archivos de actualización
  // Por ahora, solo generamos el updater.json con las URLs correctas
  const signatures = {};
  
  // Nota: En producción, deberías descargar los archivos reales y firmarlos
  // Por ahora, dejamos las firmas vacías para que se generen durante el proceso de release
  for (const platform of Object.keys(UPDATE_URLS)) {
    signatures[platform] = ''; // Se llenará automáticamente durante el proceso de build
  }

  updateUpdaterJson(version, signatures);
  
  console.log('✅ Update signing process completed!');
  console.log('📝 Note: Signatures will be generated automatically during the release process');
}

if (require.main === module) {
  main();
} 