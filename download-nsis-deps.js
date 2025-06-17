#!/usr/bin/env node

/**
 * Script para descargar manualmente las dependencias de NSIS para Tauri
 * Este script es útil cuando la compilación para Windows falla con error 503
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import os from 'os';
import { fileURLToPath } from 'url';

// Obtener el directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Función para descargar un archivo con soporte para redirecciones
function downloadFile(url, destPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    // Máximo de redirecciones permitidas
    if (redirectCount > 5) {
      reject(new Error('Demasiadas redirecciones'));
      return;
    }
    
    console.log(`Descargando desde: ${url}`);
    
    // Determinar si usar http o https
    const protocol = url.startsWith('https:') ? https : http;
    
    protocol.get(url, (response) => {
      // Manejar redirecciones
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        const newUrl = response.headers.location;
        console.log(`Redirigiendo a: ${newUrl}`);
        return downloadFile(newUrl, destPath, redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Error al descargar: ${response.statusCode}`));
        return;
      }
      
      const file = fs.createWriteStream(destPath);
      
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