# 🚀 Sistema de Releases LuminaKraft Launcher

## 📋 Arquitectura de Repositorios

### 📁 Repositorio Privado (Código Fuente)
- **Repositorio**: `kristiangarcia/luminakraft-launcher`
- **Contenido**: Código fuente completo, desarrollo, workflow de build
- **Acceso**: Privado (solo desarrolladores)
- **Propósito**: Proteger el código fuente y ejecutar builds

### 📦 Repositorio Público (Solo Releases)
- **Repositorio**: `kristiangarcia/luminakraft-launcher-releases`
- **Contenido**: Solo releases, binarios y documentación para usuarios
- **Acceso**: Público (todos los usuarios)
- **Propósito**: Distribución pública del launcher

## 🎮 Comandos de Release

### 📋 Releases Estables
```bash
# Incrementos automáticos
npm run release patch     # 0.3.1 -> 0.3.2
npm run release minor     # 0.3.1 -> 0.4.0  
npm run release major     # 0.3.1 -> 1.0.0

# Versión específica
npm run release 1.2.3     # Release estable v1.2.3
```

### 🧪 Pre-Releases (Nuevas!)
```bash
# Pre-releases con incrementos
npm run release patch --prerelease     # Pre-release patch
npm run release minor --prerelease     # Pre-release minor

# Pre-release con versión específica
npm run release 0.5.0 --prerelease     # Pre-release v0.5.0
npm run release 1.0.0-alpha.1 --prerelease  # Pre-release v1.0.0-alpha.1
```

### ⚡ Flags Disponibles
- `--prerelease`: Marca el release como pre-release
- `--push`: Auto-push sin confirmación (para CI)

## 🏗️ Workflow Multi-Plataforma

### 📦 Builds Automáticos
- **🪟 Windows**: MSI + NSIS installers
- **🐧 Linux**: AppImage + DEB + RPM packages
- **🍎 macOS**: DMG para ARM64 (Apple Silicon) + x86_64 (Intel)

### 🔄 Proceso Automático
1. **Tag Detection**: Workflow se activa con tags `v*`
2. **Multi-Platform Build**: Builds paralelos en 3 runners
3. **Dual Release**: Publica en repositorio público y privado
4. **Spanish Content**: Releases en español, formato corto

## 📝 Contenido de Releases

### 🌐 Release Público (Español)
- Instrucciones de descarga por plataforma
- Características principales del launcher
- Enlaces de soporte (Discord, Issues)
- Advertencias para pre-releases

### 🔒 Release Privado (Tracking)
- Información técnica de build
- Enlaces al release público
- Datos para desarrollo interno

## ✅ Estado Actual del Sistema

- ✅ **Workflow Configurado**: Multi-plataforma completo
- ✅ **Dual Repository**: Público + privado funcionando
- ✅ **Pre-release Manual**: Control con flag `--prerelease`
- ✅ **Versiones Dinámicas**: Sidebar se actualiza automáticamente
- ✅ **Contenido en Español**: Releases cortos y claros
- ✅ **TOKEN Configurado**: `PUBLIC_REPO_TOKEN` funcionando

## 🔧 Configuración Técnica

### 🔑 GitHub Secrets (Ya configurados)
- `PUBLIC_REPO_TOKEN`: Token para escribir en repo público
- `TAURI_PRIVATE_KEY`: Firma de aplicaciones (opcional)
- `TAURI_KEY_PASSWORD`: Password para firma (opcional)

### 📋 Package.json Extensions
- `version`: Versión actual (auto-actualizada)
- `isPrerelease`: Flag para pre-releases (nuevo)

### 🔄 Auto-Update de Versiones
- `package.json`: Versión principal
- `src-tauri/Cargo.toml`: Versión de Rust
- `src-tauri/tauri.conf.json`: Configuración Tauri
- `src/components/About/AboutPage.tsx`: Versión en About
- `src/components/Layout/Sidebar.tsx`: Versión en Sidebar (nuevo)

## 🎯 Ejemplos Prácticos

### 🚀 Release Estable
```bash
npm run release 1.0.0
# Resultado:
# - ✅ Release estable v1.0.0
# - 📦 Todos los binarios generados
# - 🌐 Release público en español
# - 🔒 Tracking interno
```

### 🧪 Pre-Release
```bash
npm run release 1.1.0-beta.1 --prerelease
# Resultado:
# - 🧪 Pre-release v1.1.0-beta.1
# - ⚠️ Marcado como pre-release en GitHub
# - 📝 Advertencias en descripción
# - 🔍 Visible en releases pero marcado como experimental
```

### 📈 Incremento Automático
```bash
# Si la versión actual es 0.5.2
npm run release minor --prerelease
# Resultado: Pre-release v0.6.0
```

## 🔗 Enlaces Importantes

- **🔨 GitHub Actions**: https://github.com/kristiangarcia/luminakraft-launcher/actions
- **📦 Releases Públicos**: https://github.com/kristiangarcia/luminakraft-launcher-releases/releases
- **🔒 Releases Privados**: https://github.com/kristiangarcia/luminakraft-launcher/releases

## 📋 Comandos de Mantenimiento

### 🗑️ Limpiar Tags
```bash
# Borrar todos los tags locales
git tag | xargs git tag -d

# Borrar tags remotos (cuidado!)
git push origin --delete $(git tag -l)
```

### 🔍 Verificar Estado
```bash
# Ver tags actuales
git tag -l

# Ver último commit
git log --oneline -1

# Ver configuración de remotes
git remote -v
```

---

**🎉 Sistema completamente operativo y listo para uso en producción!** 