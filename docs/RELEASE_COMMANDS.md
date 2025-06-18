# 🚀 LuminaKraft Launcher - Release Commands Guide

Esta guía explica todas las formas disponibles para crear releases del LuminaKraft Launcher.

## 📋 Comandos Disponibles

### 1. 🔢 Comandos Automáticos (Incremento de Versión)

Estos comandos incrementan automáticamente la versión actual:

```bash
# Versiones estables (auto-push)
npm run release:patch      # 0.1.0 → 0.1.1
npm run release:minor      # 0.1.0 → 0.2.0  
npm run release:major      # 0.1.0 → 1.0.0

# Versiones prerelease (auto-push)
npm run release:patch-pre  # 0.1.0 → 0.1.1 (prerelease)
npm run release:minor-pre  # 0.1.0 → 0.2.0 (prerelease)
npm run release:major-pre  # 0.1.0 → 1.0.0 (prerelease)
```

### 2. 🎯 Comandos de Versión Específica

Estos comandos permiten especificar la versión exacta:

```bash
# Prerelease con versión específica (auto-push)
npm run release:pre 0.5.0           # Release 0.5.0 como prerelease
npm run release:pre 1.0.0-beta.1    # Release beta
npm run release:pre 2.0.0-rc.1      # Release candidate

# Versión específica (auto-push)
npm run release:version 0.5.0       # Release 0.5.0 estable
npm run release:version 1.0.0       # Release 1.0.0 estable
npm run release:version 2.0.0-alpha.1 --pre  # Alpha como prerelease
```

### 3. 🛠️ Comandos Directos (Node.js)

Para control total, usa el script directamente:

```bash
# Versiones específicas
node release.js 0.5.0                    # Release estable (con confirmación)
node release.js 0.5.0 --prerelease       # Release prerelease (con confirmación)
node release.js 0.5.0 --push             # Release estable (auto-push)
node release.js 0.5.0 --prerelease --push # Release prerelease (auto-push)

# Incremento automático
node release.js patch                     # Próxima versión patch
node release.js minor                     # Próxima versión minor
node release.js major                     # Próxima versión major
node release.js patch --prerelease --push # Próxima patch como prerelease
```

### 4. 🔧 Comandos con NPM (Usando --)

Para pasar flags a través de npm:

```bash
npm run release -- 0.5.0 --prerelease    # Versión específica prerelease
npm run release -- patch --push          # Auto-increment con push
npm run release -- 1.0.0-beta.1 --prerelease --push
```

## 🎨 Tipos de Release

### 🎉 **Stable Release**
- Versión completa y estable
- Se marca como "Latest" en GitHub
- Los usuarios reciben notificaciones de actualización
- Formato: `1.0.0`, `2.5.3`

### 🧪 **Prerelease**
- Versión de prueba o desarrollo
- Se marca como "Pre-release" en GitHub
- Ideal para testing y feedback
- Formato: `1.0.0-beta.1`, `2.0.0-rc.1`, `0.5.0-alpha.2`

## 🔄 Proceso Automático

Todos los comandos ejecutan automáticamente:

1. **📝 Actualización de versión** en todos los archivos
2. **📋 Actualización de CHANGELOG.md**
3. **🔨 Build de prueba** para verificar que compila
4. **📦 Commit y tag Git**
5. **🚀 Push a GitHub** (si se especifica `--push` o se usa comando npm)
6. **⚡ Trigger de workflows GitHub Actions**
7. **🎁 Creación automática de release en GitHub**

## 🌟 Recomendaciones

### Para desarrollo diario:
```bash
npm run release:patch-pre    # Pequeños cambios
npm run release:minor-pre    # Nuevas funcionalidades
```

### Para releases oficiales:
```bash
npm run release:patch        # Bugfixes
npm run release:minor        # Nuevas funcionalidades
npm run release:major        # Cambios importantes
```

### Para releases personalizadas:
```bash
npm run release:pre 1.5.0-beta.2      # Beta específica
npm run release:version 2.0.0         # Versión major específica
```

## 🏗️ Arquitectura Híbrida

El sistema utiliza una **arquitectura híbrida**:

- **📁 Repositorio Privado**: Código fuente y desarrollo
- **🌍 Repositorio Público**: Builds y releases automáticos
- **💰 GitHub Actions Gratuitas**: Compilación en 4 plataformas
- **🔄 Sincronización Automática**: El push trigger la sincronización

## 📊 Estados del Release

- **🟢 Stable**: Listo para producción
- **🟡 Prerelease**: En pruebas
- **🔄 Building**: Compilando en GitHub Actions
- **✅ Released**: Disponible para descarga

---

**💡 Tip**: Usa `npm run release` sin argumentos para ver la ayuda completa. 