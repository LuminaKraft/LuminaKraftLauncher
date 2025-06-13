#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import readline from 'readline';

// Cargar variables de entorno desde .env
const dotenvResult = dotenv.config();
if (dotenvResult.error) {
  console.log(`\x1b[33m ⚠️  No se encontró el archivo .env, se usarán las variables de entorno del sistema si existen.\x1b[0m`);
} else {
  console.log(`\x1b[32m ✅  Archivo .env cargado correctamente.\x1b[0m`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const PUBLIC_REPO_OWNER = 'kristiangarcia';
const PUBLIC_REPO_NAME = 'luminakraft-launcher-releases';
const PRIVATE_REPO_OWNER = 'kristiangarcia';
const PRIVATE_REPO_NAME = 'luminakraft-launcher';
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
    }
  ];

  log(`📝 Actualizando versión a ${newVersion}${isPrerelease ? ' (pre-release)' : ''} en todos los archivos...`, 'cyan');
  
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

function cleanBuildCache() {
  log('🧹 Limpiando caché de builds anteriores...', 'cyan');
  try {
    const bundlePaths = [
      'src-tauri/target/release/bundle',
      'src-tauri/target/debug/bundle'
    ];

    bundlePaths.forEach(bundlePath => {
      if (fs.existsSync(bundlePath)) {
        fs.rmSync(bundlePath, { recursive: true, force: true });
        log(`  ✅ Eliminado: ${bundlePath}`, 'green');
      }
    });
  } catch (error) {
    log(`  ⚠️ Error al limpiar caché: ${error.message}`, 'yellow');
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

    // Limpiar caché antes de construir
    cleanBuildCache();
    
    // Construir para la plataforma actual
    log(`🎯 Construyendo para ${os.platform()}...`, 'cyan');
    execSync('npm run tauri build', { stdio: 'inherit' });
    
    log('✅ Build completado', 'green');
  } catch (error) {
    log(`❌ Error al construir: ${error.message}`, 'red');
    throw error;
  }
}

function getInstallerFiles() {
  const bundleDir = path.join(ARTIFACTS_PATH, 'bundle');
  const installers = [];
  
  // Buscar en las carpetas según la plataforma
  const platform = os.platform();
  
  if (platform === 'win32') {
    const msiDir = path.join(bundleDir, 'msi');
    const nsisDir = path.join(bundleDir, 'nsis');
    
    if (fs.existsSync(msiDir)) {
      const msiFiles = fs.readdirSync(msiDir).filter(f => f.endsWith('.msi'));
      installers.push(...msiFiles.map(f => path.join('bundle', 'msi', f)));
    }
    
    if (fs.existsSync(nsisDir)) {
      const nsisFiles = fs.readdirSync(nsisDir).filter(f => f.endsWith('.exe'));
      installers.push(...nsisFiles.map(f => path.join('bundle', 'nsis', f)));
    }
  } else if (platform === 'linux') {
    const debianDir = path.join(bundleDir, 'deb');
    const appimageDir = path.join(bundleDir, 'appimage');
    
    if (fs.existsSync(debianDir)) {
      const debFiles = fs.readdirSync(debianDir).filter(f => f.endsWith('.deb'));
      installers.push(...debFiles.map(f => path.join('bundle', 'deb', f)));
    }
    
    if (fs.existsSync(appimageDir)) {
      const appimageFiles = fs.readdirSync(appimageDir).filter(f => f.endsWith('.AppImage'));
      installers.push(...appimageFiles.map(f => path.join('bundle', 'appimage', f)));
    }
  } else if (platform === 'darwin') {
    const dmgDir = path.join(bundleDir, 'dmg');
    const macosDir = path.join(bundleDir, 'macos');
    
    if (fs.existsSync(dmgDir)) {
      const dmgFiles = fs.readdirSync(dmgDir).filter(f => f.endsWith('.dmg'));
      installers.push(...dmgFiles.map(f => path.join('bundle', 'dmg', f)));
    }
    
    if (fs.existsSync(macosDir)) {
      const appFiles = fs.readdirSync(macosDir).filter(f => f.endsWith('.app'));
      installers.push(...appFiles.map(f => path.join('bundle', 'macos', f)));
    }
  }
  
  return installers;
}

// Helper to find a release by tag even if tag ref is missing (or turned draft)
async function findReleaseByTagSafe(octokit, owner, repo, tag) {
  try {
    const { data } = await octokit.repos.getReleaseByTag({ owner, repo, tag });
    return data;
  } catch {
    // Fallback: iterate releases and drafts
    const { data: releases } = await octokit.repos.listReleases({ owner, repo, per_page: 100 });
    return releases.find(r => r.tag_name === tag);
  }
}

