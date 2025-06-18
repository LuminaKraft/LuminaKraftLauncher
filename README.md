# LuminaKraft Launcher

Un lanzador de modpacks personalizado para Minecraft, desarrollado específicamente para la comunidad de LuminaKraft Studios. Construido con Tauri, React, TypeScript y Rust usando la biblioteca **Lyceris** para ofrecer una experiencia moderna, segura y eficiente.

## 🚀 Características Principales

### 🎮 Gestión de Modpacks
- **Instalación automática de modpacks**: Descarga e instala modpacks desde una fuente remota
- **Gestión de instancias**: Cada modpack se mantiene en su propia carpeta aislada
- **Validación automática**: Verificación de compatibilidad antes de la instalación
- **Múltiples modloaders**: Soporte completo para Forge, Fabric, Quilt y NeoForge

### 🔄 Sistema de Actualizaciones
- **⭐ Actualizaciones completamente automáticas**: Un clic para descargar, instalar y reiniciar
- **Verificación al inicio**: Comprueba automáticamente nuevas versiones al abrir el launcher
- **Instalación sin intervención**: No requiere pasos manuales del usuario
- **Respaldo inteligente**: Sistema de fallback con múltiples métodos de actualización

### 🔐 Autenticación de Microsoft
- **⭐ Autenticación modal**: Ventana emergente estilo Modrinth para Microsoft
- **🔄 Método alternativo**: Sistema de respaldo con pegado de URL
- **🔑 Gestión automática de tokens**: Renovación y validación automática de sesiones
- **🌐 Soporte multilingüe**: Interfaz completa en español e inglés
- **💾 Sesiones persistentes**: Mantiene la autenticación entre sesiones

### 🎯 Experiencia de Usuario
- **Compatible con usuarios premium y no premium**: Soporte completo para Microsoft y modo offline
- **Interfaz moderna**: Diseño intuitivo con tema oscuro y componentes responsivos
- **Configuración flexible**: Personaliza RAM, rutas de Java y autenticación
- **Multiplataforma**: Windows, macOS y Linux con soporte nativo

### ⚡ Rendimiento y Tecnología
- **⭐ Gestión automática de Java**: Lyceris descarga automáticamente la versión correcta de Java
- **⭐ Instalación optimizada**: Descargas paralelas 3-5x más rápidas
- **⭐ Verificación de integridad**: Archivos corruptos se redescargan automáticamente
- **⭐ Resolución automática de conflictos**: Limpieza inteligente de puertos y procesos

## 🛠️ Stack Tecnológico

- **Frontend**: React + TypeScript + Tailwind CSS
- **Framework**: Tauri 2.0 (Rust + Web)
- **Minecraft Launcher**: Lyceris v1.1.3 (Rust)
- **Actualizaciones**: Tauri Plugin Updater
- **Iconos**: Lucide React
- **Herramientas de build**: Vite
- **Gestión de estado**: Context API de React

## 📋 Requisitos Previos

### Para Development

- **Node.js** (v18 o superior)
- **Rust** (última versión estable)
- **Sistema operativo**: Windows 10+, macOS 10.15+, o Linux (Ubuntu 18.04+)

### Para el Usuario Final

- **Conexión a internet** (para descargar modpacks y Minecraft)
- **Java se instala automáticamente** - Lyceris maneja la instalación de Java automáticamente
- **Actualizaciones automáticas** - El launcher se mantiene actualizado sin intervención

## 🔧 Instalación para Desarrollo

1. **Clona el repositorio**:
   ```bash
   git clone https://github.com/luminakraft/luminakraft-launcher.git
   cd luminakraft-launcher
   ```

2. **Instala las dependencias de Node.js**:
   ```bash
   npm install
   ```

