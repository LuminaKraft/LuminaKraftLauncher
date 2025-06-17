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

### Error: "http status: 503" al compilar para Windows

Este error puede ocurrir cuando NSIS no puede descargar sus dependencias. La solución es:

1. Asegúrate de que Docker tiene acceso a Internet
2. El script ahora monta el directorio `.tauri` como volumen para cachear las dependencias
3. Ejecuta el script auxiliar para descargar manualmente las dependencias:
   ```bash
   npm run download-nsis
   ```
   Este script descargará las dependencias de NSIS directamente en el directorio cache

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