async function publishToPublic(version, isPrerelease, forceFlag, octokit) {
  log(`📦 Publicando v${version}${isPrerelease ? ' (pre-release)' : ''} en el repo público...`, 'cyan');
  
  try {
    // If release/tag exists, handle replacement
    const existingRelease = await findReleaseByTagSafe(octokit, PUBLIC_REPO_OWNER, PUBLIC_REPO_NAME, `v${version}`);
    const releaseExists = Boolean(existingRelease);
    const existingReleaseId = existingRelease?.id;

    let tagExists = false;
    try {
      await octokit.git.getRef({ owner: PUBLIC_REPO_OWNER, repo: PUBLIC_REPO_NAME, ref: `tags/v${version}` });
      tagExists = true;
    } catch {}

    if (releaseExists || tagExists) {
      if (!forceFlag) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise(res => rl.question(`⚠️ Ya existe un release/tag v${version} en el repo público. ¿Reemplazarlo? (y/N): `, res));
        rl.close();
        if (!['y', 'Y', 'yes', 'YES'].includes(answer.trim())) {
          throw new Error('Operación cancelada por el usuario.');
        }
      }
      log('🔄 Eliminando release y tag previos en repo público...', 'yellow');
      if (releaseExists) {
        await octokit.repos.deleteRelease({ owner: PUBLIC_REPO_OWNER, repo: PUBLIC_REPO_NAME, release_id: existingReleaseId });
      }
      if (tagExists) {
        try { await octokit.git.deleteRef({ owner: PUBLIC_REPO_OWNER, repo: PUBLIC_REPO_NAME, ref: `tags/v${version}` }); } catch {}
      }
    }

    // Obtener lista de instaladores
    log('📄 Preparando instaladores...', 'cyan');
    const installers = getInstallerFiles();
      
    if (installers.length === 0) {
      throw new Error('No se encontraron instaladores para publicar');
    }

    // Crear release info
    const releaseInfo = {
      version,
      isPrerelease,
      platform: os.platform(),
      date: new Date().toISOString(),
      artifacts: installers.map(installer => ({
        name: path.basename(installer),
        path: installer
      }))
    };

    // Crear el release en GitHub
    log('🔄 Creando release en GitHub...', 'cyan');
    log(`  - Debug: Prerelease flag: ${isPrerelease} (Type: ${typeof isPrerelease})`, 'magenta');
    const { data: release } = await octokit.repos.createRelease({
      owner: PUBLIC_REPO_OWNER,
      repo: PUBLIC_REPO_NAME,
      tag_name: `v${version}`,
      name: `🚀 LuminaKraft Launcher v${version}${isPrerelease ? ' (Pre-release)' : ''}`,
      body: `## 📥 Instrucciones de Descarga

${isPrerelease ? '🧪 **Versión Pre-Release** - Esta es una versión de prueba con características experimentales' : '🎉 **Versión Estable** - Versión lista para producción'}

### 🪟 **Windows**
- **MSI Installer** (\`*.msi\`) - Recomendado
- **NSIS Installer** (\`*.exe\`) - Alternativo

### 🐧 **Linux**
- **AppImage** (\`*.AppImage\`) - Recomendado (portable)
- **DEB Package** (\`*.deb\`) - Debian/Ubuntu
- **RPM Package** (\`*.rpm\`) - Red Hat/Fedora

### 🍎 **macOS**
- **Apple Silicon** (\`aarch64-apple-darwin.dmg\`) - M1/M2/M3/M4
- **Intel Macs** (\`x86_64-apple-darwin.dmg\`) - Macs Intel

## 🔗 Enlaces
- 💬 **Discord**: [Únete a nuestra comunidad](https://discord.gg/UJZRrcUFMj)
- 🐛 **Reportar bugs**: [GitHub Issues](https://github.com/kristiangarcia/luminakraft-launcher-releases/issues)

${isPrerelease ? '⚠️ **Advertencia**: Esta versión puede contener errores. Úsala bajo tu propio riesgo.' : '✅ **Versión estable y recomendada para todos los usuarios.**'}`,
      draft: false,
      prerelease: isPrerelease
    });

    // Subir los archivos al release
    log('📤 Subiendo archivos al release...', 'cyan');
    for (const installer of installers) {
      const filePath = path.join(ARTIFACTS_PATH, installer);
      const fileName = path.basename(installer);
      
      log(`  📦 Subiendo ${fileName}...`, 'cyan');
      await octokit.repos.uploadReleaseAsset({
        owner: PUBLIC_REPO_OWNER,
        repo: PUBLIC_REPO_NAME,
        release_id: release.id,
        name: fileName,
        data: fs.readFileSync(filePath)
      });
      log(`  ✅ Subido: ${fileName}`, 'green');
    }
    
    log(`\n✨ Release v${version}${isPrerelease ? ' (pre-release)' : ''} publicada!`, 'green');
    log('📝 Resumen:', 'cyan');
    log(`  • ${installers.length} instaladores subidos`, 'green');
    log(`  • Release creada en GitHub`, 'green');
    log(`  • URL: ${release.html_url}`, 'green');

    return release;
    
  } catch (error) {
    log(`❌ Error al publicar en el repo público: ${error.message}`, 'red');
    throw error;
  }
}

