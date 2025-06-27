# 💎 LuminaKraft Launcher

[![en](https://img.shields.io/badge/lang-en-red.svg)](https://github.com/LuminaKraft/LuminakraftLauncher/blob/main/README.md)
[![es](https://img.shields.io/badge/lang-es-yellow.svg)](https://github.com/LuminaKraft/LuminakraftLauncher/blob/main/README.es.md)

[![Descargas](https://img.shields.io/github/downloads/LuminaKraft/LuminakraftLauncher/total.svg)](https://github.com/LuminaKraft/LuminakraftLauncher/releases)
[![Versión](https://img.shields.io/github/release/LuminaKraft/LuminakraftLauncher.svg)](https://github.com/LuminaKraft/LuminakraftLauncher/releases/latest)
[![Licencia](https://img.shields.io/github/license/LuminaKraft/LuminakraftLauncher.svg)](LICENSE)
[![Estado de Compilación](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/LuminaKraft/LuminakraftLauncher/actions)

Un launcher moderno y multiplataforma para Minecraft construido con **Tauri** y **React**, que incluye actualizaciones automáticas, autenticación de Microsoft y gestión de modpacks usando la librería **Lyceris**.

![Captura de LuminaKraft Launcher](assets/images/launcher-main.png)

## ✨ Características

- 🔐 **Autenticación de Microsoft**: Inicio de sesión seguro con tu cuenta de Microsoft
- 📦 **Gestión de Modpacks**: Navega e instala modpacks desde CurseForge
- 🔄 **Actualizaciones Automáticas**: Launcher con auto-actualización y gestión de versiones
- 🌍 **Soporte Multi-idioma**: Disponible en inglés y español
- 🖥️ **Multiplataforma**: Soporte nativo para Windows, macOS y Linux
- ⚡ **Interfaz Moderna**: Interfaz hermosa y responsiva construida con React y Tailwind CSS
- 🎮 **Integración con Minecraft**: Potenciado por la librería Lyceris para gestión robusta del juego
- 🔧 **Instalación Fácil**: Instalación y gestión de modpacks con un clic
- 📊 **Seguimiento de Progreso**: Progreso de descarga e instalación en tiempo real
- 🎨 **Temas Personalizados**: Soporte para modo claro y oscuro

## 📸 Capturas de Pantalla

| Interfaz Principal | Características del Launcher | Instalación en macOS |
|:---:|:---:|:---:|
| ![Interfaz Principal](assets/images/launcher-main.png) | ![Características](assets/images/launcher-main.png) | ![Instalación macOS](assets/images/macos-installation.png) |

## 🎯 Éxito de Compilación Multiplataforma

Todas las plataformas se compilan automáticamente via GitHub Actions:

### ✅ Plataformas Soportadas
- **Windows**: Ejecutable `.exe` (NSIS) + instalador `.msi` (WiX)
- **macOS**: Archivos DMG universales (Intel + ARM64) + paquetes `.app`  
- **Linux**: AppImage + paquetes .deb/.rpm

### 📦 Artefactos de Compilación
Todas las salidas de compilación se generan automáticamente via GitHub Actions y están disponibles en Releases:
```
Releases/
├── LuminaKraft Launcher_x.x.x_x64-setup.exe          # Instalador NSIS de Windows (RECOMENDADO)
├── LuminaKraft Launcher_x.x.x_x64_es-ES.msi          # Instalador MSI de Windows
├── LuminaKraft Launcher_x.x.x_x64.dmg                # DMG de macOS Intel
├── LuminaKraft Launcher_x.x.x_aarch64.dmg            # DMG de macOS ARM64
├── LuminaKraft Launcher_x.x.x_amd64.AppImage         # AppImage de Linux
├── LuminaKraft Launcher_x.x.x_amd64.deb              # Paquete Debian de Linux
└── LuminaKraft Launcher-x.x.x-1.x86_64.rpm           # Paquete RPM de Linux
```

## 🚀 Instalación

### 📥 Guía de Instalación Rápida

#### 🪟 **Windows** (Plataforma Recomendada)

1. **Descargar**: Ve a [Versiones](https://github.com/LuminaKraft/LuminakraftLauncher/releases/latest)
   - **🔥 RECOMENDADO**: `LuminaKraft Launcher_x.x.x_x64-setup.exe` (instalador NSIS - permite limpiar datos al desinstalar)
   - **Alternativo**: `LuminaKraft Launcher_x.x.x_x64_es-ES.msi` (instalador MSI - para entornos corporativos)

2. **Ejecutar Instalador**: Haz doble clic en el archivo descargado

3. **⚠️ Advertencia de Windows Defender SmartScreen**:
   - Si ves "**Windows protegió tu PC**":
   - Haz clic en "**Más información**"
   - Haz clic en "**Ejecutar de todas formas**"
   - Esto ocurre porque la aplicación aún no está firmada con un certificado costoso

4. **Instalar**: Sigue las instrucciones del instalador → ¡Lanzar!

> **¿Por qué .exe sobre .msi?** El instalador NSIS `.exe` te da la opción de eliminar datos de usuario al desinstalar, mientras que el `.msi` sigue el comportamiento estándar de Windows de preservar datos de usuario.

#### 🍎 **macOS**

1. **Descargar**: 
   - **Macs Intel**: `LuminaKraft Launcher_x.x.x_x64.dmg`
   - **Apple Silicon (M1/M2/M3)**: `LuminaKraft Launcher_x.x.x_aarch64.dmg`

2. **Abrir DMG**: Haz doble clic en el archivo `.dmg` descargado

3. **Arrastrar a Aplicaciones**: Arrastra `LuminaKraft Launcher.app` a la carpeta Aplicaciones
   
   ![Proceso de Instalación en macOS](assets/images/macos-installation.png)

4. **⚠️ Problemas de Gatekeeper** (Muy Común):
   
   **Si obtienes "La app está dañada" o "No se puede verificar el desarrollador":**
   
   **Método 1 - Clic Derecho (Más Fácil):**
   - Haz clic derecho en la app en Aplicaciones
   - Selecciona "Abrir"
   - Haz clic en "Abrir" cuando se te solicite
   
   **Método 2 - Preferencias del Sistema:**
   - Ve a Menú Apple → Preferencias del Sistema → Seguridad y Privacidad
   - Haz clic en el candado para hacer cambios
   - Encuentra el mensaje de la app bloqueada y haz clic en "Abrir de todas formas"
   
   **Método 3 - Terminal (Si los anteriores fallan):**
   
   Abre Terminal (⌘+Espacio, busca "terminal"):
   
   ![Abrir Terminal](assets/images/macos-spotlight-terminal.png)
   
   Ejecuta este comando:
   ```bash
   # Eliminar atributo de cuarentena
   xattr -cr "/Applications/LuminaKraft Launcher.app"
   ```
   
   ![Comando Terminal](assets/images/macos-terminal-xattr.png)

5. **Iniciar el Launcher**: Busca "LuminaKraft Launcher" en Spotlight (⌘+Espacio):

   ![Buscar Launcher](assets/images/macos-spotlight-launcher.png)

#### 🐧 **Linux**

1. **Descargar**: Elige tu formato:
   - **AppImage** (Universal): `LuminaKraft Launcher_x.x.x_amd64.AppImage`
   - **Debian/Ubuntu**: `LuminaKraft Launcher_x.x.x_amd64.deb`
   - **Fedora/RHEL**: `LuminaKraft Launcher-x.x.x-1.x86_64.rpm`

2. **Instalar**:
   ```bash
   # AppImage (No requiere instalación)
   chmod +x LuminaKraft\ Launcher_*_amd64.AppImage
   ./LuminaKraft\ Launcher_*_amd64.AppImage
   
   # Debian/Ubuntu
   sudo dpkg -i LuminaKraft\ Launcher_*_amd64.deb
   
   # Fedora/RHEL  
   sudo rpm -i LuminaKraft\ Launcher-*-1.x86_64.rpm
   ```

### 📋 Requisitos del Sistema
- **Windows**: Windows 10 o posterior
- **macOS**: macOS 10.13 (High Sierra) o posterior
- **Linux**: Distribución moderna con GTK 3.24+
- **RAM**: 4GB mínimo, 8GB recomendado
- **Almacenamiento**: 1GB de espacio libre para el launcher + almacenamiento de modpacks

### 🔧 Solución de Problemas

#### Problemas en Windows
- **Advertencia SmartScreen**: Comportamiento normal, haz clic en "Más información" → "Ejecutar de todas formas"
- **Detección de Antivirus**: Agrega el launcher a la lista blanca del antivirus
- **Instalación Fallida**: Ejecuta el instalador como Administrador

#### Problemas en macOS  
- **"La app está dañada"**: Elimina la cuarentena con `xattr -cr "/Applications/LuminaKraft Launcher.app"` ([ver guía visual](#️-problemas-de-gatekeeper-muy-común))
- **"No se puede verificar el desarrollador"**: Clic derecho en la app → Abrir → Abrir ([ver guía de instalación](#-macos))
- **Permiso Denegado**: Revisa la configuración de Seguridad y Privacidad
- **La app no se inicia**: Intenta abrir desde Terminal: `open "/Applications/LuminaKraft Launcher.app"`

#### Problemas en Linux
- **AppImage no se ejecuta**: Hazlo ejecutable con `chmod +x`
- **Dependencias faltantes**: Instala GTK 3.24+ y WebKit2GTK
- **Conflictos de paquetes**: Usa AppImage para compatibilidad universal

## 🛠 Compilación y Releases

### Compilaciones Automatizadas via GitHub Actions

¡Todas las compilaciones ahora se manejan automáticamente a través de GitHub Actions. No se necesita compilación local!

### Crear un Release

1. **Actualizar Versión**: Actualiza la versión en `package.json` y `src-tauri/tauri.conf.json`
2. **Crear Git Tag**: 
   ```bash
   git tag v0.0.7
   git push origin v0.0.7
   ```
3. **Compilación Automática**: GitHub Actions compilará automáticamente todas las plataformas y creará un release
4. **Trigger Manual**: También puedes disparar compilaciones manualmente desde la pestaña GitHub Actions

### Compilación Local de Desarrollo (Opcional)

Solo para propósitos de desarrollo:

```bash
# Clonar el repositorio
git clone https://github.com/LuminaKraft/LuminakraftLauncher.git
cd LuminakraftLauncher

# Instalar dependencias
npm install

# Compilar solo para la plataforma actual (desarrollo)
npm run tauri build
```

> **Nota**: Los releases de producción siempre deben usar GitHub Actions para consistencia y firma apropiada.

## 📋 Desarrollo

### Desarrollo Local
```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run tauri:dev

# Ejecutar con puerto estable (mata el puerto 1420 primero)
npm run tauri:dev-stable

# Verificar código
npm run lint

# Limpiar artefactos de compilación
npm run clean
```

### Estructura del Proyecto
```
LuminakraftLauncher/
├── src/                    # Código fuente del frontend React
│   ├── components/         # Componentes de UI
│   ├── services/          # Capas de API y servicios
│   ├── types/             # Definiciones de tipos TypeScript
│   ├── contexts/          # Contextos de React
│   ├── locales/           # Archivos de internacionalización
│   └── assets/            # Recursos estáticos
├── src-tauri/             # Código fuente del backend Tauri
│   ├── src/               # Archivos fuente de Rust
│   ├── Cargo.toml         # Dependencias de Rust
│   └── tauri.conf.json    # Configuración de Tauri
├── public/                # Recursos públicos estáticos
├── scripts/               # Scripts de compilación y utilidades
├── docs/                  # Documentación
└── assets/                # Capturas de pantalla e imágenes
```

## 🔧 Detalles Técnicos

### Arquitectura
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Rust + Tauri 2.5.1
- **Sistema de Compilación**: GitHub Actions con compilación multiplataforma
- **Empaquetado**: Instaladores nativos (NSIS + MSI) + AppImage para Linux
- **Librería de Minecraft**: Lyceris para autenticación y gestión del juego
- **Iconos de UI**: Lucide React para iconografía moderna
- **Cliente HTTP**: Axios (frontend) + Reqwest (backend)

### Librerías Clave
- **Lyceris**: Funcionalidad central del launcher de Minecraft
- **Tauri**: Framework de aplicaciones multiplataforma
- **React**: Framework de frontend
- **Tailwind CSS**: Estilizado utility-first
- **i18next**: Internacionalización
- **Lucide React**: Librería de iconos

### Optimización de Compilación
- Compilaciones automatizadas via GitHub Actions
- Compilación multiplataforma sin configuración local de Docker
- Pipeline CI/CD optimizado para releases más rápidos

## 🌍 Internacionalización

LuminaKraft Launcher soporta múltiples idiomas:
- **Inglés** (en) - Por defecto
- **Español** (es) - Español

Para contribuir con traducciones:
1. Revisa el directorio `src/locales/`
2. Agrega o actualiza archivos de traducción
3. Sigue la estructura de claves existente
4. Envía un pull request

## 📚 Documentación

- [Resumen de Documentación](docs/README.md) - Guía completa de documentación
- [Guía de Testing](docs/TESTING_GUIDE.md) - Procedimientos de testing y control de calidad
- [Integración Lyceris](docs/LYCERIS_INTEGRATION_SUMMARY.md) - Detalles de la librería central del launcher
- [Pautas de Contribución](CONTRIBUTING.md) - Cómo contribuir al proyecto
- [Código de Conducta](CODE_OF_CONDUCT.md) - Pautas de la comunidad

## 🤝 Contribuciones

¡Damos la bienvenida a las contribuciones! Por favor revisa nuestras [Pautas de Contribución](CONTRIBUTING.md) para más detalles.

### Inicio Rápido para Contribuidores
1. Haz un fork del repositorio
2. Crea una rama de feature (`git checkout -b feature/caracteristica-increible`)
3. Haz tus cambios siguiendo nuestras [pautas de estilo de código](CONTRIBUTING.md#code-style-and-formatting)
4. Prueba las compilaciones en tu plataforma objetivo
5. Confirma tus cambios (`git commit -s -m 'Agregar característica increíble'`)
6. Push a la rama (`git push origin feature/caracteristica-increible`)
7. Abre un Pull Request

### Entorno de Desarrollo
- Sigue nuestro [Código de Conducta](CODE_OF_CONDUCT.md)
- Firma tus commits ([Certificado de Origen del Desarrollador](CONTRIBUTING.md#signing-your-work))
- Usa mensajes de commit convencionales
- Prueba en múltiples plataformas cuando sea posible

## 🐛 Reportes de Errores y Solicitudes de Características

¿Encontraste un error o tienes una solicitud de característica? Por favor revisa nuestra [página de Issues](https://github.com/LuminaKraft/LuminakraftLauncher/issues) y crea un nuevo issue si es necesario.

## 📄 Licencia

Este proyecto está licenciado bajo la **Licencia Pública General GNU v3.0** - revisa el archivo [LICENSE](LICENSE) para más detalles.

### Licencias de Terceros
Revisa [COPYING.md](COPYING.md) para información detallada sobre dependencias de terceros y sus licencias.

## 🏆 Reconocimientos

- **Librería Lyceris**: Funcionalidad central del launcher de Minecraft
- **Equipo Tauri**: Framework multiplataforma increíble
- **Comunidad React**: Excelente ecosistema de frontend
- **Prism Launcher**: Inspiración para las pautas de la comunidad
- **Todos los Contribuidores**: ¡Gracias por hacer este proyecto mejor!

## 📞 Soporte

- 📖 **Documentación**: Revisa nuestro directorio [docs](docs/)
- 🐛 **Reportes de Errores**: [GitHub Issues](https://github.com/LuminaKraft/LuminakraftLauncher/issues)
- 💬 **Discusiones**: [GitHub Discussions](https://github.com/LuminaKraft/LuminakraftLauncher/discussions)
- 🌐 **Sitio Web**: ¡Próximamente!

---

**🎉 ¡Listo para distribución multiplataforma automatizada!** LuminaKraft Launcher se compila automáticamente para Windows, macOS y Linux via GitHub Actions con pipelines CI/CD optimizados.

<div align="center">
  <sub>Construido con ❤️ por el equipo de LuminaKraft Studios</sub>
</div> 