3. **Instala Rust** (si no lo tienes):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source $HOME/.cargo/env
   ```

4. **Configura las herramientas de Tauri**:
   ```bash
   npm install -g @tauri-apps/cli
   ```

## 🚀 Comandos de Desarrollo

### Modo Desarrollo

#### ⭐ Método Recomendado (Estable con Auto-limpieza)
```bash
# Usando npm (recomendado)
npm run tauri:dev-stable
```
**Nuevo**: Inicia el launcher en modo desarrollo estable con limpieza automática de puertos. Resuelve automáticamente conflictos de puerto 1420.

#### Método Estándar
```bash
npm run tauri dev
```
Inicia el servidor de desarrollo con hot reload (puede ser inestable en algunos sistemas).

> **⚠️ Problema Resuelto**: El problema de puertos ocupados después de cerrar el desarrollo ha sido solucionado con el script de auto-limpieza integrado.

### Build de Producción
```bash
npm run tauri build
```
Genera los ejecutables para distribución con firma automática y configuración de actualizaciones.

### Solo Frontend (para desarrollo de UI)
```bash
npm run dev
```
Ejecuta solo el frontend en modo desarrollo con detección automática de contexto Tauri.

### Build del Frontend
```bash
npm run build
```
Compila el frontend para producción con optimizaciones.

### Limpieza de Desarrollo
```bash
npm run clean
```
Limpia archivos temporales y cache de desarrollo.

## 📁 Estructura del Proyecto

```
luminakraft-launcher/
├── src/                          # Código fuente del frontend
│   ├── components/              # Componentes React
│   │   ├── Layout/             # Componentes de layout
│   │   ├── Modpacks/           # Componentes de modpacks
│   │   ├── Settings/           # Componentes de configuración
│   │   ├── About/              # Componentes de información
│   │   └── Updates/            # ⭐ Componentes de actualización
│   ├── contexts/               # Contextos de React
│   ├── services/               # Servicios y lógica de negocio
│   │   ├── launcherService.ts  # ⭐ Servicio principal con detección Tauri
│   │   └── updateService.ts    # ⭐ Servicio de actualizaciones automáticas
│   ├── types/                  # Definiciones de tipos TypeScript
│   └── App.tsx                 # Componente principal con verificación de actualizaciones
├── src-tauri/                   # Código fuente del backend (Rust)
│   ├── src/
│   │   ├── main.rs            # Punto de entrada con plugins de actualización
│   │   ├── launcher.rs        # Lógica de instalación de modpacks
│   │   ├── filesystem.rs      # Operaciones de sistema de archivos
│   │   ├── minecraft.rs       # ⭐ Integración completa con Lyceris
│   │   └── downloader.rs      # Descarga de archivos optimizada
│   ├── Cargo.toml             # ⭐ Dependencias actualizadas (Lyceris + Updater)
│   └── tauri.conf.json        # ⭐ Configuración con updater automático
├── public/                      # Archivos estáticos
├── kill-port.js                # ⭐ Script de limpieza automática de puertos
├── package.json                # ⭐ Scripts mejorados con auto-limpieza
├── CHANGELOG.md                # ⭐ Registro detallado de cambios
├── LYCERIS_INTEGRATION_SUMMARY.md  # ⭐ Documentación de integración
├── LAUNCHER_API_UPDATER_REQUIREMENTS.md  # ⭐ Especificaciones de API
└── README.md                   # Este archivo
```

## 🔐 Sistema de Autenticación Microsoft

### Características de Autenticación

- **🪟 Modal de Autenticación**: Ventana emergente que se abre automáticamente para autenticarse con Microsoft
- **🔄 Método Alternativo**: Si el modal falla, cambia automáticamente al método de pegar URL
- **🔑 Gestión de Tokens**: Renovación automática de tokens expirados sin intervención del usuario
- **💾 Persistencia**: La autenticación se mantiene entre sesiones del launcher
- **🌐 Multilingüe**: Interfaz completamente traducida en español e inglés

### Como Funciona

1. **Modo Modal (Recomendado)**:
   - Hacer clic en "Iniciar sesión con Microsoft"
   - Se abre una ventana emergente con el login de Microsoft
   - Completar la autenticación en la ventana
   - La ventana se cierra automáticamente al completar el login
   - ¡Listo! Ya puedes acceder a servidores premium

2. **Método Alternativo**:
   - Si el modal no funciona, se activa automáticamente el método alternativo
   - Se abre el navegador con la página de Microsoft
   - Copiar la URL completa de la página en blanco que aparece después del login
   - Pegar la URL en el campo del launcher
   - Hacer clic en "Verificar URL"

### Gestión de Sesiones

- **Renovación Automática**: Los tokens se renuevan automáticamente antes de expirar
- **Indicadores Visuales**: El launcher muestra claramente si estás autenticado o no
- **Cerrar Sesión**: Opción para cerrar sesión y volver al modo offline
- **Compatibilidad**: Funciona junto con el modo offline sin conflictos

## 🔄 Sistema de Actualizaciones

### Características del Sistema de Actualizaciones

- **🔍 Detección automática**: Verifica nuevas versiones al iniciar la aplicación
- **📊 Comparación inteligente**: Compara versiones usando GitHub releases
- **🌐 Descarga directa**: Abre el navegador para descargar desde GitHub
- **📱 Notificaciones elegantes**: Interfaz moderna para gestionar actualizaciones
- **🔒 Seguridad**: Descargas directas desde GitHub, sin intermediarios
- **📝 Notas de versión**: Muestra qué hay de nuevo en cada actualización

### Flujo de Actualización

1. **Verificación al inicio**: El launcher consulta GitHub releases al iniciar
2. **Comparación de versiones**: Compara la versión actual con la última disponible
3. **Notificación visual**: Muestra un diálogo cuando hay actualizaciones disponibles
4. **Descarga directa**: Abre GitHub releases en el navegador para descarga manual
5. **Instalación manual**: El usuario descarga e instala la nueva versión

### Tecnología

- **GitHub API**: Consulta directa a la API pública de GitHub releases
- **Versionado semántico**: Comparación inteligente de versiones (ej: 0.3.1 vs 0.4.0)
- **Sin backend**: No requiere infraestructura adicional, usa GitHub directamente
- **Multiplataforma**: Detecta automáticamente el archivo correcto para cada SO

## 🔧 Configuración

### Archivo de Datos del Launcher

El launcher obtiene la información de modpacks desde un archivo JSON remoto. El formato esperado es:

```json
{
  "launcherVersion": "0.3.1",
  "launcherDownloadUrls": {
    "windows": "https://url-al-ejecutable-windows.exe",
    "macos": "https://url-al-dmg-macos.dmg",
    "linux": "https://url-al-appimage-linux.AppImage"
  },
  "modpacks": [
    {
      "id": "volcania_s1",
      "nombre": "LuminaKraft: Volcania S1",
      "descripcion": "Un modpack de aventura y magia...",
      "version": "1.2.3",
      "minecraftVersion": "1.18.2",
      "modloader": "forge",
      "modloaderVersion": "40.2.0",
      "urlIcono": "https://ejemplo.com/icono.png",
      "urlModpackZip": "https://ejemplo.com/modpack.zip",
      "changelog": "v1.2.3: Cambios...",
      "jvmArgsRecomendados": "-XX:+UseG1GC -XX:+ParallelRefProcEnabled"
    }
  ]
}
```

### Configuración del Usuario

Las configuraciones se guardan localmente y incluyen:

- **Nombre de usuario**: Para el modo offline
- **RAM asignada**: Memoria para Minecraft
- **Ruta de Java**: Opcional, Lyceris maneja Java automáticamente
- **URL de datos**: Donde obtener la información de modpacks
- **⭐ Actualizaciones automáticas**: Habilitadas por defecto

## 🎮 Integración con Lyceris

### Características de Lyceris Integradas

- **Gestión automática de Java**: Descarga e instala automáticamente la versión correcta de Java
- **Soporte para múltiples mod loaders**: Forge (1.12.2+), Fabric, Quilt, NeoForge
- **Descargas paralelas**: Múltiples archivos se descargan simultáneamente (3-5x más rápido)
- **Verificación de integridad**: Archivos corruptos se redescargan automáticamente
- **Reportes de progreso**: Seguimiento en tiempo real de descargas e instalación
- **⭐ Optimización de memoria**: Configuración automática de JVM sin conflictos

### Mod Loaders Soportados

- **Forge**: Versiones 1.12.2 y superiores
- **Fabric**: Todas las versiones compatibles
- **Quilt**: Todas las versiones compatibles  
- **NeoForge**: Todas las versiones compatibles

### Comandos Tauri Disponibles

#### Comandos Principales
- `install_modpack(modpack)` - Instala solo el modpack (sin Minecraft)
- `install_modpack_with_minecraft(modpack, settings)` - Instalación completa con Minecraft
- `launch_modpack(modpack, settings)` - Lanza el modpack
- `delete_instance(modpack_id)` - Elimina una instancia

#### Comandos de Utilidad
- `get_supported_loaders()` - Lista de mod loaders soportados
- `validate_modpack_config(modpack)` - Valida configuración del modpack
- `check_instance_needs_update(modpack)` - Verifica si necesita actualización
- `check_java()` - Verifica disponibilidad de Java (siempre true con Lyceris)

#### ⭐ Comandos de Actualización
- `check_for_updates()` - Verifica actualizaciones disponibles
- `install_update()` - Instala actualización automáticamente

## 🏗️ Build para Distribución

### Windows
```bash
npm run tauri build -- --target x86_64-pc-windows-msvc
```

### macOS
```bash
npm run tauri build -- --target x86_64-apple-darwin
npm run tauri build -- --target aarch64-apple-darwin  # Para Apple Silicon
```

### Linux
```bash
npm run tauri build -- --target x86_64-unknown-linux-gnu
```

Los archivos compilados se generarán en `src-tauri/target/release/bundle/` con configuración automática de actualizaciones.

## 📂 Estructura de Directorios del Usuario

El launcher crea la siguiente estructura en el directorio de datos del usuario:

```
~/.local/share/LuminaKraftLauncher/  # Linux
~/Library/Application Support/LuminaKraftLauncher/  # macOS
%APPDATA%/LuminaKraftLauncher/  # Windows
├── instances/
│   ├── volcania_s1/
│   │   ├── mods/
│   │   ├── config/
│   │   ├── saves/
│   │   ├── libraries/          # Gestionado por Lyceris
│   │   ├── assets/             # Gestionado por Lyceris
│   │   ├── versions/           # Gestionado por Lyceris
│   │   └── instance.json
│   └── technika_s3/
│       └── ...
├── temp/
└── updates/                    # ⭐ Cache de actualizaciones
```

## 🐛 Resolución de Problemas

### ⭐ Problemas de Puerto (RESUELTO)
**Problema anterior**: Puerto 1420 permanecía ocupado después de cerrar el desarrollo.

**✅ Solución automática**: 
```bash
npm run tauri:dev-stable
```
Este comando incluye limpieza automática de puertos y resolución de conflictos.

### Ventana que se cierra y abre repetidamente (Desarrollo)
Si durante el desarrollo la ventana del launcher se cierra y abre constantemente:

**Causa**: Tauri está detectando cambios en archivos y reconstruyendo automáticamente.

**Soluciones**:
1. **Método Recomendado**: Usa el script estable con auto-limpieza
   ```bash
   npm run tauri:dev-stable
   ```

2. **Limpiar archivos temporales**:
   ```bash
   npm run clean
   ```

### ⭐ Problemas de Contexto Tauri (RESUELTO)
**Problema anterior**: `TypeError: window.__TAURI_INTERNALS__ is undefined` en navegador.

**✅ Solución automática**: El launcher ahora detecta automáticamente si está ejecutándose en contexto Tauri o navegador y se adapta accordingly.

### Problemas con Java
✅ **Solucionado con Lyceris**: Lyceris maneja automáticamente:
- Detección de Java instalado
- Descarga automática de la versión correcta
- Configuración automática de rutas
- ⭐ Resolución de conflictos de memoria JVM

### Errores de descarga
- Verifica tu conexión a internet
- Comprueba que la URL del archivo JSON sea correcta
- Lyceris reintentará automáticamente las descargas fallidas
- ⭐ Sistema de verificación de integridad integrado

### Problemas de Actualizaciones
- Las actualizaciones son completamente automáticas
- Si falla la actualización automática, se ofrece descarga manual
- Sistema de respaldo con múltiples métodos
- Verificación de firmas para seguridad

### macOS: "La aplicación está dañada y no se puede abrir"
Si al intentar abrir la aplicación en macOS ves el mensaje "La aplicación está dañada y no se puede abrir":

**Causa**: macOS marca las aplicaciones descargadas de Internet con un atributo de cuarentena (`com.apple.Quarantine`).

**Solución**:
1. Abre la Terminal
2. Ejecuta el siguiente comando (reemplaza la ruta con la ubicación de tu aplicación):
   ```bash
   xattr -c /Applications/LuminaKraftLauncher.app
   ```
3. Intenta abrir la aplicación nuevamente

### macOS: "Apple no pudo verificar que 'LuminaKraft Launcher' está libre de malware"
**Solución**:
1. Abre Configuración del Sistema
2. Ve a Privacidad y Seguridad
3. Desplázate hasta la parte inferior
4. Verás el mensaje "LuminaKraft Launcher" fue bloqueado para proteger tu Mac
5. Haz clic en "Abrir de todos modos"

### Problemas de permisos
En Linux/macOS, es posible que necesites dar permisos de ejecución:
```bash
chmod +x LuminaKraft-Launcher
```

## 🆕 Novedades en v0.3.1

### ⭐ Actualizaciones Completamente Automáticas
- **Un clic para actualizar**: Descarga, instala y reinicia automáticamente
- **Sin pasos manuales**: El usuario no necesita hacer nada
- **Verificación al inicio**: Comprueba actualizaciones automáticamente
- **Sistema de respaldo**: Múltiples métodos de actualización

### ⭐ Mejoras en Experiencia de Desarrollo
- **Auto-limpieza de puertos**: Resuelve conflictos de puerto 1420 automáticamente
- **Detección de contexto**: Funciona tanto en Tauri como en navegador
- **Scripts optimizados**: Comandos de desarrollo más estables

### ⭐ Optimizaciones Técnicas
- **Integración Lyceris mejorada**: 40% menos código, 3-5x más rápido
- **Resolución de conflictos JVM**: Sin más problemas de memoria
- **Validación automática**: Verificación de modpacks antes de instalación

### Compatibilidad

- ✅ Los modpacks existentes siguen siendo compatibles
- ✅ Las configuraciones de usuario se mantienen
- ✅ Las instancias existentes funcionan sin cambios
- ✅ El formato JSON del servidor no cambia
- ✅ **Nuevo**: Actualizaciones automáticas sin romper compatibilidad

## 🤝 Contribuir

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

### Guías de Desarrollo

- Usa `npm run tauri:dev-stable` para desarrollo estable
- Ejecuta `npm run clean` si encuentras problemas de cache
- Las actualizaciones automáticas requieren configuración de backend (ver `LAUNCHER_API_UPDATER_REQUIREMENTS.md`)
- Mantén la compatibilidad con versiones anteriores

## 📝 Licencia

Este proyecto está bajo la licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 👥 Equipo

Desarrollado con ❤️ por el equipo de **LuminaKraft Studios**.

**Versión actual**: v0.3.1 - Actualizaciones Automáticas

---

## 🔗 Enlaces

- [Sitio Web Oficial](https://luminakraft.com)
- [Discord](https://discord.gg/UJZRrcUFMj)
- [Lyceris Library](https://crates.io/crates/lyceris)
- [Documentación de Tauri](https://tauri.app)
- [React](https://reactjs.org)
- [TypeScript](https://typescriptlang.org)

## 📋 Documentación Adicional

- [`CHANGELOG.md`](CHANGELOG.md) - Registro detallado de todos los cambios
- [`CROSS_COMPILATION_GUIDE.md`](CROSS_COMPILATION_GUIDE.md) - Guía para compilación cruzada (macOS → Windows/Linux)
- [`docs/`](docs/) - Documentación técnica detallada
  - [Integración con Lyceris](docs/LYCERIS_INTEGRATION_SUMMARY.md)

## Requisitos

- Rust y Cargo
- Node.js y npm
- Docker (para compilación cruzada)
- macOS (para compilación nativa de macOS)

## Configuración del Entorno

1. Instalar dependencias de Rust:
   ```bash
   rustup target add x86_64-pc-windows-gnu  # Para compilación de Windows
   ```

2. Instalar dependencias de Node.js:
   ```bash
   npm install
   ```

## Compilación

### Método Sencillo (Recomendado)

Usa el script automatizado para compilar para todas las plataformas o una específica:

```bash
./build-all.sh
```

Este script te presentará un menú para elegir las plataformas de compilación.

### Compilación Manual

#### Para macOS (Nativo)

```bash
cargo build --release
```

El ejecutable estará disponible en `target/release/luminakraft-launcher`.

#### Para Windows (Usando Docker)

```bash
# Construir la imagen Docker para Windows
docker build -t luminakraft-windows-builder -f Dockerfile.windows-builder .

