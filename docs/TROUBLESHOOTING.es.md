# LKLauncher - Guía de Solución de Problemas

> **Nota:** El launcher ahora detecta automáticamente estos errores y muestra las soluciones directamente en la app.

## Descarga Corrupta

**Error patterns:** `could not find eocd`, `invalid zip archive`, `zip.*corrupt`

**Solución:**

El archivo descargado está corrupto o incompleto.

1. Haz clic en 'Reintentar' para volver a descargar
2. Asegúrate de tener una conexión a internet estable
3. Si el problema persiste, elimina el modpack y vuelve a intentarlo

---

## Archivo en Uso

**Error patterns:** `os error 32`, `being used by another process`, `utilizado por otro proceso`

**Solución:**

Un archivo está siendo utilizado por otro proceso.

1. Cierra Minecraft si está abierto
2. Cierra las ventanas del explorador de archivos que muestren la carpeta del modpack
3. Espera unos segundos y vuelve a intentarlo
4. Si persiste, reinicia el PC

---

## Error de Conexión

**Error patterns:** `error decoding response`, `failed to read chunk`

**Solución:**

Hubo un error de red durante la descarga.

1. Haz clic en 'Reintentar' para intentarlo de nuevo
2. Comprueba tu conexión a internet
3. Si usas Wi-Fi, prueba a acercarte al router
4. Si el problema persiste, inténtalo más tarde

---

## No se Puede Conectar con Mojang

**Error patterns:** `piston-meta.mojang.com`, `error sending request.*mojang`, `launchermeta.mojang.com`

**Solución:**

No se pudo conectar con los servidores de Mojang.

1. Revisa tu conexión a internet
2. Si usas VPN, prueba a desactivarla
3. Comprueba que el antivirus no esté bloqueando el launcher
4. Inténtalo en unos minutos (los servidores podrían estar caídos)

---

## Antivirus Bloqueando Archivos

**Error patterns:** `NoClassDefFoundError.*GsonBuilder`, `com/google/gson/GsonBuilder`

**Solución:**

Tu antivirus puede estar bloqueando o eliminando archivos necesarios.

1. Añade una exclusión para %APPDATA%\LKLauncher en tu antivirus
2. Borra la carpeta %APPDATA%\LKLauncher\meta\libraries
3. Reinstala el modpack

Esto forzará la re-descarga de todas las librerías necesarias.

---

## Instalación de Forge Fallida

**Error patterns:** `FileNotFoundException.*forge-installer-extracts`, `forge-installer.*not found`

**Solución:**

Los archivos de instalación de Forge están corruptos o faltan.

1. Añade una exclusión para %APPDATA%\LKLauncher en tu antivirus
2. Desinstala este launcher completamente
3. Borra la carpeta %APPDATA%\LKLauncher
4. Reinstala el launcher e inténtalo de nuevo

---

## Error de Java

**Error patterns:** `java virtual machine launcher`, `a java exception has occurred`

**Solución:**

Ocurrió un error de Java, normalmente por memoria insuficiente o interferencia del antivirus.

1. Cierra programas que consuman mucha memoria
2. Comprueba que el antivirus no esté bloqueando Java
3. Prueba a reducir la asignación de RAM en Ajustes
4. Si persiste, elimina el modpack y reinstálalo

---

## Verificación de Descarga Fallida

**Error patterns:** `sha256.*no coincide`, `sha256.*mismatch`, `descarga corrupta`, `download corrupt`

**Solución:**

El archivo descargado no coincide con el hash esperado.

1. Haz clic en 'Reintentar' para volver a descargar
2. Asegúrate de tener una conexión a internet estable
3. Si el problema persiste, tu conexión puede ser inestable

---

## Cómo obtener logs

### Logs de Minecraft
Ubicación: `%APPDATA%\LKLauncher\instances\<id-del-modpack>\logs\latest.log`

Desde el launcher: en "Mis Modpacks", haz click en el botón de carpeta (Abrir Instancia) que aparece al lado del icono de configuración. Se abrirá el explorador de archivos en la carpeta del modpack. Dentro, entra a la carpeta `logs` y abre `latest.log`.
