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

// Colores para la consola
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

// Función para imprimir mensajes con color
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Obtener la ruta del directorio .tauri
const homeDir = os.homedir();
const tauriDir = path.join(homeDir, '.tauri');
const nsisDir = path.join(tauriDir, 'NSIS');

// URLs de las dependencias de NSIS
const nsisDeps = [
  {
    name: 'nsis_tauri_utils.dll',
    url: 'https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.4.2/nsis_tauri_utils.dll'
  }
];

// Crear directorio si no existe
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    log(`📁 Creando directorio: ${dir}`, 'cyan');
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Función para seguir redirecciones HTTP
function followRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    let redirectCount = 0;
    
    function request(currentUrl) {
      const protocol = currentUrl.startsWith('https:') ? https : http;
      
      protocol.get(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      }, (response) => {
        // Manejar redirecciones
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          if (redirectCount >= maxRedirects) {
            reject(new Error(`Demasiadas redirecciones (${redirectCount})`));
            return;
          }
          
          redirectCount++;
          const newUrl = new URL(response.headers.location, currentUrl).href;
          log(`🔄 Redirigiendo a: ${newUrl}`, 'blue');
          request(newUrl);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Error HTTP: ${response.statusCode}`));
          return;
        }
        
        resolve(response);
      }).on('error', reject);
    }
    
    request(url);
  });
}

// Descargar archivo con manejo de redirecciones y reintentos
async function downloadFile(url, destPath, maxRetries = 5, retryDelay = 2000) {
  return new Promise(async (resolve, reject) => {
    log(`📥 Descargando ${path.basename(destPath)}...`, 'cyan');
    
    const fileStream = fs.createWriteStream(destPath);
    let retries = 0;
    
    const tryDownload = async () => {
      try {
        const response = await followRedirects(url);
        
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          log(`✅ Descargado: ${path.basename(destPath)}`, 'green');
          resolve();
        });
        
        fileStream.on('error', err => {
          fileStream.close();
          fs.unlinkSync(destPath);
          reject(new Error(`Error de escritura: ${err.message}`));
        });
        
      } catch (error) {
        if (retries < maxRetries) {
          retries++;
          log(`⚠️ Error, reintentando (${retries}/${maxRetries}) en ${retryDelay/1000}s: ${error.message}`, 'yellow');
          setTimeout(tryDownload, retryDelay);
        } else {
          if (fs.existsSync(destPath)) {
            fileStream.close();
            fs.unlinkSync(destPath);
          }
          reject(new Error(`Error después de ${maxRetries} intentos: ${error.message}`));
        }
      }
    };
    
    tryDownload();
  });
}

// Función principal
async function main() {
  try {
    log('🔍 Verificando dependencias de NSIS...', 'bright');
    
    // Asegurar que los directorios existen
    ensureDir(tauriDir);
    ensureDir(nsisDir);
    
    // Descargar cada dependencia si no existe
    for (const dep of nsisDeps) {
      const filePath = path.join(nsisDir, dep.name);
      
      if (fs.existsSync(filePath)) {
        log(`✅ ${dep.name} ya existe, omitiendo...`, 'green');
        continue;
      }
      
      try {
        await downloadFile(dep.url, filePath);
      } catch (error) {
        log(`❌ Error al descargar ${dep.name}: ${error.message}`, 'red');
        throw error;
      }
    }
    
    log('✨ Todas las dependencias de NSIS están disponibles', 'green');
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

main(); 