# Compilar para Windows
./build-windows.sh
```

El ejecutable estará disponible en `dist/luminakraft-launcher.exe`.

#### Para Linux (Usando Docker)

```bash
# Construir la imagen Docker para Linux
docker build -t luminakraft-linux-builder -f Dockerfile.linux-builder .

# Compilar para Linux
./build-linux.sh
```

El ejecutable estará disponible en `dist/luminakraft-launcher-linux`.

## Solución de Problemas

Si encuentras problemas durante la compilación cruzada, consulta:

- [Guía de Compilación Cruzada](./CROSS_COMPILATION_GUIDE.md) - Instrucciones detalladas y solución de problemas
- [Solución de Problemas de Compilación](./CROSS_COMPILATION_SOLUTION.md) - Soluciones específicas para problemas conocidos

## Estructura del Proyecto

- `src/` - Código fuente de la interfaz de usuario (frontend)
- `src-tauri/` - Código fuente del backend en Rust
- `Dockerfile.windows-builder` - Configuración de Docker para compilación de Windows
- `Dockerfile.linux-builder` - Configuración de Docker para compilación de Linux
- `build-windows.sh` - Script para compilación de Windows
- `build-linux.sh` - Script para compilación de Linux
- `build-all.sh` - Script para compilación de todas las plataformas

## Licencia

Este proyecto está licenciado bajo [LICENCIA].
