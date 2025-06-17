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
  const numericVersion = newVersion.match(/^\d+\.\d+\.\d+/)[0];
  const files = [
    {
      path: 'package.json',
      update: (content) => {
        const pkg = JSON.parse(content);
        pkg.version = numericVersion;
        pkg.isPrerelease = isPrerelease;
        return JSON.stringify(pkg, null, 2);
      }
    },
    {
      path: 'src-tauri/tauri.conf.json',
      update: (content) => {
        const config = JSON.parse(content);
        config.version = numericVersion;
        return JSON.stringify(config, null, 2);
      }
    },
    {
      path: 'src-tauri/Cargo.toml',
      update: (content) => {
        return content.replace(/version\s*=\s*".*?"/, `version = "${numericVersion}"`);
      }
    },
    {
      path: 'src/components/Layout/Sidebar.tsx',
      update: (content) => {
        return content.replace(/const\s+currentVersion\s*=\s*".*?"/, `const currentVersion = "${newVersion}"`);
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
    const platform = os.platform();
    
    if (platform === 'darwin') {
      // En macOS, construir para todas las plataformas
      
      // 1. Primero macOS Intel
      log(`🎯 Construyendo para macOS Intel (x86_64)...`, 'cyan');
      execSync('rustup target add x86_64-apple-darwin', { stdio: 'inherit' });
      execSync('npm run tauri build -- --target x86_64-apple-darwin', { stdio: 'inherit' });
      
      // 2. Luego macOS ARM (Apple Silicon)
      log(`🎯 Construyendo para macOS ARM (Apple Silicon)...`, 'cyan');
      execSync('npm run tauri build -- --target aarch64-apple-darwin', { stdio: 'inherit' });
      
      // Función para verificar si Homebrew está instalado
      function checkDocker() {
        try {
          // Primero verificar si Docker está instalado
          execSync('which docker', { stdio: 'pipe' });
          
          // Luego verificar si Docker está en ejecución
          try {
            execSync('docker ps', { stdio: 'pipe' });
            log('✅ Docker está instalado y en ejecución', 'green');
            return true;
          } catch (runError) {
            log('⚠️ Docker está instalado pero no está en ejecución', 'yellow');
            log('   Por favor, inicia Docker Desktop y vuelve a intentarlo', 'yellow');
            return false;
          }
        } catch (error) {
          log('⚠️ Docker no está instalado', 'yellow');
          log('   Por favor, instala Docker Desktop desde https://www.docker.com/products/docker-desktop/', 'yellow');
          return false;
        }
      }
      
      function isHomebrewInstalled() {
        try {
          execSync('which brew', { stdio: 'pipe' });
          return true;
        } catch (error) {
          return false;
        }
      }
      
      // Función para instalar herramientas con Homebrew
      function installWithHomebrew(packages, options = {}) {
        const { tap } = options;
        
        try {
          if (tap) {
            log(`🍺 Añadiendo tap: ${tap}...`, 'cyan');
            execSync(`brew tap ${tap}`, { stdio: 'inherit' });
          }
          
          log(`🍺 Instalando con Homebrew: ${packages.join(', ')}...`, 'cyan');
          execSync(`brew install ${packages.join(' ')}`, { stdio: 'inherit' });
          return true;
        } catch (error) {
          log(`⚠️ Error al instalar con Homebrew: ${error.message}`, 'yellow');
          return false;
        }
      }
      
      // Verificar si Homebrew está instalado
      const hasHomebrew = isHomebrewInstalled();
      if (hasHomebrew) {
        log('✅ Homebrew detectado, se pueden instalar dependencias automáticamente', 'green');
      } else {
        log('⚠️ Homebrew no detectado, las dependencias deberán instalarse manualmente', 'yellow');
      }
      
      // 3. Windows (requiere configuración de cross-compilation)
      log(`🎯 Verificando requisitos para compilación de Windows...`, 'cyan');
      
      // Verificar si tenemos las herramientas necesarias para Windows
      let canBuildWindows = false;
      try {
        // Verificar si existe la target de Rust para Windows
        execSync('rustup target add x86_64-pc-windows-msvc', { stdio: 'inherit' });
        
        // Verificar si Docker está disponible para compilación cruzada
        const dockerAvailable = checkDocker();
        
        if (dockerAvailable) {
          log('✅ Se usará Docker para compilación cruzada de Windows', 'green');
          canBuildWindows = true;
        } else {
          // Método alternativo si Docker no está disponible
          log('⚠️ Docker no está disponible, intentando método alternativo para Windows...', 'yellow');
          
          try {
            // Verificar si está instalado Visual Studio para Windows
            try {
              execSync('which xcrun', { stdio: 'pipe' });
              log('✅ Toolchain para Windows detectado (xcrun)', 'green');
              canBuildWindows = true;
            } catch (error) {
              log('⚠️ No se detectó xcrun para Windows', 'yellow');
              
              // Intentar detectar mingw como alternativa
              try {
                execSync('which x86_64-w64-mingw32-gcc || echo "No instalado"', { stdio: 'pipe' });
                log('✅ Toolchain para Windows detectado (mingw)', 'green');
                canBuildWindows = true;
              } catch (mingwError) {
                log('⚠️ No se detectó mingw para Windows', 'yellow');
                
                // Instalar automáticamente si tenemos Homebrew
                if (hasHomebrew) {
                  log('🔄 Intentando instalar toolchain para Windows automáticamente...', 'cyan');
                  
                  // Instalar dependencias necesarias para Windows
                  const installed = installWithHomebrew(['llvm']);
                  
                  if (installed) {
                    log('✅ LLVM instalado correctamente', 'green');
                    canBuildWindows = true;
                    
                    // Configurar variables de entorno para Windows con LLVM
                    process.env.CC = 'clang';
                    process.env.CXX = 'clang++';
                  } else {
                    log('❌ No se pudo instalar LLVM', 'red');
                  }
                } else {
                  log('   Para compilar para Windows desde macOS, instala:', 'yellow');
                  log('   brew install llvm', 'yellow');
                }
              }
            }
          } catch (error) {
            log('⚠️ Error al verificar toolchain para Windows', 'yellow');
          }
        }
        
        if (canBuildWindows) {
          log(`🎯 Construyendo para Windows (x86_64) usando Docker...`, 'cyan');
          
          // Crear un Dockerfile temporal para Windows
          const dockerfileWinPath = path.join(__dirname, 'Dockerfile.windows-builder');
          const dockerfileWinContent = `FROM rust:latest
RUN apt-get update && apt-get install -y \\
    curl \\
    build-essential \\
    gcc-mingw-w64 \\
    g++-mingw-w64 \\
    wine64 \\
    nodejs \\
    npm
RUN rustup target add x86_64-pc-windows-gnu
WORKDIR /app`;
          
          fs.writeFileSync(dockerfileWinPath, dockerfileWinContent);
          
          try {
            // Construir la imagen Docker para Windows
            execSync('docker build -t windows-builder -f Dockerfile.windows-builder .', { stdio: 'inherit' });
            log('✅ Imagen Docker para Windows creada correctamente', 'green');
            
            // Crear un script temporal para la compilación en Docker
            const buildWinScriptPath = path.join(__dirname, 'build-windows.sh');
            const buildWinScriptContent = `#!/bin/bash
set -e
cd /app
npm install
npm run tauri build -- --target x86_64-pc-windows-gnu
`;
            fs.writeFileSync(buildWinScriptPath, buildWinScriptContent);
            fs.chmodSync(buildWinScriptPath, '755'); // Hacer ejecutable
            
            // Ejecutar la compilación en Docker
            execSync(`docker run --rm -v "${__dirname}:/app" windows-builder /app/build-windows.sh`, { stdio: 'inherit' });
            log('✅ Build completado para Windows usando Docker', 'green');
            
            // Copiar los archivos compilados a la ubicación esperada
            const winBundleDir = path.join(__dirname, 'src-tauri', 'target', 'x86_64-pc-windows-gnu', 'release', 'bundle');
            const winTargetDir = path.join(__dirname, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'bundle');
            
            // Crear el directorio de destino si no existe
            if (!fs.existsSync(path.dirname(winTargetDir))) {
              fs.mkdirSync(path.dirname(winTargetDir), { recursive: true });
            }
            
            // Copiar los archivos
            if (fs.existsSync(winBundleDir)) {
              execSync(`cp -r "${winBundleDir}" "${path.dirname(winTargetDir)}"`, { stdio: 'inherit' });
              log('✅ Archivos de Windows copiados correctamente', 'green');
            }
            
          } catch (buildError) {
            log(`❌ Error al compilar para Windows: ${buildError.message}`, 'red');
          } finally {
            // Eliminar archivos temporales
            if (fs.existsSync(dockerfileWinPath)) {
              fs.unlinkSync(dockerfileWinPath);
            }
            if (fs.existsSync(buildWinScriptPath)) {
              fs.unlinkSync(buildWinScriptPath);
            }
          }
        } else {
          log('⚠️ Saltando compilación para Windows por falta de herramientas', 'yellow');
        }
      } catch (error) {
        log(`⚠️ No se pudo compilar para Windows: ${error.message}`, 'yellow');
        log('   Esto puede requerir configuración adicional de cross-compilation.', 'yellow');
      }
      
      // 4. Linux (requiere configuración de cross-compilation)
      log(`🎯 Verificando requisitos para compilación de Linux...`, 'cyan');
      
      // Verificar si tenemos las herramientas necesarias para Linux
      let canBuildLinux = false;
      try {
        // Verificar si existe la target de Rust para Linux
        execSync('rustup target add x86_64-unknown-linux-gnu', { stdio: 'inherit' });
        
        // Para Linux, vamos a usar Docker en lugar de cross-compilation directa
        // Reutilizamos la verificación de Docker que ya hicimos antes
        if (dockerAvailable) {
          log('✅ Se usará Docker para compilación cruzada de Linux', 'green');
          
          // Verificar si la imagen de Docker para compilación de Linux existe
          try {
            execSync('docker image ls | grep tauri-builder', { stdio: 'pipe' });
            log('✅ Imagen Docker para Linux detectada', 'green');
            canBuildLinux = true;
          } catch (imageError) {
            log('🔄 Creando imagen Docker para compilación de Linux...', 'cyan');
            
            // Crear un Dockerfile temporal
            const dockerfilePath = path.join(__dirname, 'Dockerfile.tauri-builder');
            const dockerfileContent = `FROM ubuntu:20.04
RUN apt-get update && apt-get install -y \\
    curl \\
    build-essential \\
    libssl-dev \\
    libgtk-3-dev \\
    libwebkit2gtk-4.0-dev \\
    libappindicator3-dev \\
    librsvg2-dev \\
    patchelf \\
    nodejs \\
    npm
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
WORKDIR /app`;
            
            fs.writeFileSync(dockerfilePath, dockerfileContent);
            
            try {
              // Construir la imagen Docker
              execSync('docker build -t tauri-builder -f Dockerfile.tauri-builder .', { stdio: 'inherit' });
              log('✅ Imagen Docker para Linux creada correctamente', 'green');
              canBuildLinux = true;
              
              // Eliminar el Dockerfile temporal
              fs.unlinkSync(dockerfilePath);
            } catch (buildError) {
              log(`❌ Error al crear imagen Docker: ${buildError.message}`, 'red');
              // Eliminar el Dockerfile temporal en caso de error
              if (fs.existsSync(dockerfilePath)) {
                fs.unlinkSync(dockerfilePath);
              }
            }
          }
        } else {
          log('⚠️ Docker no está disponible para compilación de Linux', 'yellow');
          log('   La compilación cruzada para Linux requiere Docker', 'yellow');
          log('   Por favor, instala Docker Desktop desde https://www.docker.com/products/docker-desktop/', 'yellow');
        }
        
        if (canBuildLinux) {
          log(`🎯 Construyendo para Linux (x86_64) usando Docker...`, 'cyan');
          
          // Crear un script temporal para la compilación en Docker
          const buildScriptPath = path.join(__dirname, 'build-linux.sh');
          const buildScriptContent = `#!/bin/bash
set -e
cd /app
npm install
npm run tauri build
`;
          fs.writeFileSync(buildScriptPath, buildScriptContent);
          fs.chmodSync(buildScriptPath, '755'); // Hacer ejecutable
          
          try {
            // Ejecutar la compilación en Docker
            execSync(`docker run --rm -v "${__dirname}:/app" tauri-builder /app/build-linux.sh`, { stdio: 'inherit' });
            log('✅ Build completado para Linux usando Docker', 'green');
            
            // Copiar los archivos compilados a la ubicación esperada
            const linuxBundleDir = path.join(__dirname, 'src-tauri', 'target', 'release', 'bundle');
            const linuxTargetDir = path.join(__dirname, 'src-tauri', 'target', 'x86_64-unknown-linux-gnu', 'release', 'bundle');
            
            // Crear el directorio de destino si no existe
            if (!fs.existsSync(path.dirname(linuxTargetDir))) {
              fs.mkdirSync(path.dirname(linuxTargetDir), { recursive: true });
            }
            
            // Copiar los archivos
            if (fs.existsSync(linuxBundleDir)) {
              execSync(`cp -r "${linuxBundleDir}" "${path.dirname(linuxTargetDir)}"`, { stdio: 'inherit' });
              log('✅ Archivos de Linux copiados correctamente', 'green');
            }
            
          } catch (buildError) {
            log(`❌ Error al compilar para Linux: ${buildError.message}`, 'red');
          } finally {
            // Eliminar el script temporal
            if (fs.existsSync(buildScriptPath)) {
              fs.unlinkSync(buildScriptPath);
            }
          }
        } else {
          log('⚠️ Saltando compilación para Linux por falta de herramientas', 'yellow');
        }
      } catch (error) {
        log(`⚠️ No se pudo compilar para Linux: ${error.message}`, 'yellow');
        log('   Esto puede requerir configuración adicional de cross-compilation.', 'yellow');
      }
      
      log('✅ Proceso de build completado para todas las plataformas posibles', 'green');
    } else {
      // Para Windows y Linux, construir normalmente
      log(`🎯 Construyendo para ${platform}...`, 'cyan');
      execSync('npm run tauri build', { stdio: 'inherit' });
      log('✅ Build completado', 'green');
    }
  } catch (error) {
    log(`❌ Error al construir: ${error.message}`, 'red');
    throw error;
  }
}

function getInstallerFiles() {
  const installers = [];
  const version = getCurrentVersion();
  
  // Definir la carpeta tauri base
  const tauriDir = path.join(__dirname, 'src-tauri');
  
  // Buscar en las carpetas según la plataforma
  const platform = os.platform();
  
  // Función auxiliar para buscar archivos Windows
  function findWindowsFiles(basePath) {
    const windowsFiles = [];
    const msiDir = path.join(basePath, 'bundle', 'msi');
    const nsisDir = path.join(basePath, 'bundle', 'nsis');
    
    if (fs.existsSync(msiDir)) {
      const msiFiles = fs.readdirSync(msiDir).filter(f => f.endsWith('.msi'));
      for (const file of msiFiles) {
        windowsFiles.push({
          type: 'file',
          path: path.join(msiDir, file),
          name: file
        });
      }
      log(`  📦 Encontrados ${msiFiles.length} archivos MSI para Windows`, 'cyan');
    }
    
    if (fs.existsSync(nsisDir)) {
      const nsisFiles = fs.readdirSync(nsisDir).filter(f => f.endsWith('.exe'));
      for (const file of nsisFiles) {
        windowsFiles.push({
          type: 'file',
          path: path.join(nsisDir, file),
          name: file
        });
      }
      log(`  📦 Encontrados ${nsisFiles.length} archivos EXE para Windows`, 'cyan');
    }
    
    return windowsFiles;
  }
  
  // Función auxiliar para buscar archivos Linux
  function findLinuxFiles(basePath) {
    const linuxFiles = [];
    const debianDir = path.join(basePath, 'bundle', 'deb');
    const appimageDir = path.join(basePath, 'bundle', 'appimage');
    
    if (fs.existsSync(debianDir)) {
      const debFiles = fs.readdirSync(debianDir).filter(f => f.endsWith('.deb'));
      for (const file of debFiles) {
        linuxFiles.push({
          type: 'file',
          path: path.join(debianDir, file),
          name: file
        });
      }
      log(`  📦 Encontrados ${debFiles.length} archivos DEB para Linux`, 'cyan');
    }
    
    if (fs.existsSync(appimageDir)) {
      const appimageFiles = fs.readdirSync(appimageDir).filter(f => f.endsWith('.AppImage'));
      for (const file of appimageFiles) {
        linuxFiles.push({
          type: 'file',
          path: path.join(appimageDir, file),
          name: file
        });
      }
      log(`  📦 Encontrados ${appimageFiles.length} archivos AppImage para Linux`, 'cyan');
    }
    
    return linuxFiles;
  }
  
  if (platform === 'win32') {
    // Buscar archivos Windows en la ruta estándar
    const windowsPath = path.join(tauriDir, 'target', 'release');
    installers.push(...findWindowsFiles(windowsPath));
    
  } else if (platform === 'linux') {
    // Buscar archivos Linux en la ruta estándar
    const linuxPath = path.join(tauriDir, 'target', 'release');
    installers.push(...findLinuxFiles(linuxPath));
    
  } else if (platform === 'darwin') {
    const version = getCurrentVersion();
    
    // Definir la carpeta tauri base
    const tauriDir = path.join(__dirname, 'src-tauri');
    
    // Definir las rutas correctas para ambas arquitecturas incluyendo 'target'
    const aarch64Path = path.join(tauriDir, 'target', 'aarch64-apple-darwin', 'release');
    const x86_64Path = path.join(tauriDir, 'target', 'x86_64-apple-darwin', 'release');
    
    log(`🔍 Rutas de búsqueda:`, 'cyan');
    log(`  • ARM64: ${aarch64Path}`, 'cyan');
    log(`  • x86_64: ${x86_64Path}`, 'cyan');
    
    // Primero buscamos x86_64 (Intel) ya que lo compilamos primero
    // Buscar compilados para Intel (x86_64)
    if (fs.existsSync(path.join(x86_64Path, 'bundle', 'dmg'))) {
      const dmgFiles = fs.readdirSync(path.join(x86_64Path, 'bundle', 'dmg')).filter(f => f.endsWith('.dmg'));
      log(`  📦 Encontrados ${dmgFiles.length} archivos DMG para Intel x86_64`, 'cyan');
      
      for (const dmgFile of dmgFiles) {
        installers.push({
          type: 'file',
          path: path.join(x86_64Path, 'bundle', 'dmg', dmgFile),
          name: dmgFile
        });
      }
    } else {
      log(`  ❌ No se encontraron archivos DMG para Intel x86_64 en ${path.join(x86_64Path, 'bundle', 'dmg')}`, 'yellow');
    }
    
    if (fs.existsSync(path.join(x86_64Path, 'bundle', 'macos'))) {
      const appFiles = fs.readdirSync(path.join(x86_64Path, 'bundle', 'macos')).filter(f => f.endsWith('.app'));
      log(`  📦 Encontrados ${appFiles.length} archivos APP para Intel x86_64`, 'cyan');
      
      for (const appFile of appFiles) {
        // Only process the app file that matches our product name pattern
        if (appFile.startsWith("LuminaKraft")) {
          const formattedName = `LuminaKraft.Launcher_${version}_x64.app.zip`;
          
          installers.push({
            isApp: true,
            originalPath: path.join(x86_64Path, 'bundle', 'macos', appFile),
            formattedName
          });
          
          // Only add one app file
          break;
        }
      }
    } else {
      log(`  ❌ No se encontraron archivos APP para Intel x86_64 en ${path.join(x86_64Path, 'bundle', 'macos')}`, 'yellow');
    }
    
    // Buscar compilados para Apple Silicon (aarch64)
    if (fs.existsSync(path.join(aarch64Path, 'bundle', 'dmg'))) {
      const dmgFiles = fs.readdirSync(path.join(aarch64Path, 'bundle', 'dmg')).filter(f => f.endsWith('.dmg'));
      log(`  📦 Encontrados ${dmgFiles.length} archivos DMG para Apple Silicon`, 'cyan');
      
      for (const dmgFile of dmgFiles) {
        installers.push({
          type: 'file',
          path: path.join(aarch64Path, 'bundle', 'dmg', dmgFile),
          name: dmgFile
        });
      }
    } else {
      log(`  ❌ No se encontraron archivos DMG para Apple Silicon en ${path.join(aarch64Path, 'bundle', 'dmg')}`, 'yellow');
    }
    
    if (fs.existsSync(path.join(aarch64Path, 'bundle', 'macos'))) {
      const appFiles = fs.readdirSync(path.join(aarch64Path, 'bundle', 'macos')).filter(f => f.endsWith('.app'));
      log(`  📦 Encontrados ${appFiles.length} archivos APP para Apple Silicon`, 'cyan');
      
      for (const appFile of appFiles) {
        // Only process the app file that matches our product name pattern
        if (appFile.startsWith("LuminaKraft")) {
          const formattedName = `LuminaKraft.Launcher_${version}_aarch64.app.zip`;
          
          installers.push({
            isApp: true,
            originalPath: path.join(aarch64Path, 'bundle', 'macos', appFile),
            formattedName
          });
          
          // Only add one app file
          break;
        }
      }
    } else {
      log(`  ❌ No se encontraron archivos APP para Apple Silicon en ${path.join(aarch64Path, 'bundle', 'macos')}`, 'yellow');
    }
    
    // Si estamos en macOS, también buscar artefactos de Windows y Linux (cross-compilation)
    log(`🔍 Buscando artefactos de Windows (cross-compilation)...`, 'cyan');
    const windowsPath = path.join(tauriDir, 'target', 'x86_64-pc-windows-msvc', 'release');
    if (fs.existsSync(windowsPath)) {
      const windowsFiles = findWindowsFiles(windowsPath);
      if (windowsFiles.length > 0) {
        installers.push(...windowsFiles);
        log(`  ✅ Se encontraron ${windowsFiles.length} archivos de Windows`, 'green');
      } else {
        log(`  ⚠️ No se encontraron archivos de Windows en ${windowsPath}`, 'yellow');
      }
    } else {
      log(`  ⚠️ No existe la ruta para Windows: ${windowsPath}`, 'yellow');
    }
    
    log(`🔍 Buscando artefactos de Linux (cross-compilation)...`, 'cyan');
    const linuxPath = path.join(tauriDir, 'target', 'x86_64-unknown-linux-gnu', 'release');
    if (fs.existsSync(linuxPath)) {
      const linuxFiles = findLinuxFiles(linuxPath);
      if (linuxFiles.length > 0) {
        installers.push(...linuxFiles);
        log(`  ✅ Se encontraron ${linuxFiles.length} archivos de Linux`, 'green');
      } else {
        log(`  ⚠️ No se encontraron archivos de Linux en ${linuxPath}`, 'yellow');
      }
    } else {
      log(`  ⚠️ No existe la ruta para Linux: ${linuxPath}`, 'yellow');
    }
  }
  
  log(`  📦 Total: ${installers.length} archivos para subir`, 'cyan');
  
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
    // If release/tag exists, check for existing assets
    const existingRelease = await findReleaseByTagSafe(octokit, PUBLIC_REPO_OWNER, PUBLIC_REPO_NAME, `v${version}`);
    const releaseExists = Boolean(existingRelease);
    const existingReleaseId = existingRelease?.id;
    
    // Nueva lógica: verificar si la release existe
    let release;
    let existingAssetNames = [];
    
    if (releaseExists) {
      log('🔍 Se encontró una release existente con la misma versión', 'yellow');
      
      // Obtener lista de archivos ya subidos
      const { data: existingAssets } = await octokit.repos.listReleaseAssets({
        owner: PUBLIC_REPO_OWNER,
        repo: PUBLIC_REPO_NAME,
        release_id: existingReleaseId
      });
      
      existingAssetNames = existingAssets.map(asset => asset.name);
      log(`📋 La release existente tiene ${existingAssets.length} archivos subidos`, 'yellow');
      
      // Usar la release existente
      release = existingRelease;
    } else {
      // No existe la release, crear una nueva
      log('🔄 Creando nueva release en GitHub...', 'cyan');
      
      const { data: newRelease } = await octokit.repos.createRelease({
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
- **Apple Silicon DMG** (\`*_aarch64.dmg\`) - Para M1/M2/M3/M4
- **Apple Silicon APP** (\`*_aarch64.app.zip\`) - Versión portátil para ARM (aplicación .app comprimida)
- **Intel Mac DMG** (\`*_x64.dmg\`) - Para Macs Intel
- **Intel Mac APP** (\`*_x64.app.zip\`) - Versión portátil para Intel (aplicación .app comprimida)

## 🔗 Enlaces
- 💬 **Discord**: [Únete a nuestra comunidad](https://discord.gg/UJZRrcUFMj)
- 🐛 **Reportar bugs**: [GitHub Issues](https://github.com/kristiangarcia/luminakraft-launcher-releases/issues)

${isPrerelease ? '⚠️ **Advertencia**: Esta versión puede contener errores. Úsala bajo tu propio riesgo.' : '✅ **Versión estable y recomendada para todos los usuarios.**'}`,
        draft: false,
        prerelease: isPrerelease
      });
      
      release = newRelease;
    }

    // Obtener lista de instaladores
    log('📄 Preparando instaladores...', 'cyan');
    const installers = getInstallerFiles();
      
    if (installers.length === 0) {
      throw new Error('No se encontraron instaladores para publicar');
    }

    // Subir los archivos al release
    log('📤 Subiendo archivos al release...', 'cyan');
    let uploadedCount = 0;
    let skippedCount = 0;
    
    for (const installer of installers) {
      // Manejar instaladores según el tipo
      if (installer.isApp) {
        // Archivos .app (formato especial para macOS)
        const filePath = installer.originalPath;
        const zipFileName = installer.formattedName;
        
        // Verificar si el archivo ya existe en la release
        if (existingAssetNames.includes(zipFileName)) {
          log(`  ⏩ Omitiendo ${zipFileName} (ya existe en la release)`, 'yellow');
          skippedCount++;
          continue;
        }
        
        log(`  📦 Subiendo ${path.basename(filePath)} como ${zipFileName}...`, 'cyan');
        
        // Crear un archivo .zip del .app para poder subirlo
        const zipFilePath = path.join(path.dirname(ARTIFACTS_PATH), 'temp_app_upload.zip');
        
        // Crear directorio temporal si no existe
        const tempDir = path.dirname(zipFilePath);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        try {
          // Comprimir el .app en un .zip
          log(`  📦 Comprimiendo ${path.basename(filePath)}...`, 'cyan');
          execSync(`cd "${path.dirname(filePath)}" && zip -r "${zipFilePath}" "${path.basename(filePath)}"`, { stdio: 'inherit' });
          
          // Subir el .zip con el nombre formateado
          await octokit.repos.uploadReleaseAsset({
            owner: PUBLIC_REPO_OWNER,
            repo: PUBLIC_REPO_NAME,
            release_id: release.id,
            name: zipFileName,
            data: fs.readFileSync(zipFilePath)
          });
          
          // Limpiar el archivo zip temporal
          if (fs.existsSync(zipFilePath)) {
            fs.unlinkSync(zipFilePath);
          }
          
          log(`  ✅ Subido: ${zipFileName}`, 'green');
          uploadedCount++;
        } catch (error) {
          log(`  ❌ Error al procesar .app: ${error.message}`, 'red');
        }
      } else if (installer.type === 'file') {
        // Archivos normales (DMG, etc)
        const filePath = installer.path;
        const fileName = installer.name;
        
        // Verificar si el archivo ya existe en la release
        if (existingAssetNames.includes(fileName)) {
          log(`  ⏩ Omitiendo ${fileName} (ya existe en la release)`, 'yellow');
          skippedCount++;
          continue;
        }
        
        log(`  📦 Subiendo ${fileName}...`, 'cyan');
        try {
          await octokit.repos.uploadReleaseAsset({
            owner: PUBLIC_REPO_OWNER,
            repo: PUBLIC_REPO_NAME,
            release_id: release.id,
            name: fileName,
            data: fs.readFileSync(filePath)
          });
          log(`  ✅ Subido: ${fileName}`, 'green');
          uploadedCount++;
        } catch (error) {
          log(`  ❌ Error al subir ${fileName}: ${error.message}`, 'red');
        }
      } else {
        // Formato antiguo (string) - compatibilidad con versiones previas
        const filePath = path.join(ARTIFACTS_PATH, installer);
        const fileName = path.basename(installer);
        
        // Verificar si el archivo ya existe en la release
        if (existingAssetNames.includes(fileName)) {
          log(`  ⏩ Omitiendo ${fileName} (ya existe en la release)`, 'yellow');
          skippedCount++;
          continue;
        }
        
        log(`  📦 Subiendo ${fileName}...`, 'cyan');
        try {
          await octokit.repos.uploadReleaseAsset({
            owner: PUBLIC_REPO_OWNER,
            repo: PUBLIC_REPO_NAME,
            release_id: release.id,
            name: fileName,
            data: fs.readFileSync(filePath)
          });
          log(`  ✅ Subido: ${fileName}`, 'green');
          uploadedCount++;
        } catch (error) {
          log(`  ❌ Error al subir ${fileName}: ${error.message}`, 'red');
        }
      }
    }
    
    log(`\n✨ Release v${version}${isPrerelease ? ' (pre-release)' : ''} actualizada!`, 'green');
    log('📝 Resumen:', 'cyan');
    log(`  • ${uploadedCount} archivos nuevos subidos`, 'green');
    log(`  • ${skippedCount} archivos omitidos (ya existentes)`, 'yellow');
    log(`  • Release ${releaseExists ? 'actualizada' : 'creada'} en GitHub`, 'green');
    log(`  • URL: ${release.html_url}`, 'green');

    return release;
    
  } catch (error) {
    log(`❌ Error al publicar en el repo público: ${error.message}`, 'red');
    throw error;
  }
}

async function publishToPrivate(version, isPrerelease, publicReleaseUrl, forceFlag, octokit) {
    log(`📝 Creando/actualizando release informativa en el repo privado...`, 'cyan');
    try {
        const commitHash = execSync('git rev-parse HEAD').toString().trim();
        const platform = os.platform();

        // Construir el mensaje sobre los compilados
        let buildsCompleted = '';
        const platformInfo = {
            win32: "Windows",
            linux: "Linux",
            darwin: "macOS"
        };
        
        // Buscar si ya existe una release
        const existingRelease = await findReleaseByTagSafe(octokit, PRIVATE_REPO_OWNER, PRIVATE_REPO_NAME, `v${version}`);
        const releaseExists = Boolean(existingRelease);
        
        // Si existe, mantener la información de compilaciones previas
        if (releaseExists) {
            log(`🔍 Se encontró una release existente en el repo privado`, 'yellow');
            
            // Extraer información de compilaciones previas del body
            const bodyText = existingRelease.body || '';
            
            // Buscar info de compilaciones en el texto
            const compiledPattern = /### 📦 \*\*Builds Completados\*\*\n([\s\S]*?)(?:\n\n|$)/;
            const compiledMatch = bodyText.match(compiledPattern);
            
            if (compiledMatch && compiledMatch[1]) {
                // Extraer las plataformas ya compiladas
                const existingPlatforms = compiledMatch[1].split('\n').filter(line => line.includes('✅'));
                
                // Agregar la plataforma actual
                switch (platform) {
                    case 'win32':
                        buildsCompleted = `${compiledMatch[1].replace(/- ❌ \*\*Windows\*\*: No compilado/g, '- ✅ **Windows**: MSI + NSIS')}`;
                        break;
                    case 'linux':
                        buildsCompleted = `${compiledMatch[1].replace(/- ❌ \*\*Linux\*\*: No compilado/g, '- ✅ **Linux**: AppImage + DEB')}`;
                        break;
                    case 'darwin':
                        buildsCompleted = `${compiledMatch[1].replace(/- ❌ \*\*macOS\*\*: No compilado/g, '- ✅ **macOS**: DMG + APP (Apple Silicon e Intel)')}`;
                        break;
                }
            } else {
                // Si no encuentra el patrón, crear info desde cero
                switch (platform) {
                    case 'win32':
                        buildsCompleted = `- ✅ **Windows**: MSI + NSIS\n- ❌ **Linux**: No compilado\n- ❌ **macOS**: No compilado`;
                        break;
                    case 'linux':
                        buildsCompleted = `- ❌ **Windows**: No compilado\n- ✅ **Linux**: AppImage + DEB\n- ❌ **macOS**: No compilado`;
                        break;
                    case 'darwin':
                        buildsCompleted = `- ❌ **Windows**: No compilado\n- ❌ **Linux**: No compilado\n- ✅ **macOS**: DMG + APP (Apple Silicon e Intel)`;
                        break;
                }
            }
        } else {
            // Si no existe, crear info desde cero
            switch (platform) {
                case 'win32':
                    buildsCompleted = `- ✅ **Windows**: MSI + NSIS\n- ❌ **Linux**: No compilado\n- ❌ **macOS**: No compilado`;
                    break;
                case 'linux':
                    buildsCompleted = `- ❌ **Windows**: No compilado\n- ✅ **Linux**: AppImage + DEB\n- ❌ **macOS**: No compilado`;
                    break;
                case 'darwin':
                    buildsCompleted = `- ❌ **Windows**: No compilado\n- ❌ **Linux**: No compilado\n- ✅ **macOS**: DMG + APP (Apple Silicon e Intel)`;
                    break;
                default:
                    buildsCompleted = `- ❓ **Plataforma desconocida**`;
            }
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

        // Actualizar o crear release según corresponda
        if (releaseExists) {
            // Actualizar el release existente
            await octokit.repos.updateRelease({
                owner: PRIVATE_REPO_OWNER,
                repo: PRIVATE_REPO_NAME,
                release_id: existingRelease.id,
                body,
                prerelease: isPrerelease
            });
            
            log(`✨ Release informativa actualizada en ${PRIVATE_REPO_NAME}!`, 'green');
            log(`  • URL: ${existingRelease.html_url}`, 'green');
            log(`  • Se añadió información de compilación para ${platformInfo[platform] || platform}`, 'green');
        } else {
            // Crear nuevo release
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
        }

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

  // Check if we should increment version or use given one
  if (['major', 'minor', 'patch'].includes(versionArg)) {
    const currentVersion = getCurrentVersion();
    const versionParts = currentVersion.split('.');
    
    if (versionArg === 'major') {
      newVersion = `${parseInt(versionParts[0]) + 1}.0.0`;
    } else if (versionArg === 'minor') {
      newVersion = `${versionParts[0]}.${parseInt(versionParts[1]) + 1}.0`;
    } else if (versionArg === 'patch') {
      newVersion = `${versionParts[0]}.${versionParts[1]}.${parseInt(versionParts[2]) + 1}`;
    }
  } else {
    newVersion = versionArg;
  }

  validateVersion(newVersion);

  log('\n🚀 Iniciando proceso de release', 'bright');
  log(`📊 Versión actual: ${getCurrentVersion()}`, 'cyan');
  log(`🎯 Nueva versión: ${newVersion}${isPrerelease ? ' (pre-release)' : ''}`, 'cyan');
  log(`💻 Plataforma: ${os.platform()}`, 'cyan');
  log('');

  // Update version number in files
  try {
    updateVersion(newVersion, isPrerelease);
  } catch (error) {
    log(`❌ Error al actualizar versión: ${error.message}`, 'red');
    process.exit(1);
  }

  if (process.env.SKIP_GIT !== 'true') {
    // Commit and push tag
    try {
      log('📚 Commit y tag en Git...', 'cyan');
      
      // Check Git status
      const gitStatus = execSync('git status').toString();
      console.log(gitStatus);
      
      // Add changes
      if (!gitStatus.includes('nothing to commit')) {
        execSync('git add .', { stdio: 'inherit' });
        execSync(`git commit -m "build: release v${newVersion}"`, { stdio: 'inherit' });
      }
      
      // Check if tag exists
      let tagExists = false;
      try {
        execSync(`git show-ref --tags v${newVersion}`, { stdio: 'pipe' });
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise(res => rl.question(`⚠️ El tag v${newVersion} ya existe. ¿Reemplazarlo? (y/N): `, res));
        rl.close();
        
        if (['y', 'Y', 'yes', 'YES'].includes(answer.trim())) {
          execSync(`git tag -d v${newVersion}`, { stdio: 'inherit' });
          tagExists = true;  // Marcar que estamos reemplazando un tag existente
        } else {
          log('❌ Operación cancelada por el usuario', 'red');
          process.exit(1);
        }
      } catch (error) {
        // Tag doesn't exist, continue
      }
      
      // Create tag and push changes
      execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { stdio: 'inherit' });
      execSync('git push', { stdio: 'inherit' });
      
      // Si estamos reemplazando un tag, usar --force
      if (tagExists) {
        execSync(`git push --force origin v${newVersion}`, { stdio: 'inherit' });
        log('✅ Tag reemplazado en remoto', 'green');
      } else {
        execSync(`git push origin v${newVersion}`, { stdio: 'inherit' });
        log('✅ Tag creado en remoto', 'green');
      }
      
      log('✅ Commit y tag enviados a remoto', 'green');
    } catch (error) {
      log(`❌ Error en Git: ${error.message}`, 'red');
      process.exit(1);
    }
  }

  // Build the app
  try {
    buildApp();
  } catch (error) {
    log(`❌ Error al construir la aplicación: ${error.message}`, 'red');
    process.exit(1);
  }

  // Read GitHub token
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    log(`❌ No se encontró el token de GitHub. Cree un archivo .env con GITHUB_TOKEN=su_token_aquí`, 'red');
    process.exit(1);
  }
  
  log('🔑 Token encontrado: ' + token.substring(0, 10) + '...', 'green');

  // Create release on GitHub
  try {
    // Set up Octokit
    const octokit = new Octokit({
      auth: token
    });
    
    // Publish the release
    let publicRelease;
    try {
      // Upload to public repo
      publicRelease = await publishToPublic(newVersion, isPrerelease, forceFlag, octokit);
      if (!publicRelease) {
        throw new Error('No se pudo crear la release pública.');
      }
    } catch (error) {
      log(`❌ Error al publicar en el repo público: ${error.message}`, 'red');
      // Intentar crear release informativa igualmente en el repo privado
      try {
        // Pasar URL falsa ya que no se creó la release pública
        await publishToPrivate(newVersion, isPrerelease, "ERROR: No se creó la release pública", forceFlag, octokit);
        log(`✅ Se creó la release informativa en el repo privado a pesar del error en la release pública.`, 'green');
      } catch (privateError) {
        log(`❌ Error al publicar en el repo privado: ${privateError.message}`, 'red');
      }
      throw error;
    }

    // Crear release informativa en el repo privado
    try {
      await publishToPrivate(newVersion, isPrerelease, publicRelease.html_url, forceFlag, octokit);
    } catch (error) {
      log(`⚠️ Error al publicar en el repo privado: ${error.message}`, 'yellow');
      log('   Esto no es un error crítico, el release público fue exitoso.', 'yellow');
    }

  } catch (error) {
    log(`\n❌ Error en el proceso de release:`, 'red');
    log(error.message, 'red');
    process.exit(1);
  }

  log(`\n✨ Release v${newVersion}${isPrerelease ? ' (pre-release)' : ''} completada con éxito!`, 'green');
  log(`   Actualiza tu documentación y notifica al equipo.`, 'cyan');

  process.exit(0);
}

main(); 