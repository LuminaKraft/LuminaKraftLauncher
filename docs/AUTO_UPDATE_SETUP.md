# Sistema de Actualizaciones Automáticas

Este documento describe cómo funciona el sistema de actualizaciones automáticas implementado en LuminaKraft Launcher.

## 🎯 Funcionalidades

- ✅ **Detección automática** de actualizaciones al iniciar la aplicación
- ✅ **Descarga automática** de actualizaciones sin intervención manual
- ✅ **Instalación automática** con progreso en tiempo real
- ✅ **Reinicio automático** de la aplicación después de la instalación
- ✅ **Verificación de firmas** para seguridad
- ✅ **Soporte multiplataforma** (Windows, macOS, Linux)

## 🔧 Configuración

### 1. Dependencias

El sistema utiliza los siguientes plugins de Tauri:

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

```json
// package.json
{
  "dependencies": {
    "@tauri-apps/plugin-updater": "^2",
    "@tauri-apps/plugin-process": "^2"
  }
}
```

### 2. Configuración de Tauri

```json
// src-tauri/tauri.conf.json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://raw.githubusercontent.com/LuminaKraft/LuminakraftLauncher/main/latest.json"
      ],
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

### 3. Generación de Claves

```bash
# Generate signing keys with password protection
tauri signer generate --write-keys ~/.tauri/luminakraft-signing-key

# You'll be prompted for:
# 1. Key password (IMPORTANT: Remember this!)
# 2. Key will be saved to ~/.tauri/luminakraft-signing-key.key
# 3. Public key will be displayed and saved to ~/.tauri/luminakraft-signing-key.pub
```

**⚠️ Important Security Notes:**
- **Private Key**: Keep `~/.tauri/luminakraft-signing-key.key` secret and secure
- **Password**: Remember the password you set - you'll need it for signing
- **Public Key**: This goes in your `tauri.conf.json` and can be shared
- **Backup**: Store the private key and password in a secure password manager

### Adding Keys to GitHub Actions

1. **Add Private Key Secret**:
   - Go to your GitHub repository
   - Navigate to Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `TAURI_SIGNING_PRIVATE_KEY`
   - Value: Content of `~/.tauri/luminakraft-signing-key.key` file
   
2. **Add Password Secret**:
   - Click "New repository secret" again
   - Name: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   - Value: The password you used when generating the key

3. **Add Public Key to Configuration**:
   - Copy the public key from the generator output
   - Add it to `src-tauri/tauri.conf.json` in the updater configuration:

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://api.luminakraft.com/v1/launcher_data.json",
        "https://raw.githubusercontent.com/LuminaKraft/LuminakraftLauncher/main/latest.json"
      ],
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

## 📋 Archivo latest.json

El archivo `latest.json` en la raíz del repositorio define la última actualización disponible:

```json
{
  "version": "0.0.8-alpha.2",
  "notes": "Nueva versión con actualizaciones automáticas implementadas",
  "pub_date": "2025-01-27T10:00:00Z",
  "platforms": {
    "darwin-x86_64": {
      "signature": "SIGNATURE_HERE",
      "url": "https://github.com/LuminaKraft/LuminakraftLauncher/releases/latest/download/LuminaKraft.Launcher_x64.app.tar.gz"
    },
    "darwin-aarch64": {
      "signature": "SIGNATURE_HERE", 
      "url": "https://github.com/LuminaKraft/LuminakraftLauncher/releases/latest/download/LuminaKraft_Launcher_aarch64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "SIGNATURE_HERE",
      "url": "https://github.com/LuminaKraft/LuminakraftLauncher/releases/latest/download/luminakraft-launcher_amd64.AppImage.tar.gz"
    },
    "windows-x86_64": {
      "signature": "SIGNATURE_HERE",
      "url": "https://github.com/LuminaKraft/LuminakraftLauncher/releases/latest/download/LuminaKraft_Launcher_x64-setup.nsis.zip"
    }
  }
}
```

## 🚀 Proceso de Desarrollo

### Uso de la API

```typescript
import { updateService } from './services/updateService';

// Verificar actualizaciones
const updateInfo = await updateService.checkForUpdates();

