#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const PUBLIC_REPO_PATH = path.join(__dirname, '../luminakraft-launcher-releases');
const ARTIFACTS_PATH = path.join(__dirname, 'src-tauri/target/release');

// ANSI color codes
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

function updateVersion(newVersion) {
  const files = [
    {
      path: 'package.json',
      update: (content) => {
        const pkg = JSON.parse(content);
        pkg.version = newVersion;
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
    }
  ];

  log(`📝 Actualizando versión a ${newVersion} en todos los archivos...`, 'cyan');
  
  files.forEach(file => {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const updatedContent = file.update(content);
      fs.writeFileSync(file.path, updatedContent);
      log(`  ✅ Actualizado ${file.path}`, 'green');
    } catch (error) {
      log(`  ❌ Error al actualizar ${file.path}: ${error.message}`, 'red');
      process.exit(1);
    }
  });
}

function validateVersion(version) {
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;
  if (!semverRegex.test(version)) {
    log(`❌ Formato de versión inválido: ${version}`, 'red');
    log(`   Formato esperado: X.Y.Z o X.Y.Z-suffix (ej: 1.0.0-beta.1)`, 'yellow');
    process.exit(1);
  }
}

function buildApp() {
  log('🔨 Construyendo la aplicación...', 'cyan');
  try {
    // Instalar dependencias si es necesario
    if (!fs.existsSync('node_modules')) {
      log('📦 Instalando dependencias...', 'cyan');
      execSync('npm install', { stdio: 'inherit' });
    }
    
    // En Windows, construir para Windows y Linux
    if (os.platform() === 'win32') {
      // Instalar target de Linux si no está instalado
      log('🔧 Verificando target de Linux...', 'cyan');
      try {
        execSync('rustup target add x86_64-unknown-linux-gnu', { stdio: 'inherit' });
      } catch (error) {
        log('⚠️ No se pudo instalar el target de Linux. Solo se construirá para Windows.', 'yellow');
        log(`   Error: ${error.message}`, 'yellow');
      }

      log('🎯 Construyendo para Windows...', 'cyan');
      execSync('npm run tauri build', { stdio: 'inherit' });
      
      try {
        log('🐧 Construyendo para Linux...', 'cyan');
        execSync('npm run tauri build -- --target x86_64-unknown-linux-gnu', { stdio: 'inherit' });
      } catch (error) {
        log('⚠️ No se pudo construir para Linux. Continuando solo con Windows.', 'yellow');
        log(`   Error: ${error.message}`, 'yellow');
      }
    } else {
      // En otros sistemas, solo construir para el sistema actual
      execSync('npm run tauri build', { stdio: 'inherit' });
    }
    
    log('✅ Build completado', 'green');
  } catch (error) {
    log(`❌ Error al construir: ${error.message}`, 'red');
    throw error;
  }
}

function getInstallerFiles() {
  const bundleDir = path.join(ARTIFACTS_PATH, 'bundle');
  const installers = [];
  
  // Buscar en las carpetas msi y nsis para Windows
  const msiDir = path.join(bundleDir, 'msi');
  const nsisDir = path.join(bundleDir, 'nsis');
  const debianDir = path.join(bundleDir, 'deb');
  const appimageDir = path.join(bundleDir, 'appimage');
  
  if (fs.existsSync(msiDir)) {
    const msiFiles = fs.readdirSync(msiDir).filter(f => f.endsWith('.msi'));
    installers.push(...msiFiles.map(f => path.join('bundle', 'msi', f)));
  }
  
  if (fs.existsSync(nsisDir)) {
    const nsisFiles = fs.readdirSync(nsisDir).filter(f => f.endsWith('.exe'));
    installers.push(...nsisFiles.map(f => path.join('bundle', 'nsis', f)));
  }
  
  if (fs.existsSync(debianDir)) {
    const debFiles = fs.readdirSync(debianDir).filter(f => f.endsWith('.deb'));
    installers.push(...debFiles.map(f => path.join('bundle', 'deb', f)));
  }
  
  if (fs.existsSync(appimageDir)) {
    const appimageFiles = fs.readdirSync(appimageDir).filter(f => f.endsWith('.AppImage'));
    installers.push(...appimageFiles.map(f => path.join('bundle', 'appimage', f)));
  }
  
  return installers;
}

