# LKLauncher - Problemas Típicos y Soluciones

## Autenticación

### OAuth Error: No se pudo conectar con el launcher
**Error:** `ERR_BLOCKED_BY_CLIENT` o fallo al enviar tokens

**Solución:** El error es porque tienes un adblocker u otra extensión del navegador que está bloqueando la autenticación. Desactívalo temporalmente para el proceso de login o prueba en modo incógnito/privado (con extensiones desactivadas).

---

## Instalación de Modpacks

### NoClassDefFoundError: com/google/gson/GsonBuilder
**Error:** `Failed to install modpack: Operation failed: Processor failed: java.lang.NoClassDefFoundError: com/google/gson/GsonBuilder`

**Solución:** Desactiva el antivirus y/o agrega exclusión a `%APPDATA%\LKLauncher`. Luego borra la carpeta `%APPDATA%\LKLauncher\meta\libraries` y vuelve a instalar el modpack, eso forzará que se descarguen de nuevo todas las librerías.

---

### FileNotFoundException: forge-installer-extracts
**Error:** `Failed to install modpack: Operation failed: Processor failed: java.io.FileNotFoundException: ...forge-installer-extracts...`

**Solución:** Desactiva el antivirus y/o agrega exclusión a `%APPDATA%\LKLauncher`. Desinstala el launcher y borra la carpeta `%APPDATA%\LKLauncher`. Luego reinstala el launcher y debería funcionar.

---

### Archivo utilizado por otro proceso (os error 32)
**Error:** `Failed to install modpack: El proceso no tiene acceso al archivo porque está siendo utilizado por otro proceso. (os error 32)`

**Solución:** Cierra Minecraft si lo tienes abierto, cierra también la carpeta del modpack si la tienes abierta en el explorador y vuelve a intentarlo. Si sigue fallando, reinicia el PC.

---

### Error al decodificar respuesta
**Error:** `Failed to install modpack: Failed to read chunk: error decoding response body`

**Solución:** Conexión inestable. Vuelve a intentar la instalación. Si persiste, comprueba tu conexión a internet.

---

### ZIP inválido (Could not find EOCD)
**Error:** `Failed to install modpack: invalid Zip archive: Could not find EOCD`

**Solución:** El archivo se descargó incompleto o corrupto. Cierra el launcher, borra el modpack desde "Mis Modpacks" si aparece, y vuelve a instalarlo. Asegúrate de tener buena conexión a internet.

---

### No se puede conectar con Mojang
**Error:** `Failed to install modpack: error sending request for url (https://piston-meta.mojang.com/...)`

**Solución:** No se pudo conectar con los servidores de Mojang. Revisa tu conexión a internet, si usas VPN desactívala, y comprueba que el antivirus no esté bloqueando el launcher. Puedes probar abriendo https://piston-meta.mojang.com/mc/game/version_manifest_v2.json en el navegador.

---

## Ejecución del Juego

### Java Exception has occurred
**Error:** Popup de Windows "Java Virtual Machine Launcher: A Java Exception has occurred"

**Solución:** Suele pasar cuando no hay suficiente RAM libre o el antivirus bloquea Java. Cierra programas que consuman mucha memoria, revisa que el antivirus no esté bloqueando nada, y si sigue fallando borra la carpeta del modpack e instálalo de nuevo.

---

## Cómo obtener logs completos

### Logs de Minecraft
Ubicación: `%APPDATA%\LKLauncher\instances\<id-del-modpack>\logs\latest.log`

Desde el launcher: en "Mis Modpacks", haz click en el botón de carpeta (Abrir Instancia) que aparece al lado del icono de configuración. Se abrirá el explorador de archivos en la carpeta del modpack. Dentro, entra a la carpeta `logs` y abre `latest.log`.