if (updateInfo.hasUpdate) {
  // Mostrar diálogo al usuario
  console.log(`Actualización disponible: ${updateInfo.latestVersion}`);
  
  // Descargar e instalar automáticamente
  await updateService.downloadAndInstallUpdate((progress, total) => {
    console.log(`Progreso: ${Math.round((progress / total) * 100)}%`);
  });
}
```

### Componentes React

```tsx
// Ejemplo de uso en componente
const [isUpdating, setIsUpdating] = useState(false);
const [progress, setProgress] = useState({ current: 0, total: 0 });

const handleUpdate = async () => {
  setIsUpdating(true);
  try {
    await updateService.downloadAndInstallUpdate((current, total) => {
      setProgress({ current, total });
    });
  } catch (error) {
    console.error('Error updating:', error);
  } finally {
    setIsUpdating(false);
  }
};
```

## 📦 Proceso de Release

### 1. Actualizar Versión

```bash
# Actualizar version en package.json y src-tauri/tauri.conf.json
npm run release:patch  # o minor, major, alpha, etc.
```

### 2. Crear Release

```bash
# Crear tag y push
git tag v0.0.8-alpha.2
git push origin v0.0.8-alpha.2

# GitHub Actions automáticamente:
# - Compila para todas las plataformas
# - Genera archivos de actualización
# - Firma los archivos
# - Actualiza latest.json
# - Crea release
```

### 3. Variables de Entorno para CI/CD

```yaml
# .github/workflows/release.yml
env:
  TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

## 🔒 Seguridad

- **Firmas criptográficas**: Todos los archivos de actualización están firmados
- **Verificación automática**: Tauri verifica las firmas antes de instalar
- **HTTPS**: Todas las descargas se realizan por HTTPS
- **Claves privadas**: Nunca se exponen en el código fuente

## 🌍 Experiencia de Usuario

### Flujo de Actualización

1. **Detección automática**: Al iniciar la aplicación
2. **Notificación**: Diálogo elegante con información de la actualización
3. **Descarga**: Barra de progreso en tiempo real
4. **Instalación**: Progreso visual del proceso
5. **Reinicio**: Automático para aplicar la actualización

### Interfaz de Usuario

- **Diálogo de actualización**: Muestra versión actual vs nueva
- **Notas de la versión**: Changelog integrado
- **Progreso visual**: Barra de progreso y porcentaje
- **Botones intuitivos**: "Instalar Actualización" vs "Cancelar"

## 🛠 Troubleshooting

### Problemas Comunes

#### 1. Error de Firma Inválida
```
Error: Invalid signature
```
**Solución**: Verificar que la clave pública en `tauri.conf.json` coincida con la usada para firmar.

#### 2. Archivo de Actualización No Encontrado
```
Error: Update file not found
```
**Solución**: Verificar que las URLs en `latest.json` sean correctas y los archivos existan.

#### 3. Permisos Insuficientes
```
Error: Permission denied
```
**Solución**: Ejecutar el launcher con permisos de administrador en Windows, o verificar permisos en macOS/Linux.

### Logs de Debug

```bash
# Habilitar logs detallados
export RUST_LOG=tauri=debug,tauri_plugin_updater=debug
```

## 📊 Métricas

El sistema automáticamente registra:
- Tiempo de descarga
- Tamaño de archivos
- Éxito/fallo de instalaciones
- Plataformas más utilizadas

## 🔄 Actualizaciones Futuras

### Próximas Mejoras

- [ ] **Actualizaciones incrementales**: Solo descargar cambios
- [ ] **Programación de actualizaciones**: Permitir aplazar actualizaciones
- [ ] **Rollback automático**: Revertir si falla la actualización
- [ ] **Notificaciones push**: Notificar sobre actualizaciones críticas

### Compatibilidad

- ✅ **Tauri 2.x**: Totalmente compatible
- ✅ **Multiplataforma**: Windows, macOS, Linux
- ✅ **Arquitecturas**: x64, ARM64 (Apple Silicon)
- ✅ **Distribución**: AppImage, DMG, NSIS, MSI

---

Para más información, consulta la [documentación oficial de Tauri Updater](https://tauri.app/plugin/updater/).

## 🔧 Desarrollo local

El firmado manual ya no es necesario. Todas las firmas y la generación del manifest `latest.json` se realizan automáticamente en GitHub Actions.

Para probar las actualizaciones en entorno de desarrollo puedes compilar e instalar localmente con:

```bash
npm run tauri:build
``` 