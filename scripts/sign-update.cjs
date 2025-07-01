#!/usr/bin/env node

/**
 * Script para firmar actualizaciones automáticamente
 * Genera firmas para los archivos de actualización y actualiza el updater.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { generateReleaseDescription } = require('./generate-release-description.cjs');
const os = require('os');
const https = require('https');

// Configuración
const UPDATER_JSON_PATH = path.join(__dirname, '..', 'updater.json');
function findDefaultKey() {
  const homeTauriDir = path.join(process.env.HOME || os.homedir(), '.tauri');
  const candidates = [
    'luminakraft-launcher.key',
    'luminakraft-signing-key',
    'luminakraft_signing.key'
  ];
  for (const file of candidates) {
    const fullPath = path.join(homeTauriDir, file);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  // fallback to first name even if not existing
  return path.join(homeTauriDir, candidates[0]);
}

let PRIVATE_KEY_PATH = process.env.TAURI_SIGNING_PRIVATE_KEY || findDefaultKey();
const PRIVATE_KEY_PASSWORD = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;

// If the env var contains the key contents (starts with '-----' or length > 500) write to temp file
if (process.env.TAURI_SIGNING_PRIVATE_KEY && !fs.existsSync(PRIVATE_KEY_PATH)) {
  const keyContent = process.env.TAURI_SIGNING_PRIVATE_KEY;
  if (keyContent.length > 200) { // heuristic: assume base64 content
    const tmpKeyPath = path.join(os.tmpdir(), 'luminakraft_signing.key');
    fs.writeFileSync(tmpKeyPath, keyContent);
    PRIVATE_KEY_PATH = tmpKeyPath;
  }
}

// If PRIVATE_KEY_PATH points to a file, check whether it is mistakenly base64-encoded as a whole
function ensureValidKeyFile(originalPath) {
  if (!fs.existsSync(originalPath)) return originalPath;

  const firstChunk = fs.readFileSync(originalPath, { encoding: 'utf8', length: 120 });

  const rawTrim = firstChunk.trim();
  try {
    let decoded;
    try {
      decoded = Buffer.from(rawTrim, 'base64').toString('utf8');
    } catch (e) {
      // maybe url-safe, convert characters and retry
      const std = rawTrim.replace(/[\-_.]/g, (c) => (c === '_' ? '/' : '+'));
      decoded = Buffer.from(std, 'base64').toString('utf8');
    }
    // If the header says "rsign encrypted secret key", replace it with the minisign one so that the
    // Tauri CLI accepts it. We preserve any key id suffix (text after the colon).
    const fixedHeaderDecoded = decoded.replace(
      /^untrusted comment: rsign encrypted secret key(:?)/,
      'untrusted comment: minisign encrypted secret key$1'
    );

    if (fixedHeaderDecoded.startsWith('untrusted comment: minisign encrypted secret key')) {
      const rawFull = fs.readFileSync(originalPath, 'utf8').trim();
      const rawStandardFull = rawFull.replace(/[\-_.]/g, (c) => (c === '_' ? '/' : '+'));
      const decodedAll = Buffer.from(rawStandardFull, 'base64').toString('utf8');
      const finalFixed = decodedAll.replace(/^untrusted comment: rsign encrypted secret key(:?)/, 'untrusted comment: minisign encrypted secret key$1');
      const lines = finalFixed.split(/\r?\n/);
      if (lines.length >= 2) {
        lines[1] = lines[1].replace(/[\-_.]/g, (c) => (c === '_' ? '/' : '+'));
      }
      const cleanedFixed = lines.join('\n');
      const tmpPath = path.join(os.tmpdir(), `lk_dec_${Date.now()}.key`);
      fs.writeFileSync(tmpPath, cleanedFixed);
      console.warn(`⚠️  Converted rsign header, decoded base64 and fixed alphabet: ${tmpPath}`);
      return tmpPath;
    }
  } catch (_) {
    // Not valid base64 → leave untouched
  }

  // If we reach here, we couldn't parse a valid minisign key -> fall back to regenerating via `tauri signer generate`
  console.warn('⚠️  Provided private key seems invalid for minisign. Generating a fresh key pair via `tauri signer generate --force`.');

  const spawn = require('child_process').spawnSync;
  const genArgs = ['signer', 'generate', '--force', '--ci', '-w', originalPath];
  if (PRIVATE_KEY_PASSWORD) genArgs.push('-p', PRIVATE_KEY_PASSWORD);

  const gen = spawn('tauri', genArgs, { stdio: 'inherit' });
  if (gen.status !== 0) {
    console.error('❌ Failed to auto-generate signing key. Please generate one manually with `tauri signer generate -w ~/.tauri/luminakraft-launcher.key`');
    process.exit(1);
  }

  console.log(`✅ Generated new minisign key at ${originalPath}`);
  return originalPath;
}

// Ensure the key file is usable by minisign
PRIVATE_KEY_PATH = ensureValidKeyFile(PRIVATE_KEY_PATH);

// Mapeo de nombres de archivo por plataforma
const PLATFORM_FILES = {
  'darwin-x86_64': 'LuminaKraft.Launcher_x64.app.tar.gz',
  'darwin-aarch64': 'LuminaKraft.Launcher_aarch64.app.tar.gz',
  'linux-x86_64': 'LuminaKraft.Launcher_amd64.AppImage.tar.gz',
  'windows-x86_64': 'LuminaKraft.Launcher_x64-setup.nsis.zip'
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

function downloadFile(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      // Handle redirects (3xx)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        if (redirectsLeft === 0) {
          reject(new Error(`Too many redirects for ${url}`));
          return;
        }
        const redirectedUrl = response.headers.location.startsWith('http')
          ? response.headers.location
          : new URL(response.headers.location, url).href;
        return resolve(downloadFile(redirectedUrl, dest, redirectsLeft - 1));
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}. Status code: ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

function updateUpdaterJson(version, urls, signatures) {
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
    for (const platform of Object.keys(PLATFORM_FILES)) {
      updaterData.platforms[platform] = {
        signature: signatures[platform] || '',
        url: urls[platform]
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

function buildUpdateUrls(version, isPrerelease) {
  const tag = `v${version}`;
  const base = isPrerelease
    ? (platformFile) => `https://github.com/LuminaKraft/LuminakraftLauncher/releases/download/${tag}/${platformFile}`
    : (platformFile) => `https://github.com/LuminaKraft/LuminakraftLauncher/releases/latest/download/${platformFile}`;

  const urls = {};
  for (const [platform, file] of Object.entries(PLATFORM_FILES)) {
    urls[platform] = base(file);
  }
  return urls;
}

/**
 * Ensure tauri.conf.json contains the correct public key derived from the current private key.
 */
