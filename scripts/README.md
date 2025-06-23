# Scripts de LuminaKraft Launcher 🔧

Este directorio contiene scripts de utilidad para trabajadores y desarrolladores de LuminaKraft.

## check-modpack-urls.sh

Script para verificar qué mods de un modpack de CurseForge tienen URLs vacías y necesitan ser incluidos en `overrides/mods/`.

### 🎯 **¿Para qué sirve?**

Este script ayuda a los trabajadores a verificar modpacks **antes** de subirlos al servidor, identificando qué mods no pueden descargarse automáticamente y necesitan ser incluidos manualmente en la carpeta `overrides/mods/`.

### 📋 **Requisitos del Sistema**

El script requiere herramientas estándar que están preinstaladas en la mayoría de sistemas:

- **unzip** - Para extraer archivos ZIP
- **curl** - Para hacer peticiones HTTP
- **jq** - Para procesar JSON

#### Instalación de dependencias:

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install unzip curl jq
```

**macOS (con Homebrew):**
```bash
brew install jq
# unzip y curl ya están preinstalados
```

**CentOS/RHEL/Fedora:**
```bash
sudo yum install unzip curl jq
```

### 🚀 **Uso**

```bash
# Hacer ejecutable (solo la primera vez)
chmod +x check-modpack-urls.sh

# Verificar un modpack
./check-modpack-urls.sh mi-modpack-1.0.0.zip
```

### 📊 **Ejemplo de Salida**

```
🔍 LuminaKraft Modpack URL Checker v1.0
=====================================

📁 Procesando modpack: mi-modpack-1.0.0.zip
⏳ Extrayendo manifest.json...
✅ Manifest extraído correctamente

📦 Modpack: Mi Modpack v1.0.0
🎮 Minecraft: 1.20.1
🔧 ModLoader: forge-47.2.0
📊 Total de mods: 95

🌐 Consultando API de LuminaKraft...
📡 Consultando 95 mods en batches de 50...
   📦 Batch 1/2 (50 mods)
   📦 Batch 2/2 (45 mods)
✅ Obtenida información de 95/95 mods

🔍 Analizando URLs de descarga...
✅ Análisis completado

📊 RESULTADO DEL ANÁLISIS
=========================

📈 Estadísticas:
   • Total de mods: 95
   • Con URL válida: 92 (97%)
   • URL vacía: 3 (3%)
   • No encontrados: 0

⚠️  MODS CON URL VACÍA - REQUIEREN DESCARGA MANUAL
====================================================

Los siguientes mods necesitan ser descargados manualmente y agregados a overrides/mods/:

• 📄 JEI Integration
  Archivo: jeiintegration_1.20.1-10.0.0.jar
  Project ID: 265917
  File ID: 4556776
  Estado: Approved (4)
  Disponible: Sí
  🔗 Descargar desde: https://www.curseforge.com/minecraft/mc-mods/project-265917/files/4556776

• 📄 AppleSkin
  Archivo: appleskin-forge-mc1.20.1-2.5.1.jar
  Project ID: 248787
  File ID: 4564227
  Estado: Approved (4)
  Disponible: Sí
  🔗 Descargar desde: https://www.curseforge.com/minecraft/mc-mods/project-248787/files/4564227

📝 INSTRUCCIONES:
==================
1. Visita cada enlace de arriba
2. Descarga el archivo del mod
3. Crea la carpeta overrides/mods/ en tu modpack si no existe
4. Coloca los archivos .jar descargados en overrides/mods/
5. Reempaqueta tu modpack con los overrides incluidos

📋 RESUMEN DE ACCIONES NECESARIAS:
==================================
• Descargar manualmente 3 mod(s) y agregarlos a overrides/mods/

🔧 Script completado.
```

### ✅ **Caso Ideal (Sin Mods Problemáticos)**

```
📊 RESULTADO DEL ANÁLISIS
=========================

📈 Estadísticas:
   • Total de mods: 95
   • Con URL válida: 95 (100%)
   • URL vacía: 0 (0%)
   • No encontrados: 0

✅ ¡EXCELENTE! Todos los mods tienen URLs válidas
==============================================
No necesitas descargar ningún mod manualmente.

🎉 TU MODPACK ESTÁ LISTO PARA SUBIR!
====================================
Todos los mods pueden descargarse automáticamente.

🔧 Script completado.
```

### 🔄 **Flujo de Trabajo Recomendado**

1. **Exportar modpack** desde CurseForge App
2. **Ejecutar script** para verificar URLs
3. **Si hay mods con URL vacía:**
   - Descargar manualmente usando los enlaces proporcionados
   - Crear carpeta `overrides/mods/` en el modpack
   - Colocar los archivos `.jar` descargados en `overrides/mods/`
   - Reempaquetar el modpack ZIP
   - **Opcional:** Ejecutar el script nuevamente para confirmar
4. **Subir modpack** al servidor

### 🐛 **Solución de Problemas**

**Error: "command not found: jq"**
```bash
# Instalar jq según tu sistema operativo (ver sección de requisitos)
```

**Error: "No se encontró manifest.json"**
- Verifica que el archivo sea un modpack válido exportado desde CurseForge App
- El archivo debe ser un ZIP que contenga `manifest.json` en la raíz

**Warning: "Error de red en batch X"**
- Problema temporal de conectividad
- El script continúa y reporta los errores al final
- Reintenta si hay muchos errores de red

**Warning: "Respuesta inválida en batch X"**
- Problema temporal con la API de LuminaKraft
- El script continúa con los demás batches
- Los mods no procesados aparecerán como "No encontrados"

### 📚 **Información Técnica**

- **API utilizada:** `https://api.luminakraft.com/v1/curseforge`
- **Batch size:** 50 mods por petición (límite de la API)
- **Rate limiting:** 500ms de delay entre batches
- **User-Agent:** `LuminaKraft-ModpackChecker/1.0`

### 🔍 **Estados de Archivo CurseForge**

| Código | Estado | Descripción |
|--------|--------|-------------|
| 4 | Approved | **Más común con URL vacía** - Archivo aprobado pero sin descarga directa |
| 10 | Released | Archivo liberado y disponible |
| 1 | Processing | En proceso de aprobación |
| 5 | Rejected | Rechazado por moderadores |
| 7 | Deleted | Eliminado del sistema |

### 📝 **Notas para Trabajadores**

- **File Status 4 (Approved)** es el más común para mods con URL vacía
- Estos mods suelen tener distribución restringida por decisión del autor
- **SIEMPRE** incluir estos mods en `overrides/mods/` para que funcionen
- El launcher ahora detecta automáticamente si un mod ya está en overrides y no lo marcará como fallido 