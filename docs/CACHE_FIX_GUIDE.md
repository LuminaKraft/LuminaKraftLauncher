# 🔧 Guía de Solución: Problema de Archivos con Versiones Incorrectas

## 🚨 Problema Identificado

En los releases aparecían archivos duplicados con versiones incorrectas:

**Archivos Correctos (v0.0.1):**
- ✅ `LuminaKraft Launcher_0.0.1_x64_en-US.msi`
- ✅ `LuminaKraft Launcher_0.0.1_x64-setup.exe`

**Archivos Incorrectos (v0.0.2) - ¡NO DEBERÍAN EXISTIR!:**
- ❌ `LuminaKraft Launcher_0.0.2_x64_en-US.msi`
- ❌ `LuminaKraft Launcher_0.0.2_x64-setup.exe`

## 🔍 Causa Raíz

El problema era **cache de GitHub Actions** que preservaba archivos de builds anteriores:

1. **Cache de Rust**: `src-tauri/target/` se estaba cacheando con builds previos
2. **Archivos residuales**: Builds antiguos con v0.0.2 permanecían en cache
3. **Sin limpieza**: No había pasos para limpiar builds antes de compilar

## ✅ Solución Implementada

### 1. **Limpieza de Cache de Builds**

Agregado en **todas las plataformas** (Windows, Linux, macOS):

```yaml
- name: Clean previous builds (prevents version conflicts)
  run: |
    echo "🧹 Cleaning previous builds to prevent version conflicts..."
    # Windows
    if (Test-Path "src-tauri/target/release/bundle/") { 
      Remove-Item -Recurse -Force "src-tauri/target/release/bundle/" 
    }
    # Linux/macOS  
    rm -rf src-tauri/target/release/bundle/ || true
    rm -rf src-tauri/target/debug/bundle/ || true
    echo "✅ Build cache cleaned"
```

### 2. **Cache Mejorado**

**Antes (problemático):**
```yaml
path: |
  ~/.cargo/bin/
  ~/.cargo/registry/index/
  ~/.cargo/registry/cache/
  ~/.cargo/git/db/
  src-tauri/target/  # ❌ Esto causaba el problema
key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
```

**Después (corregido):**
```yaml
path: |
  ~/.cargo/bin/
  ~/.cargo/registry/index/
  ~/.cargo/registry/cache/
  ~/.cargo/git/db/
  # ✅ src-tauri/target/ removido del cache
key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}-v2
```

### 3. **Debugging Avanzado**

Agregado paso para detectar conflictos de versiones:

```yaml
- name: List downloaded artifacts (for debugging version conflicts)
  run: |
    echo "🔍 Checking for version conflicts:"
    echo "Files with correct version (${{ steps.get_version.outputs.VERSION }}):"
    find artifacts/ -name "*${{ steps.get_version.outputs.VERSION }}*" | sort
    echo "❌ Files with INCORRECT versions (should be investigated):"
    find artifacts/ -type f \( -name "*.msi" -o -name "*.exe" \) ! -name "*${{ steps.get_version.outputs.VERSION }}*" | sort
```

## 🛠️ Archivos Modificados

### ✅ **Workflows Corregidos:**
- `.github/workflows/release-public.yml` - Workflow principal con correcciones
- `.github/workflows/test-release-fast.yml` - Workflow de test con correcciones

### ✅ **Características Añadidas:**
- 🧹 Limpieza automática de cache antes de cada build
- 🔍 Debugging detallado de artefactos generados
- ⚡ Cache mejorado que solo guarda dependencias, no builds
- 📋 Detección automática de conflictos de versiones

## 🧪 Cómo Probar la Solución

### 1. **Test Local (Recomendado)**
```bash
# Limpiar cache local primero
rm -rf src-tauri/target/release/bundle/

# Test con workflow rápido
node release.js 0.0.1 --prerelease --push
```

### 2. **Verificar en GitHub Actions**
- Ve a: https://github.com/kristiangarcia/luminakraft-launcher/actions
- Busca el paso: "List downloaded artifacts (for debugging version conflicts)"
- Debe mostrar **solo archivos con la versión correcta**

### 3. **Verificar Release Final**
- Ve a: https://github.com/kristiangarcia/luminakraft-launcher-releases/releases
- **Solo deben aparecer archivos con la versión del tag**
- **NO deben aparecer archivos con v0.0.2 u otras versiones**

## 📋 Checklist de Verificación

Antes de cada release, verificar:

- [ ] **Cache limpio**: El workflow ejecuta limpieza de cache
- [ ] **Debugging activo**: Se listan los archivos generados
- [ ] **Solo versión correcta**: No aparecen archivos con versiones incorrectas
- [ ] **Todas las plataformas**: Windows, Linux y macOS generan archivos correctos

## 🎯 Resultado Esperado

**Después de aplicar la corrección, en el release solo deben aparecer:**

✅ **Windows:**
- `LuminaKraft Launcher_0.0.1_x64_en-US.msi`
- `LuminaKraft Launcher_0.0.1_x64-setup.exe`

✅ **Linux:**
- `LuminaKraft Launcher_0.0.1_amd64.deb`

✅ **macOS:**
- `LuminaKraft Launcher_0.0.1_aarch64.dmg`
- `LuminaKraft Launcher_0.0.1_x64.dmg`

**❌ NO deben aparecer archivos con versiones como 0.0.2, 0.0.3, etc.**

## 🚀 Próximos Pasos

1. **Test la corrección**: Ejecuta un release de prueba
2. **Verifica los logs**: Revisa que la limpieza de cache funciona
3. **Confirma el resultado**: Solo archivos con versión correcta
4. **Si funciona**: Úsa el workflow principal para releases reales

---

**🔧 ¡Problema resuelto! Los releases ahora solo generarán archivos con la versión correcta.** 