# LuminaKraft Launcher

Un lanzador de modpacks personalizado para Minecraft, desarrollado específicamente para la comunidad de LuminaKraft Studios. Construido con Tauri, React, TypeScript y Rust usando la biblioteca **Lyceris** para ofrecer una experiencia moderna, segura y eficiente.

## 🚀 Características

- **Instalación automática de modpacks**: Descarga e instala modpacks desde una fuente remota
- **Gestión de instancias**: Cada modpack se mantiene en su propia carpeta aislada
- **Compatible con usuarios premium y no premium**: Soporte completo para el modo offline
- **Actualizaciones automáticas**: Mantén tus modpacks y el launcher siempre actualizados
- **Multiplataforma**: Windows, macOS y Linux
- **Interfaz moderna**: Diseño intuitivo con tema oscuro
- **Configuración flexible**: Personaliza RAM, rutas de Java y más
- **Múltiples modloaders**: Soporte para Forge, Fabric, Quilt y NeoForge
- **⭐ Nuevo**: **Gestión automática de Java** - Lyceris descarga automáticamente la versión correcta de Java
- **⭐ Nuevo**: **Instalación optimizada** - Descargas paralelas y verificación automática de archivos
- **⭐ Nuevo**: **Validación de modpacks** - Verificación automática de compatibilidad

## 🛠️ Stack Tecnológico

- **Frontend**: React + TypeScript + Tailwind CSS
- **Framework**: Tauri (Rust + Web)
- **Minecraft Launcher**: Lyceris v1.1.3 (Rust)
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

#### Método Recomendado (Estable)
```bash
# Windows (PowerShell)
.\dev-stable.ps1

# O usando npm
npm run tauri:dev-stable
```
Inicia el launcher en modo desarrollo estable sin rebuilds constantes.

#### Método Estándar
```bash
npm run tauri dev
```
Inicia el servidor de desarrollo con hot reload (puede ser inestable en algunos sistemas).

> **⚠️ Problema Conocido**: En algunos sistemas, `npm run tauri dev` puede causar que la ventana se cierre y abra repetidamente debido a rebuilds automáticos. Si experimentas este problema, usa el método estable.

### Build de Producción
```bash
npm run tauri build
```
Genera los ejecutables para distribución.

### Solo Frontend (para desarrollo de UI)
```bash
npm run dev
```
Ejecuta solo el frontend en modo desarrollo.

### Build del Frontend
```bash
npm run build
```
Compila el frontend para producción.

## 📁 Estructura del Proyecto

```
luminakraft-launcher/
├── src/                          # Código fuente del frontend
│   ├── components/              # Componentes React
│   │   ├── Layout/             # Componentes de layout
│   │   ├── Modpacks/           # Componentes de modpacks
│   │   ├── Settings/           # Componentes de configuración
│   │   └── About/              # Componentes de información
│   ├── contexts/               # Contextos de React
│   ├── services/               # Servicios y lógica de negocio
│   ├── types/                  # Definiciones de tipos TypeScript
│   └── App.tsx                 # Componente principal
├── src-tauri/                   # Código fuente del backend (Rust)
│   ├── src/
│   │   ├── main.rs            # Punto de entrada principal
│   │   ├── launcher.rs        # Lógica de instalación de modpacks
│   │   ├── filesystem.rs      # Operaciones de sistema de archivos
│   │   ├── minecraft.rs       # Integración con Lyceris
│   │   └── downloader.rs      # Descarga de archivos
│   ├── Cargo.toml             # Dependencias de Rust (incluye Lyceris)
│   └── tauri.conf.json        # Configuración de Tauri
├── public/                      # Archivos estáticos
├── package.json                # Dependencias de Node.js
└── README.md                   # Este archivo
```

## 🔧 Configuración

### Archivo de Datos del Launcher

El launcher obtiene la información de modpacks desde un archivo JSON remoto. El formato esperado es:

```json
{
  "launcherVersion": "1.0.0",
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

## 🎮 Integración con Lyceris

### Características de Lyceris Integradas

- **Gestión automática de Java**: Descarga e instala automáticamente la versión correcta de Java
- **Soporte para múltiples mod loaders**: Forge (1.12.2+), Fabric, Quilt, NeoForge
- **Descargas paralelas**: Múltiples archivos se descargan simultáneamente
- **Verificación de integridad**: Archivos corruptos se redescargan automáticamente
- **Reportes de progreso**: Seguimiento en tiempo real de descargas e instalación

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

Los archivos compilados se generarán en `src-tauri/target/release/bundle/`.

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
└── temp/
```

## 🐛 Resolución de Problemas

### Ventana que se cierra y abre repetidamente (Desarrollo)
Si durante el desarrollo la ventana del launcher se cierra y abre constantemente:

**Causa**: Tauri está detectando cambios en archivos y reconstruyendo automáticamente.

**Soluciones**:
1. **Método Recomendado**: Usa el script estable
   ```bash
   # Windows
   .\dev-stable.ps1
   
   # O con npm
   npm run tauri:dev-stable
   ```

2. **Limpiar archivos temporales**:
   ```bash
   # Limpiar cache de Node.js
   npm run clean
   rm -rf node_modules package-lock.json
   npm install
   
   # Limpiar cache de Rust
   cd src-tauri
   cargo clean
   cd ..
   ```

3. **Verificar que no hay editores/IDEs modificando archivos automáticamente**

### Problemas con Java
✅ **Solucionado con Lyceris**: Lyceris maneja automáticamente:
- Detección de Java instalado
- Descarga automática de la versión correcta
- Configuración automática de rutas

### Errores de descarga
- Verifica tu conexión a internet
- Comprueba que la URL del archivo JSON sea correcta
- Lyceris reintentará automáticamente las descargas fallidas

### Problemas de compatibilidad de mod loaders
- El launcher valida automáticamente la compatibilidad
- Forge requiere Minecraft 1.12.2 o superior
- Otros loaders tienen soporte más amplio

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

Este es un comportamiento normal de seguridad de macOS y no indica que la aplicación esté realmente dañada.

### macOS: "Apple no pudo verificar que 'LuminaKraft Launcher' está libre de malware"
Si ves el mensaje "Apple no pudo verificar que 'LuminaKraft Launcher' está libre de malware que podría dañar tu Mac o comprometer tu privacidad":

**Solución**:
1. Abre Configuración del Sistema
2. Ve a Privacidad y Seguridad
3. Desplázate hasta la parte inferior
4. Verás el mensaje "LuminaKraft Launcher" fue bloqueado para proteger tu Mac
5. Haz clic en "Abrir de todos modos"

Este es otro mecanismo de seguridad de macOS que requiere una confirmación manual del usuario para aplicaciones no firmadas con un certificado de desarrollador de Apple.

### Problemas de permisos
En Linux/macOS, es posible que necesites dar permisos de ejecución:
```bash
chmod +x LuminaKraft-Launcher
```

## 🆕 Migración desde la Versión Anterior

### Cambios Principales

1. **Java automático**: Ya no necesitas instalar Java manualmente
2. **Validación automática**: Los modpacks se validan antes de la instalación
3. **Nuevos comandos**: Comandos adicionales para mejor gestión
4. **Mejor rendimiento**: Descargas paralelas y verificación de archivos

### Compatibilidad

- ✅ Los modpacks existentes siguen siendo compatibles
- ✅ Las configuraciones de usuario se mantienen
- ✅ Las instancias existentes funcionan sin cambios
- ✅ El formato JSON del servidor no cambia

## 🤝 Contribuir

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 👥 Equipo

Desarrollado con ❤️ por el equipo de **LuminaKraft Studios**.

---

## 🔗 Enlaces

- [Sitio Web Oficial](https://luminakraft.com)
- [Discord](https://discord.gg/UJZRrcUFMj)
- [Lyceris Library](https://crates.io/crates/lyceris)
- [Documentación de Tauri](https://tauri.app)
- [React](https://reactjs.org)
- [TypeScript](https://typescriptlang.org)
