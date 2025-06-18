# Guía de Configuración para Cross-Compilation

Esta guía explica cómo configurar tu entorno de desarrollo macOS para compilar el LuminaKraft Launcher para Windows y Linux.

## Instalación Automática de Dependencias

El script `release.js` ahora utiliza Docker para la compilación cruzada, lo que simplifica enormemente el proceso.

Simplemente ejecuta:
```bash
npm run release -- <version> [--prerelease]
```

El script:
1. Detectará si Docker está instalado
2. Creará imágenes Docker específicas para cada plataforma
3. Compilará para todas las plataformas posibles usando contenedores

## Requisitos Previos

- macOS (Intel o Apple Silicon)
- Docker Desktop instalado
- Rust y Cargo instalados (para compilación local)
- Node.js y npm instalados

## Compilación para Windows desde macOS

### Método Docker (Recomendado)

1. **Instalar Docker Desktop**
   Descarga e instala Docker Desktop desde [docker.com](https://www.docker.com/products/docker-desktop/)

2. **Ejecutar la compilación**
   ```bash
   npm run release -- <version> [--prerelease]
   ```

   El script creará automáticamente una imagen Docker con todas las herramientas necesarias para compilar para Windows.

### Método Alternativo (No recomendado)

Si prefieres no usar Docker, puedes intentar la compilación directa, pero no es recomendado debido a problemas de compatibilidad:

```bash
rustup target add x86_64-pc-windows-gnu
brew install mingw-w64
```

## Compilación para Linux desde macOS

### Método Docker (Recomendado)

1. **Instalar Docker Desktop**
   Descarga e instala Docker Desktop desde [docker.com](https://www.docker.com/products/docker-desktop/)

2. **Ejecutar la compilación**
   ```bash
   npm run release -- <version> [--prerelease]
   ```

   El script creará automáticamente una imagen Docker con todas las herramientas necesarias para compilar para Linux.

### Método Alternativo (No recomendado)

La compilación directa para Linux desde macOS es muy compleja y propensa a errores debido a las dependencias de GTK y otras bibliotecas específicas de Linux.

## Cómo Funciona la Compilación con Docker

El proceso de compilación cruzada con Docker funciona de la siguiente manera:

1. **Verificación de Docker**: El script comprueba si Docker está instalado y en ejecución.

2. **Uso de Imágenes Docker**:
   - Para Windows: Usa `Dockerfile.windows-builder` con MinGW y Node.js 20
   - Para Linux: Usa `Dockerfile.linux-builder` con GTK y dependencias necesarias

3. **Montaje de Volúmenes**: 
   - Monta el directorio del proyecto en `/app` dentro del contenedor
   - Monta el directorio `.tauri` para cachear dependencias entre compilaciones

4. **Compilación**: Ejecuta los comandos de compilación dentro del contenedor.

5. **Copia de Artefactos**: Copia los archivos compilados a las ubicaciones esperadas en el host.

## Solución de Problemas Comunes

### Error: "Cannot connect to the Docker daemon"

Si ves este error, asegúrate de que Docker Desktop está en ejecución.

### Error: "Error response from daemon: invalid mount config"

Este error puede ocurrir si Docker no tiene permisos para acceder al directorio del proyecto. Asegúrate de que has concedido permisos a Docker en Preferencias > Recursos > Compartición de archivos.

### Error: "No space left on device"

Si Docker se queda sin espacio, puedes limpiar imágenes y contenedores no utilizados:

```bash
docker system prune -a
```

### Error: "rustc interrupted by SIGBUS" al compilar para Linux

Este error ocurre cuando hay problemas de memoria durante la compilación cruzada para Linux:

1. Hemos implementado límites de memoria en los contenedores Docker (-m 4g --memory-swap 6g)
2. Se ha configurado Rust para usar menos memoria durante la compilación con RUSTFLAGS
3. Se ha actualizado el archivo .cargo/config.toml con configuraciones optimizadas
4. Se usa una versión específica de Rust (1.76.0) para mayor estabilidad

Si sigues teniendo este error:
```bash
# Intenta limpiar la caché de Cargo
docker run --rm -v "$PWD:/app" -v "$HOME/.tauri:/root/.tauri" tauri-builder cargo clean
```

### Error: "http status: 503" al compilar para Windows

Este error ocurre cuando NSIS no puede descargar sus dependencias. La solución es:

1. Asegúrate de que Docker tiene acceso a Internet
2. El script ahora monta el directorio `.tauri` como volumen para cachear las dependencias
3. Ejecuta el script auxiliar para descargar manualmente las dependencias:
   ```bash
   npm run download-nsis
   ```
   Este script descargará las dependencias de NSIS directamente en el directorio cache

### Error: "nsis_tauri_utils.dll no encontrado" o "Error al cargar NSIS"

Este error puede ocurrir cuando las dependencias de NSIS no están correctamente instaladas:

1. Verifica que el archivo `nsis_tauri_utils.dll` existe en `~/.tauri/NSIS/`
2. Si no existe, ejecuta el script de descarga:
   ```bash
   npm run download-nsis
   ```
3. Asegúrate de que el directorio `.tauri` se monta correctamente en el contenedor Docker

### Error: "pkg-config has not been configured to support cross-compilation"

Este error ocurre cuando pkg-config no está configurado para compilación cruzada en Linux:

1. El Dockerfile.linux-builder ya incluye pkg-config y las variables de entorno necesarias
2. Se ha creado un archivo `.cargo/config.toml` con la configuración para cross-compilation
3. Las variables de entorno se configuran automáticamente en el script de compilación

### Error: "the package does not contain this feature: custom-protocol"

Este error ocurre cuando se intenta compilar con características (features) que no están definidas:

1. Asegúrate de que no estás usando `--features` en los comandos de compilación
2. Si necesitas características personalizadas, primero defínelas en el archivo Cargo.toml

### Error: "EBADENGINE" en npm

Este error ocurre porque algunas dependencias requieren Node.js 20+. El script ahora configura automáticamente Node.js 20 en los contenedores Docker.

### Error: "lock file version `4` was found, but this version of Cargo does not understand this lock file"

Este error ocurre cuando la versión de Rust en el contenedor Docker es más antigua que la utilizada para crear el archivo Cargo.lock:

1. Hemos actualizado el Dockerfile.linux-builder para usar la última versión estable de Rust
2. Si sigues viendo este error, puedes eliminar el archivo Cargo.lock antes de compilar:
   ```bash
   docker run --rm -v "${PWD}:/app" tauri-builder rm -f /app/src-tauri/Cargo.lock
   ```
3. O alternativamente, puedes especificar una versión exacta de Rust en el Dockerfile que coincida con tu versión local:
   ```dockerfile
   RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.87.0
   ```

### Error: "The system library `libsoup-3.0` required by crate `soup3-sys` was not found"

Este error ocurre cuando falta la biblioteca libsoup-3.0 necesaria para compilar aplicaciones GTK:

1. Hemos actualizado el Dockerfile.linux-builder para incluir el paquete libsoup-3.0-dev
2. Si estás compilando localmente, instala el paquete:
   ```bash
   sudo apt-get install libsoup-3.0-dev
   ```
3. Asegúrate de que PKG_CONFIG_PATH incluya la ruta a los archivos .pc:
   ```bash
   export PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig
   ```

### Error: "The system library `javascriptcoregtk-4.1` required by crate `javascriptcore-rs-sys` was not found"

Este error ocurre cuando falta la biblioteca javascriptcoregtk-4.1 necesaria para compilar aplicaciones WebKit:

1. Hemos actualizado el Dockerfile.linux-builder para incluir el paquete libjavascriptcoregtk-4.1-dev
2. Si estás compilando localmente, instala el paquete:
   ```bash
   sudo apt-get install libjavascriptcoregtk-4.1-dev
   ```
3. Este paquete es una dependencia de WebKit que se utiliza en aplicaciones Tauri

### Error: "The system library `webkit2gtk-4.1` required by crate `webkit2gtk-sys` was not found"

Este error ocurre cuando falta la biblioteca webkit2gtk-4.1 necesaria para aplicaciones Tauri:

1. Hemos actualizado el Dockerfile.linux-builder para incluir el paquete libwebkit2gtk-4.1-dev
2. Si estás compilando localmente, instala el paquete:
   ```bash
   sudo apt-get install libwebkit2gtk-4.1-dev
   ```
3. Este paquete es una dependencia principal para aplicaciones Tauri que utilizan WebView

### Error: "Failed to find OpenSSL development headers"

Este error ocurre cuando faltan los headers de desarrollo de OpenSSL:

1. Hemos actualizado el Dockerfile.linux-builder para incluir el paquete libssl-dev
2. Si estás compilando localmente, instala el paquete:
   ```bash
   sudo apt-get install libssl-dev
   ```
3. OpenSSL es necesario para las funcionalidades de red segura en la aplicación

### Error: "undefined reference to `lzma_end`, `lzma_stream_decoder`, `lzma_code`" al compilar para Windows

Este error ocurre cuando hay problemas de enlace con la biblioteca liblzma durante la compilación cruzada para Windows:

1. Hemos actualizado el Dockerfile.windows-builder para:
   - Descargar e instalar correctamente la biblioteca liblzma para Windows
   - Usar el archivo .def proporcionado por la documentación para generar la biblioteca de importación
   - Encontrar y crear un symlink al directorio de GCC correcto para liblzma.a

2. Hemos modificado el archivo build.rs para:
   - Detectar cuando se está compilando para Windows
   - Agregar explícitamente la biblioteca liblzma a los argumentos de enlace
   - Permitir definiciones múltiples con --allow-multiple-definition

3. Hemos actualizado el script build-windows.sh para:
   - Establecer las variables de entorno RUSTFLAGS con los argumentos de enlace necesarios
   - Usar el modo verboso en cargo para depurar problemas de enlace

Si sigues teniendo este error:
```bash
# Asegúrate de que liblzma.dll está correctamente instalado en el contenedor
docker run --rm -it luminakraft-windows-builder ls -la /usr/x86_64-w64-mingw32/lib/liblzma*

# Verifica que el archivo .def se está generando correctamente
docker run --rm -it luminakraft-windows-builder cat /usr/x86_64-w64-mingw32/lib/liblzma.def
```

### Error: "the linked panic runtime `panic_unwind` is not compiled with this crate's panic strategy `abort`"

Este error puede ocurrir cuando hay inconsistencias en la estrategia de pánico entre las dependencias:

1. Hemos configurado explícitamente la estrategia de pánico en el perfil de compilación:
   ```toml
   # Cargo.toml
   [profile.release]
   panic = "abort"
   ```

2. Asegúrate de que todas las dependencias se compilan con la misma estrategia de pánico
3. En casos extremos, puede ser necesario reconstruir el entorno de compilación:
   ```bash
   docker run --rm -v "${PWD}:/app" luminakraft-windows-builder cargo clean
   ```

## Compilación Automatizada para Todas las Plataformas

El script `release.js` ahora puede compilar automáticamente para todas las plataformas si tienes Docker instalado:

```bash
npm run release -- <version> [--prerelease]
```

Este comando:
1. Compilará para macOS (Intel y Apple Silicon) de forma nativa
2. Compilará para Windows usando Docker
3. Compilará para Linux usando Docker
4. Creará una release en GitHub con todos los artefactos

## Recursos Adicionales

- [Documentación de Rust sobre Cross-Compilation](https://rust-lang.github.io/rustup/cross-compilation.html)
- [Documentación de Tauri sobre Cross-Compilation](https://tauri.app/v1/guides/building/cross-platform)
- [Herramienta osxcross](https://github.com/tpoechtrager/osxcross) para compilación cruzada avanzada 