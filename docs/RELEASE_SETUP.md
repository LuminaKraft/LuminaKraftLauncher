# 🚀 Configuración de Releases Públicos

## Arquitectura de Repositorios

### 📁 Repositorio Privado (Código Fuente)
- **Repositorio**: `kristiangarcia/luminakraft-launcher`
- **Contenido**: Código fuente completo, desarrollo
- **Acceso**: Privado (solo desarrolladores)
- **Propósito**: Proteger el código fuente

### 📦 Repositorio Público (Solo Releases)
- **Repositorio**: `kristiangarcia/luminakraft-launcher-releases`
- **Contenido**: Solo releases y archivos de descarga
- **Acceso**: Público (todos los usuarios)
- **Propósito**: Distribución pública del launcher

## 🔄 Flujo de Release

### 1. Desarrollo (Repositorio Privado)
```bash
# Desarrollar en repositorio privado
git commit -m "Nueva funcionalidad"
git push origin main

# Crear release
npm run release:patch # 0.3.1 -> 0.3.2
npm run release:minor # 0.3.1 -> 0.4.0
npm run release:major # 0.3.1 -> 1.0.0

# Crear release con version especifica
npm run release 0.3.2
```

### 2. Build y Publicación Automática
- GitHub Actions detecta el tag `v*`
- Compila la aplicación desde el código privado
- Publica el release en el repositorio público
- Los usuarios pueden descargar sin acceso al código

### 3. Actualización de Usuarios
- La aplicación verifica: `luminakraft-launcher-releases`
- Encuentra nuevas versiones públicamente
- Descarga desde el repositorio público
- **Sin necesidad de tokens o acceso privado**

## 🔧 Configuración Requerida

### 1. Crear Repositorio Público
```bash
# En GitHub, crear nuevo repositorio:
# Nombre: luminakraft-launcher-releases
# Visibilidad: Público
# Descripción: "Public releases for LuminaKraft Launcher"
```

### 2. Configurar GitHub Secrets
En el repositorio **privado**, agregar secret:
- `PUBLIC_REPO_TOKEN`: Token con permisos para escribir en el repo público

### 3. Crear Personal Access Token
1. GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token (classic)
3. Seleccionar scopes:
   - `public_repo` (para escribir en repositorios públicos)
4. Copiar token y agregarlo como `PUBLIC_REPO_TOKEN` en secrets

## ✅ Ventajas de esta Arquitectura

- **🔒 Código Protegido**: El código fuente permanece privado
- **📦 Releases Públicos**: Cualquiera puede descargar
- **🚀 Sin Tokens**: Los usuarios no necesitan configuración
- **🔄 Automático**: Todo el proceso es automático
- **📊 Tracking**: Releases internos y públicos separados

## 🎯 Estado Actual

- ✅ Sistema de actualizaciones implementado
- ✅ GitHub Actions configurado para dual-repo
- ✅ Servicio actualizado para usar repo público
- 🔄 **Pendiente**: Crear repositorio público
- 🔄 **Pendiente**: Configurar PUBLIC_REPO_TOKEN

## 📋 Próximos Pasos

1. **Crear** `kristiangarcia/luminakraft-launcher-releases` (público)
2. **Generar** Personal Access Token con scope `public_repo`
3. **Agregar** token como `PUBLIC_REPO_TOKEN` en secrets del repo privado
4. **Probar** con un nuevo release: `npm run release:patch`
5. **Verificar** que el release aparece en el repo público 