async function publishToPrivate(version, isPrerelease, publicReleaseUrl, forceFlag, octokit) {
    log(`📝 Creando release informativa en el repo privado...`, 'cyan');
    try {
        const commitHash = execSync('git rev-parse HEAD').toString().trim();
        const platform = os.platform();

        let buildsCompleted;
        switch (platform) {
            case 'win32':
                buildsCompleted = `- ✅ **Windows**: MSI + NSIS\n- ❌ **Linux**: No compilado\n- ❌ **macOS**: No compilado`;
                break;
            case 'linux':
                buildsCompleted = `- ❌ **Windows**: No compilado\n- ✅ **Linux**: AppImage + DEB\n- ❌ **macOS**: No compilado`;
                break;
            case 'darwin':
                buildsCompleted = `- ❌ **Windows**: No compilado\n- ❌ **Linux**: No compilado\n- ✅ **macOS**: DMG`;
                break;
            default:
                buildsCompleted = `- ❓ **Plataforma desconocida**`;
        }

        const body = `## 🔗 **Release Público**
**🌐 Descarga**: ${publicReleaseUrl}

## 🏗️ **Info de Build**
- **Versión**: \`${version}\`
- **Commit**: \`${commitHash}\`
- **Pre-release**: \`${isPrerelease}\`

### 📦 **Builds Completados**
${buildsCompleted}

${isPrerelease ? '🧪 **PRE-RELEASE** - Versión de prueba' : '✅ **RELEASE ESTABLE**'}

---
**🔒 Solo uso interno** - Tracking para el equipo de desarrollo.`;

        log(`  - Debug: Prerelease flag: ${isPrerelease} (Type: ${typeof isPrerelease})`, 'magenta');

        // Handle existing release/tag same as public
        const existingRelease = await findReleaseByTagSafe(octokit, PRIVATE_REPO_OWNER, PRIVATE_REPO_NAME, `v${version}`);
        const releaseExists = Boolean(existingRelease);
        const existingReleaseId = existingRelease?.id;

        let tagExistsPrivate = false;
        try { await octokit.git.getRef({ owner: PRIVATE_REPO_OWNER, repo: PRIVATE_REPO_NAME, ref: `tags/v${version}` }); tagExistsPrivate = true;} catch {}

        if (releaseExists || tagExistsPrivate) {
            if (!forceFlag) {
              const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
              const ans2 = await new Promise(res => rl2.question(`⚠️ Ya existe un release/tag v${version} en repo privado. ¿Reemplazarlo? (y/N): `, res));
              rl2.close();
              if (!['y', 'Y', 'yes', 'YES'].includes(ans2.trim())) {
                throw new Error('Operación cancelada por el usuario.');
              }
            }
            log('🔄 Eliminando release y tag previos en repo privado...', 'yellow');
            if (releaseExists) {
              await octokit.repos.deleteRelease({ owner: PRIVATE_REPO_OWNER, repo: PRIVATE_REPO_NAME, release_id: existingReleaseId });
            }
            if (tagExistsPrivate) {
              try { await octokit.git.deleteRef({ owner: PRIVATE_REPO_OWNER, repo: PRIVATE_REPO_NAME, ref: `tags/v${version}` }); } catch {}
            }
        }

        const { data: privateRelease } = await octokit.repos.createRelease({
            owner: PRIVATE_REPO_OWNER,
            repo: PRIVATE_REPO_NAME,
            tag_name: `v${version}`,
            name: `📝 Build v${version} Info`,
            body,
            prerelease: isPrerelease,
            draft: false
        });

        log(`✨ Release informativa creada en ${PRIVATE_REPO_NAME}!`, 'green');
        log(`  • URL: ${privateRelease.html_url}`, 'green');

    } catch (error) {
        log(`⚠️ Error al publicar en el repo privado: ${error.message}`, 'yellow');
        log('   Esto no es un error crítico, el release público fue exitoso.', 'yellow');
    }
}

