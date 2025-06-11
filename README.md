# LuminaKraft Launcher

Un lanzador de modpacks personalizado para Minecraft, desarrollado específicamente para la comunidad de LuminaKraft Studios. Construido con Tauri, React, TypeScript y Rust para ofrecer una experiencia moderna, segura y eficiente.

## 🚀 Características

- **Instalación automática de modpacks**: Descarga e instala modpacks desde una fuente remota
- **Gestión de instancias**: Cada modpack se mantiene en su propia carpeta aislada
- **Compatible con usuarios premium y no premium**: Soporte completo para el modo offline
- **Actualizaciones automáticas**: Mantén tus modpacks y el launcher siempre actualizados
- **Multiplataforma**: Windows, macOS y Linux
- **Interfaz moderna**: Diseño intuitivo con tema oscuro
- **Configuración flexible**: Personaliza RAM, rutas de Java y más
- **Múltiples modloaders**: Soporte para Forge, Fabric, Quilt y NeoForge

## 🛠️ Stack Tecnológico

- **Frontend**: React + TypeScript + Tailwind CSS
- **Framework**: Tauri (Rust + Web)
- **Iconos**: Lucide React
- **Herramientas de build**: Vite
- **Gestión de estado**: Context API de React

## 📋 Requisitos Previos

### Para Development

- **Node.js** (v18 o superior)
- **Rust** (última versión estable)
- **Sistema operativo**: Windows 10+, macOS 10.15+, o Linux (Ubuntu 18.04+)

### Para el Usuario Final

- **Java** 8 o superior (para ejecutar Minecraft)
- **Conexión a internet** (para descargar modpacks)

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
```bash
npm run tauri dev
```
Inicia el servidor de desarrollo con hot reload.

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
│   │   ├── minecraft.rs       # Lanzamiento de Minecraft
│   │   └── downloader.rs      # Descarga de archivos
│   ├── Cargo.toml             # Dependencias de Rust
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
      "jvmArgsRecomendados": "-Xmx4G -Xms2G"
    }
  ]
}
```

### Configuración del Usuario

Las configuraciones se guardan localmente y incluyen:

- **Nombre de usuario**: Para el modo offline
- **RAM asignada**: Memoria para Minecraft
- **Ruta de Java**: Opcional, usa detección automática por defecto
- **URL de datos**: Donde obtener la información de modpacks

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
│   │   └── instance.json
│   └── technika_s3/
│       └── ...
├── assets/
├── temp/
└── logs/
```

## 🐛 Resolución de Problemas

### Java no encontrado
Si el launcher no puede encontrar Java:
1. Instala Java 8 o superior
2. O configura la ruta manualmente en Configuración > Java

### Errores de descarga
- Verifica tu conexión a internet
- Comprueba que la URL del archivo JSON sea correcta
- Asegúrate de que los archivos ZIP de modpacks sean accesibles

### Problemas de permisos
En Linux/macOS, es posible que necesites dar permisos de ejecución:
```bash
chmod +x LuminaKraft-Launcher
```

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
- [Discord](https://discord.gg/luminakraft)
- [Documentación de Tauri](https://tauri.app)
- [React](https://reactjs.org)
- [TypeScript](https://typescriptlang.org)
