#!/usr/bin/env node

/**
 * Script para descargar manualmente las dependencias de NSIS para Tauri
 * Este script es útil cuando la compilación para Windows falla con error 503
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

// URL de la dependencia NSIS que suele fallar
const NSIS_URL = 'https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.4.2/nsis_tauri_utils.dll';

// Directorio de cache de Tauri
const homeDir = os.homedir();
const tauriCacheDir = path.join(homeDir, '.tauri');
const nsisDir = path.join(tauriCacheDir, 'nsis');

console.log('🔍 Descargando dependencias de NSIS para Tauri...');

// Crear directorios si no existen
if (!fs.existsSync(tauriCacheDir)) {
  fs.mkdirSync(tauriCacheDir, { recursive: true });
  console.log(`✅ Directorio creado: ${tauriCacheDir}`);
}

if (!fs.existsSync(nsisDir)) {
  fs.mkdirSync(nsisDir, { recursive: true });
  console.log(`✅ Directorio creado: ${nsisDir}`);
}

// Función para descargar un archivo
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Error al descargar: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`✅ Archivo descargado: ${destPath}`);
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Eliminar archivo parcial
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {}); // Eliminar archivo parcial
      reject(err);
    });
  });
}

// Descargar el archivo NSIS
const nsisUtilsPath = path.join(nsisDir, 'nsis_tauri_utils.dll');

downloadFile(NSIS_URL, nsisUtilsPath)
  .then(() => {
    console.log('✅ Todas las dependencias de NSIS han sido descargadas correctamente');
    console.log('   Ahora puedes ejecutar el script de release sin problemas');
  })
  .catch((error) => {
    console.error(`❌ Error: ${error.message}`);
    console.error('   Por favor, intenta descargar el archivo manualmente y colócalo en:');
    console.error(`   ${nsisUtilsPath}`);
  }); 