async function main() {
  const args = process.argv.slice(2);
  const originalDir = process.cwd();
  
  // Parse arguments
  const isPrerelease = args.includes('--prerelease') || process.env.npm_config_prerelease !== undefined;
  const forceFlag = args.includes('--force') || args.includes('-f');
  const versionArgs = args.filter(arg => arg !== '--prerelease' && arg !== '--force' && arg !== '-f');
  
  if (versionArgs.length === 0) {
    log('🚀 LuminaKraft Launcher - Release Local', 'bright');
    log('');
    log('Uso:', 'cyan');
    log('  node release.js <version> [--prerelease]     Crear nueva release', 'yellow');
    log('  node release.js patch [--prerelease]         Incrementar versión patch (0.3.1 → 0.3.2)', 'yellow');
    log('  node release.js minor [--prerelease]         Incrementar versión minor (0.3.1 → 0.4.0)', 'yellow');
    log('  node release.js major [--prerelease]         Incrementar versión major (0.3.1 → 1.0.0)', 'yellow');
    log('');
    log('Ejemplos:', 'cyan');
    log('  node release.js 0.4.0                        Release versión 0.4.0', 'green');
    log('  node release.js 0.4.0 --prerelease           Release versión pre-release 0.4.0', 'green');
    log('  node release.js patch                        Release siguiente versión patch', 'green');
    log('  node release.js 1.0.0-beta.1 --prerelease    Release versión beta', 'green');
    log('');
    log(`Versión actual: ${getCurrentVersion()}`, 'magenta');
    log(`Plataforma: ${os.platform()}`, 'magenta');
    process.exit(0);
  }

  // Get version argument
  const versionArg = versionArgs[0];
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
    log('\n🚀 Iniciando proceso de release', 'bright');
    log(`📊 Versión actual: ${getCurrentVersion()}`, 'magenta');
    log(`🎯 Nueva versión: ${newVersion}${isPrerelease ? ' (pre-release)' : ''}`, 'green');
    log(`💻 Plataforma: ${os.platform()}`, 'cyan');
    log('');

    // Actualizar versión
    updateVersion(newVersion, isPrerelease);

    // Commit, tag and push before building/publishing
    try {
      log('📚 Commit y tag en Git...', 'cyan');
      execSync('git add -A', { stdio: 'inherit' });
      // Realizar commit solo si hay cambios
      try {
        execSync(`git commit -m "chore(release): v${newVersion}${isPrerelease ? ' (pre-release)' : ''}"`, { stdio: 'inherit' });
      } catch { /* Sin cambios que commitear */ }

      // Reemplazar tag si ya existe
      let tagExists = false;
      try {
        execSync(`git rev-parse --quiet --verify refs/tags/v${newVersion}`, { stdio: 'ignore' });
        tagExists = true;
      } catch {}

      if (tagExists) {
        if (!forceFlag) {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await new Promise(res => rl.question(`⚠️ El tag v${newVersion} ya existe. ¿Reemplazarlo? (y/N): `, res));
          rl.close();
          if (!['y', 'Y', 'yes', 'YES'].includes(answer.trim())) {
            throw new Error('Operación cancelada por el usuario.');
          }
        }
        execSync(`git tag -d v${newVersion}`, { stdio: 'inherit' });
      }

      // Crear/forzar tag
      execSync(`git tag -a -f v${newVersion} -m "v${newVersion}"`, { stdio: 'inherit' });

      // Push commit (si lo hubo) y tag forzado
      execSync('git push', { stdio: 'inherit' });
      execSync(`git push --force origin v${newVersion}`, { stdio: 'inherit' });

      log('✅ Commit y tag enviados a remoto', 'green');
    } catch (gitErr) {
      log(`⚠️ No se pudo hacer commit/push: ${gitErr.message}`, 'yellow');
    }

    // Construir
    buildApp();

    // Verificar token y crear cliente Octokit una vez
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN no encontrado. Revisa tu archivo .env o las variables de entorno del sistema.');
    }
    log(`🔑 Token encontrado: ${token.substring(0, 12)}...`, 'cyan');
    const octokit = new Octokit({
      auth: token,
      userAgent: 'LuminaKraft-Launcher-Release-Script'
    });

    // Publicar en repo público
    const publicRelease = await publishToPublic(newVersion, isPrerelease, forceFlag, octokit);

    // Si es exitoso, publicar en repo privado
    if (publicRelease) {
      await publishToPrivate(newVersion, isPrerelease, publicRelease.html_url, forceFlag, octokit);
    }

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