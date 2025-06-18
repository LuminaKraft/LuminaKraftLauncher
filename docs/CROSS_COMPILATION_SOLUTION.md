# Solución a Problemas de Compilación Cruzada para Windows en macOS

Este documento detalla las soluciones implementadas para resolver los problemas de enlace con la biblioteca liblzma durante la compilación cruzada del LuminaKraft Launcher desde macOS para Windows usando Docker.

## Problema

Al intentar compilar la aplicación Tauri para Windows desde macOS, se encontraron errores de enlace relacionados con la biblioteca liblzma:

```
undefined reference to `lzma_end'
undefined reference to `lzma_stream_decoder'
undefined reference to `lzma_code'
```

## Soluciones Implementadas

### 1. Modificaciones en Dockerfile.windows-builder

Se actualizó el Dockerfile para mejorar la instalación y configuración de liblzma:

```dockerfile
# Instalación de liblzma para Windows
RUN wget https://tukaani.org/xz/xz-5.4.6-windows.zip && \
    unzip xz-5.4.6-windows.zip && \
    cp xz-5.4.6-windows/bin_x86-64/liblzma.dll /usr/x86_64-w64-mingw32/bin/ && \
    cp xz-5.4.6-windows/bin_x86-64/liblzma.dll /usr/x86_64-w64-mingw32/lib/ && \
    rm -rf xz-5.4.6-windows xz-5.4.6-windows.zip

# Uso del archivo .def proporcionado por la documentación
RUN echo "EXPORTS" > /usr/x86_64-w64-mingw32/lib/liblzma.def && \
    echo "    lzma_code" >> /usr/x86_64-w64-mingw32/lib/liblzma.def && \
    echo "    lzma_end" >> /usr/x86_64-w64-mingw32/lib/liblzma.def && \
    echo "    lzma_stream_decoder" >> /usr/x86_64-w64-mingw32/lib/liblzma.def

# Creación de la biblioteca de importación
RUN cd /usr/x86_64-w64-mingw32/lib && \
    x86_64-w64-mingw32-dlltool -d liblzma.def -l liblzma.a

# Creación de symlink en el directorio de GCC
RUN GCC_DIR=$(dirname $(x86_64-w64-mingw32-gcc -print-libgcc-file-name)) && \
    ln -sf /usr/x86_64-w64-mingw32/lib/liblzma.a $GCC_DIR/liblzma.a
```

### 2. Modificaciones en src-tauri/build.rs

Se actualizó el archivo build.rs para proporcionar instrucciones de enlace explícitas para Windows:

```rust
fn main() {
    tauri_build::build();
    
    // Detectar compilación para Windows
    if std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() == "windows" {
        // Agregar biblioteca liblzma explícitamente
        println!("cargo:rustc-link-lib=lzma");
        
        // Configurar opciones de enlace
        println!("cargo:rustc-link-arg=-Wl,--allow-multiple-definition");
    }
}
```

### 3. Actualizaciones en build-windows.sh

Se modificó el script para incluir variables de entorno adicionales y salida verbosa:

```bash
#!/bin/bash
set -e

# Variables de entorno para el enlazador
export RUSTFLAGS="-C link-arg=-Wl,--allow-multiple-definition"

# Compilar con salida verbosa para depuración
docker run --rm -v "${PWD}:/app" luminakraft-windows-builder cargo build --target x86_64-pc-windows-gnu --release -vv

# Copiar el ejecutable al directorio dist
mkdir -p dist
cp target/x86_64-pc-windows-gnu/release/luminakraft-launcher.exe dist/
```

## Verificación

Después de implementar estos cambios:

1. Se reconstruyó la imagen Docker:
   ```bash
   docker build -t luminakraft-windows-builder -f Dockerfile.windows-builder .
   ```

2. Se ejecutó el script de compilación:
   ```bash
   ./build-windows.sh
   ```

3. Se verificó la generación correcta del ejecutable:
   ```bash
   file dist/luminakraft-launcher.exe
   ```

## Notas Adicionales

- La solución aborda específicamente el problema de enlace con liblzma en el entorno de compilación cruzada.
- El uso del archivo .def manual en lugar de extraer símbolos del DLL resultó más confiable.
- La detección dinámica del directorio de GCC asegura que la biblioteca se encuentre en la ruta de búsqueda correcta.
- La bandera `--allow-multiple-definition` resuelve conflictos potenciales durante el enlace. 