function publishToPublic(version) {
  log(`📦 Publicando v${version}...`, 'cyan');
  
  try {
    // Cambiar al directorio del repositorio público
    process.chdir(PUBLIC_REPO_PATH);
    
    // Crear directorio releases si no existe
    const releasesDir = path.join(PUBLIC_REPO_PATH, 'releases');
    if (!fs.existsSync(releasesDir)) {
      fs.mkdirSync(releasesDir, { recursive: true });
    }
    
    // Obtener lista de instaladores
    log('📄 Copiando instaladores...', 'cyan');
    const installers = getInstallerFiles();
      
    if (installers.length === 0) {
      throw new Error('No se encontraron instaladores para copiar');
    }
    
    installers.forEach(installer => {
      const source = path.join(ARTIFACTS_PATH, installer);
      const filename = path.basename(installer);
      const dest = path.join(releasesDir, filename);
      fs.copyFileSync(source, dest);
      log(`  ✅ Copiado: ${filename}`, 'green');
    });
    
    // Crear archivo de release info
    const releaseInfo = {
      version,
      platform: os.platform(),
      date: new Date().toISOString(),
      artifacts: installers.map(installer => ({
        name: path.basename(installer),
        path: `releases/${path.basename(installer)}`
      }))
    };
    
    fs.writeFileSync(
      path.join(releasesDir, `release-${version}.json`),
      JSON.stringify(releaseInfo, null, 2)
    );
    
    // Git operations
    log('🔄 Actualizando repositorio público...', 'cyan');
    execSync('git add releases/*', { stdio: 'inherit' });
    execSync(`git commit -m "release: v${version}"`, { stdio: 'inherit' });
    execSync(`git tag -a v${version} -m "Release v${version}"`, { stdio: 'inherit' });
    execSync('git push origin main --tags', { stdio: 'inherit' });
    
    log(`\n✨ Release v${version} publicada!`, 'green');
    log('📝 Resumen:', 'cyan');
    log(`  • ${installers.length} instaladores subidos`, 'green');
    log(`  • Tag v${version} creado`, 'green');
    log(`  • Release info guardada en releases/release-${version}.json`, 'green');
    
  } catch (error) {
    log(`❌ Error al publicar: ${error.message}`, 'red');
    throw error;
  }
}

function main() {
  const args = process.argv.slice(2);
  const originalDir = process.cwd();
  
  if (args.length === 0) {
    log('🚀 LuminaKraft Launcher - Release Local', 'bright');
    log('');
    log('Uso:', 'cyan');
    log('  node release.js <version>     Crear nueva release', 'yellow');
    log('  node release.js patch         Incrementar versión patch (0.3.1 → 0.3.2)', 'yellow');
    log('  node release.js minor         Incrementar versión minor (0.3.1 → 0.4.0)', 'yellow');
    log('  node release.js major         Incrementar versión major (0.3.1 → 1.0.0)', 'yellow');
    log('');
    log('Ejemplos:', 'cyan');
    log('  node release.js 0.4.0         Release versión 0.4.0', 'green');
    log('  node release.js patch         Release siguiente versión patch', 'green');
    log('  node release.js 1.0.0-beta.1  Release versión beta', 'green');
    log('');
    log(`Versión actual: ${getCurrentVersion()}`, 'magenta');
    log(`Plataforma: ${os.platform()}`, 'magenta');
    process.exit(0);
  }

  // Get version argument
  const versionArg = args[0];
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
  
  try {
    // Verificar que el repositorio público existe
    if (!fs.existsSync(PUBLIC_REPO_PATH)) {
      throw new Error('No se encontró el repositorio público. Asegúrate de que esté clonado en el directorio correcto.');
    }

    log('\n🚀 Iniciando proceso de release', 'bright');
    log(`📊 Versión actual: ${getCurrentVersion()}`, 'magenta');
    log(`🎯 Nueva versión: ${newVersion}`, 'green');
    log(`💻 Plataforma: ${os.platform()}`, 'cyan');
    log('');

    // Actualizar versión
    updateVersion(newVersion);

    // Construir
    buildApp();

    // Publicar
    publishToPublic(newVersion);

    log('\n✅ ¡Proceso completado con éxito!', 'green');
    log('🌐 Visita el repositorio público para ver los archivos:', 'cyan');
    log('   https://github.com/kristiangarcia/luminakraft-launcher-releases/releases\n');

  } catch (error) {
    log('\n❌ Error en el proceso de release:', 'red');
    log(error.message, 'red');
    process.exit(1);
  } finally {
    process.chdir(originalDir);
  }
}

main(); 