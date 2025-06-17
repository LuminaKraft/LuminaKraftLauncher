# Guía de Configuración para Cross-Compilation

Esta guía explica cómo configurar tu entorno de desarrollo macOS para compilar el LuminaKraft Launcher para Windows y Linux.

## Instalación Automática de Dependencias

El script `release.js` ahora detecta automáticamente si tienes Homebrew instalado y puede instalar todas las dependencias necesarias para la compilación cruzada automáticamente.

Simplemente ejecuta:
```bash
npm run release -- <version> [--prerelease]
```

El script:
1. Detectará si Homebrew está instalado
2. Instalará automáticamente las herramientas necesarias para Windows y Linux
3. Configurará las variables de entorno adecuadas
4. Compilará para todas las plataformas disponibles

## Requisitos Previos (para instalación manual)

- macOS (Intel o Apple Silicon)
- Homebrew instalado
- Rust y Cargo instalados
- Node.js y npm instalados

## Compilación para Windows desde macOS

### 1. Instalar la target de Rust para Windows

```bash
rustup target add x86_64-pc-windows-msvc
```

### 2. Instalar MinGW-w64 (compilador cruzado para Windows)

```bash
brew install mingw-w64
```

### 3. Configurar variables de entorno (opcional)

Si encuentras problemas específicos, puedes necesitar configurar estas variables de entorno:

```bash
export CC_x86_64_pc_windows_msvc=x86_64-w64-mingw32-gcc
export CXX_x86_64_pc_windows_msvc=x86_64-w64-mingw32-g++
export AR_x86_64_pc_windows_msvc=x86_64-w64-mingw32-ar
export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=x86_64-w64-mingw32-gcc
```

### 4. Problemas Comunes y Soluciones

#### Error: `assert.h` no encontrado

Este error ocurre con la biblioteca `ring`. Puedes intentar:

1. Instalar las cabeceras de Windows con:
   ```bash
   brew install mingw-w64-headers
   ```

2. O usar una versión específica de `ring` que sea compatible con cross-compilation:
   ```
   # En Cargo.toml
   ring = { version = "=0.16.20", features = ["std"] }
   ```

## Compilación para Linux desde macOS

### 1. Instalar la target de Rust para Linux

```bash
rustup target add x86_64-unknown-linux-gnu
```

### 2. Instalar el toolchain de GNU para Linux

```bash
brew tap SergioBenitez/osxct
brew install x86_64-unknown-linux-gnu
```

### 3. Configurar variables de entorno

Estas variables son necesarias para la compilación cruzada a Linux:

```bash
export CC_x86_64_unknown_linux_gnu=x86_64-linux-gnu-gcc
export CXX_x86_64_unknown_linux_gnu=x86_64-linux-gnu-g++
export AR_x86_64_unknown_linux_gnu=x86_64-linux-gnu-ar
export CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=x86_64-linux-gnu-gcc
```

### 4. Problemas Comunes y Soluciones

#### Error: Bibliotecas GTK no encontradas

Para aplicaciones que usan GTK (como Tauri), necesitarás instalar las bibliotecas GTK para Linux:

```bash
brew install pkg-config
brew install x86_64-unknown-linux-gnu-gtk3
```

## Uso del Script de Release

El script `release.js` ahora detecta automáticamente si tienes las herramientas necesarias para la compilación cruzada:

1. Si tienes todas las herramientas instaladas, compilará para todas las plataformas.
2. Si falta alguna herramienta, te mostrará instrucciones sobre cómo instalarla.
3. Continuará con las plataformas disponibles aunque algunas no estén configuradas.

Para ejecutar el script:

```bash
npm run release -- <version> [--prerelease]
```

## Recursos Adicionales

- [Documentación de Rust sobre Cross-Compilation](https://rust-lang.github.io/rustup/cross-compilation.html)
- [Documentación de Tauri sobre Cross-Compilation](https://tauri.app/v1/guides/building/cross-platform)
- [Herramienta osxcross](https://github.com/tpoechtrager/osxcross) para compilación cruzada avanzada 