# LKLauncher - Troubleshooting Guide

> **Note:** The launcher now automatically detects these errors and shows solutions directly in the app.

## Corrupted Download

**Error patterns:** `could not find eocd`, `invalid zip archive`, `zip.*corrupt`

**Solution:**

The downloaded file is corrupted or incomplete.

1. Click 'Retry' to download again
2. Make sure you have a stable internet connection
3. If the problem persists, delete the modpack and try again

---

## File In Use

**Error patterns:** `os error 32`, `being used by another process`, `utilizado por otro proceso`

**Solution:**

A file is being used by another process.

1. Close Minecraft if it's running
2. Close any file explorer windows showing the modpack folder
3. Wait a few seconds and try again
4. If it persists, restart your computer

---

## Connection Error

**Error patterns:** `error decoding response`, `failed to read chunk`

**Solution:**

There was a network error during download.

1. Click 'Retry' to try again
2. Check your internet connection
3. If using Wi-Fi, try moving closer to the router
4. If the problem persists, try again later

---

## Cannot Connect to Mojang

**Error patterns:** `piston-meta.mojang.com`, `error sending request.*mojang`, `launchermeta.mojang.com`

**Solution:**

Could not connect to Mojang servers.

1. Check your internet connection
2. If using a VPN, try disabling it
3. Check if your antivirus is blocking the launcher
4. Try again in a few minutes (servers might be down)

---

## Antivirus Blocking Files

**Error patterns:** `NoClassDefFoundError.*GsonBuilder`, `com/google/gson/GsonBuilder`

**Solution:**

Your antivirus may be blocking or deleting required files.

1. Add an exclusion for %APPDATA%\LKLauncher in your antivirus
2. Delete the folder %APPDATA%\LKLauncher\meta\libraries
3. Reinstall the modpack

This forces re-download of all required libraries.

---

## Forge Installation Failed

**Error patterns:** `FileNotFoundException.*forge-installer-extracts`, `forge-installer.*not found`

**Solution:**

Forge installation files are corrupted or missing.

1. Add an exclusion for %APPDATA%\LKLauncher in your antivirus
2. Uninstall this launcher completely
3. Delete the folder %APPDATA%\LKLauncher
4. Reinstall the launcher and try again

---

## Java Error

**Error patterns:** `java virtual machine launcher`, `a java exception has occurred`

**Solution:**

A Java error occurred, usually due to insufficient memory or antivirus interference.

1. Close programs that use a lot of memory
2. Check that your antivirus isn't blocking Java
3. Try lowering the RAM allocation in Settings
4. If it persists, delete the modpack and reinstall

---

## Download Verification Failed

**Error patterns:** `sha256.*no coincide`, `sha256.*mismatch`, `descarga corrupta`, `download corrupt`

**Solution:**

The downloaded file doesn't match the expected hash.

1. Click 'Retry' to download again
2. Make sure you have a stable internet connection
3. If the problem persists, your connection may be unstable

---

## How to get logs

### Minecraft logs
Location: `%APPDATA%\LKLauncher\instances\<modpack-id>\logs\latest.log`

From the launcher: In "My Modpacks", click the folder button (Open Instance) next to the settings icon. This opens the file explorer in the modpack folder. Inside, go to the `logs` folder and open `latest.log`.