function updateTauriConfigPubKey() {
  try {
    const pubPathCandidates = [
      `${PRIVATE_KEY_PATH}.pub`,
      PRIVATE_KEY_PATH.replace(/\.key$/, '.key.pub'),
      PRIVATE_KEY_PATH.replace(/_signing\.key$/, '_signing.key.pub')
    ];

    let pubPath = pubPathCandidates.find(p => fs.existsSync(p));

    if (!pubPath) {
      console.warn('⚠️  Public key file not found; skipping tauri.conf.json update');
      return;
    }

    const pubLines = fs.readFileSync(pubPath, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (pubLines.length < 2 || !pubLines[1]) {
      console.warn(`⚠️  Unexpected public key file format at ${pubPath}`);
      return;
    }

    const pubKey = pubLines[1];

    const configPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
    if (!fs.existsSync(configPath)) {
      console.warn('⚠️  tauri.conf.json not found; cannot update pubkey');
      return;
    }

    const conf = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const current = (((conf.plugins || {}).updater || {}).pubkey) ?? '';

    if (current === pubKey) {
      console.log('ℹ️  tauri.conf.json already has correct pubkey');
      return;
    }

    if (!conf.plugins) conf.plugins = {};
    if (!conf.plugins.updater) conf.plugins.updater = {};
    conf.plugins.updater.pubkey = pubKey;

    fs.writeFileSync(configPath, JSON.stringify(conf, null, 2));
    console.log('✅ Updated pubkey in src-tauri/tauri.conf.json');
  } catch (err) {
    console.error('Failed to update tauri.conf.json pubkey:', err);
  }
}

async function main() {
  console.log('🔏 Starting update signing process...');
  
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error(`❌ Private key not found at ${PRIVATE_KEY_PATH}`);
    console.error('Please run: tauri signer generate -w ~/.tauri/luminakraft-launcher.key');
    process.exit(1);
  }

  const version = getCurrentVersion();
  console.log(`📦 Current version: ${version}`);

  const isPrerelease = version.includes('-');
  const UPDATE_URLS = buildUpdateUrls(version, isPrerelease);

  const signatures = {};
  
  for (const [platform, url] of Object.entries(UPDATE_URLS)) {
    try {
      console.log(`\n⬇️  Downloading ${platform} artifact...`);
      const tmpPath = path.join(os.tmpdir(), path.basename(url));
      await downloadFile(url, tmpPath);
      const sig = signFile(tmpPath);
      signatures[platform] = sig;
      fs.unlinkSync(tmpPath);
    } catch (err) {
      console.error(`⚠️  Failed to sign ${platform}:`, err.message);
      signatures[platform] = '';
    }
  }

  updateUpdaterJson(version, UPDATE_URLS, signatures);
  
  updateTauriConfigPubKey();
  
  console.log('✅ Update signing process completed!');
  console.log('📝 Note: Signatures will be generated automatically during the release process');
}

if (require.main === module) {
  main();
} 