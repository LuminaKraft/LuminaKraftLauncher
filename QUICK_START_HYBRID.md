# 🚀 Quick Start: Solución Híbrida

> **Setup rápido en 5 minutos para desarrollo privado + releases públicas GRATUITAS**

## ⚡ Setup Automático

### Para Windows (PowerShell)
```powershell
.\scripts\setup-hybrid.ps1
```

### Para Linux/macOS (Bash)
```bash
./scripts/setup-hybrid.sh
```

## 🔧 Setup Manual (3 pasos)

### 1. **Configurar Remote Público**
```bash
git remote add public https://github.com/kristiangarcia/luminakraft-launcher-releases.git
```

### 2. **Configurar Secrets**

#### En el **Repositorio Privado** (`kristiangarcia/luminakraft-launcher`):
- `PUBLIC_REPO_TOKEN`: Token con permisos en repo público
- `TAURI_PRIVATE_KEY`: Clave para firmar releases
- `TAURI_KEY_PASSWORD`: Password de la clave

#### En el **Repositorio Público** (`kristiangarcia/luminakraft-launcher-releases`):
- `TAURI_PRIVATE_KEY`: **Misma clave que el privado**
- `TAURI_KEY_PASSWORD`: **Mismo password que el privado**

### 3. **Primera Release**
```bash
git tag v1.0.0
git push origin v1.0.0
```

## 🎯 Cómo Funciona

```mermaid
graph LR
    A[Repo Privado] -->|push tag| B[Workflow privado]
    B -->|sync código| C[Repo Público]
    C -->|build gratis| D[Release automática]
    D --> E[Usuarios descargan]
```

## 💰 Beneficios Inmediatos

- ✅ **Código fuente 100% privado**
- ✅ **Builds GRATUITAS e ilimitadas** 
- ✅ **4 plataformas simultáneas**: Windows, macOS (Intel + ARM), Linux
- ✅ **Releases automáticas** con assets firmados
- ✅ **0 minutos gastados** en repo privado

## 🚀 Comandos Esenciales

### **Desarrollo Normal**
```bash
# Se sincroniza automáticamente al hacer push
git push origin main
```

### **Release Completa**
```bash
git tag v1.2.0
git push origin v1.2.0
# Se ejecuta build automática en repo público
```

### **Testing Manual**
- Ve a **Actions** en GitHub
- Ejecuta **"Push to Public Repository"**
- Selecciona opciones y ejecuta

## 📊 Monitoreo

### **Verificar Sync**
- **Privado**: `https://github.com/kristiangarcia/luminakraft-launcher/actions`
- **Público**: `https://github.com/kristiangarcia/luminakraft-launcher-releases/actions`

### **Ver Releases**
- **Descargas**: `https://github.com/kristiangarcia/luminakraft-launcher-releases/releases`

## 🆘 Troubleshooting Rápido

### ❌ "Failed to trigger build workflow"
```bash
# Verificar que el workflow existe
curl -H "Authorization: token $TOKEN" \
     https://api.github.com/repos/kristiangarcia/luminakraft-launcher-releases/actions/workflows
```

### ❌ "Remote 'public' does not exist"
```bash
git remote add public https://github.com/kristiangarcia/luminakraft-launcher-releases.git
```

### ❌ "Authentication failed"
- Verifica que `PUBLIC_REPO_TOKEN` esté configurado
- El token debe tener permisos en el repo público

---

## 🎉 ¡Ya está!

Con la solución híbrida configurada:

1. **Desarrolla normalmente** en el repo privado
2. **Haz releases** con tags (automáticas)
3. **Los usuarios descargan** desde el repo público
4. **Gastas 0 minutos** de GitHub Actions

**📖 Documentación completa**: `HYBRID_SOLUTION.md` 