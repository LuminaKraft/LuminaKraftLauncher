# 🚀 Automated Release Setup Guide

## 🎯 Objetivo

Automatizar completamente el proceso de releases para que cuando hagas `git tag v0.4.0 && git push --tags`, automáticamente:

1. **Launcher Repo**: Compila y crea release en GitHub
2. **API Repo**: Se actualiza automáticamente con la nueva información de release
3. **Usuarios**: Reciben la actualización automáticamente sin pasos manuales

## 🔧 Setup Completo

### 1. **Configurar Token de GitHub**

#### En el repositorio del **Launcher**:
1. Ve a **Settings** → **Secrets and variables** → **Actions**
2. Crea un nuevo **Repository Secret**:
   - **Name**: `API_REPO_TOKEN`
   - **Value**: Un Personal Access Token con permisos `repo` y `workflow`

#### Crear Personal Access Token:
1. Ve a GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. **Generate new token (classic)**
3. **Scopes necesarios**:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
4. **Expiration**: Sin expiración o 1 año
5. **Copia el token** y úsalo como `API_REPO_TOKEN`

### 2. **Workflow en el Repositorio de la API**

Crea `.github/workflows/update-launcher-release.yml` en tu repositorio de la API:

```yaml
name: Update Launcher Release Data

on:
  repository_dispatch:
    types: [launcher-release]

jobs:
  update-release-data:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - name: Checkout API repository
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Extract release information
        id: release_info
        run: |
          echo "VERSION=${{ github.event.client_payload.version }}" >> $GITHUB_OUTPUT
          echo "RELEASE_URL=${{ github.event.client_payload.release_url }}" >> $GITHUB_OUTPUT
          echo "TIMESTAMP=${{ github.event.client_payload.timestamp }}" >> $GITHUB_OUTPUT

      - name: Update launcher_data.json
        run: |
          # Create or update the launcher data file
          cat > public/v1/launcher_data.json << 'EOF'
          {
            "launcherVersion": "${{ steps.release_info.outputs.VERSION }}",
            "launcherDownloadUrls": {
              "windows": "${{ github.event.client_payload.artifacts.windows-x86_64.msi }}",
              "macos": "${{ github.event.client_payload.artifacts.darwin-aarch64.dmg }}",
              "linux": "${{ github.event.client_payload.artifacts.linux-x86_64.appimage }}"
            },
            "modpacks": [
              {
                "id": "volcania_s1",
                "nombre": "LuminaKraft: Volcania S1",
                "descripcion": "Un modpack de aventura y magia en un mundo volcánico",
                "version": "1.2.3",
                "minecraftVersion": "1.18.2",
                "modloader": "forge",
                "modloaderVersion": "40.2.0",
                "urlIcono": "https://api.luminakraft.com/assets/modpacks/volcania_s1/icon.png",
                "urlModpackZip": "https://api.luminakraft.com/releases/modpacks/volcania_s1_v1.2.3.zip",
                "changelog": "v1.2.3: Mejoras de rendimiento y nuevos mods",
                "jvmArgsRecomendados": "-XX:+UseG1GC -XX:+ParallelRefProcEnabled"
              }
            ]
          }
          EOF

      - name: Create updater endpoint data
        run: |
          # Create the updater endpoint directory structure
          mkdir -p public/v1/updater/${{ steps.release_info.outputs.VERSION }}
          
          # Create updater response for each platform
          cat > public/v1/updater/${{ steps.release_info.outputs.VERSION }}/windows-x86_64.json << 'EOF'
          {
            "version": "${{ steps.release_info.outputs.VERSION }}",
            "notes": "See changelog: ${{ github.event.client_payload.changelog }}",
            "pub_date": "${{ steps.release_info.outputs.TIMESTAMP }}",
            "platforms": {
              "windows-x86_64": {
                "signature": "",
                "url": "${{ github.event.client_payload.artifacts.windows-x86_64.msi }}"
              }
            }
          }
          EOF

          cat > public/v1/updater/${{ steps.release_info.outputs.VERSION }}/linux-x86_64.json << 'EOF'
          {
            "version": "${{ steps.release_info.outputs.VERSION }}",
            "notes": "See changelog: ${{ github.event.client_payload.changelog }}",
            "pub_date": "${{ steps.release_info.outputs.TIMESTAMP }}",
            "platforms": {
              "linux-x86_64": {
                "signature": "",
                "url": "${{ github.event.client_payload.artifacts.linux-x86_64.appimage }}"
              }
            }
          }
          EOF

          cat > public/v1/updater/${{ steps.release_info.outputs.VERSION }}/darwin-aarch64.json << 'EOF'
          {
            "version": "${{ steps.release_info.outputs.VERSION }}",
            "notes": "See changelog: ${{ github.event.client_payload.changelog }}",
            "pub_date": "${{ steps.release_info.outputs.TIMESTAMP }}",
            "platforms": {
              "darwin-aarch64": {
                "signature": "",
                "url": "${{ github.event.client_payload.artifacts.darwin-aarch64.dmg }}"
              }
            }
          }
          EOF

          cat > public/v1/updater/${{ steps.release_info.outputs.VERSION }}/darwin-x86_64.json << 'EOF'
          {
            "version": "${{ steps.release_info.outputs.VERSION }}",
            "notes": "See changelog: ${{ github.event.client_payload.changelog }}",
            "pub_date": "${{ steps.release_info.outputs.TIMESTAMP }}",
            "platforms": {
              "darwin-x86_64": {
                "signature": "",
                "url": "${{ github.event.client_payload.artifacts.darwin-x86_64.dmg }}"
              }
            }
          }
          EOF

      - name: Update latest version symlink
        run: |
          # Create a symlink to the latest version for the updater endpoint
          cd public/v1/updater/
          rm -f latest
          ln -sf ${{ steps.release_info.outputs.VERSION }} latest

      - name: Commit and push changes
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add .
          git commit -m "🚀 Auto-update launcher release data to ${{ steps.release_info.outputs.VERSION }}"
          git push

      - name: Create deployment (if using a deployment service)
        run: |
          echo "✅ Release data updated successfully!"
          echo "🔗 New version: ${{ steps.release_info.outputs.VERSION }}"
          echo "📦 Files updated:"
          echo "  - public/v1/launcher_data.json"
          echo "  - public/v1/updater/${{ steps.release_info.outputs.VERSION }}/"
          echo "🚀 API is now serving the latest release information!"
```

## 🚀 Proceso de Release Automatizado

### Para hacer un release ahora solo necesitas:

```bash
# 1. Actualizar versión en los archivos necesarios
npm version patch  # o minor, major

# 2. Crear y pushear el tag
git add .
git commit -m "🚀 Release v0.4.0"
git tag v0.4.0
git push origin main --tags

# 3. ¡YA ESTÁ! Todo lo demás es automático:
# ✅ GitHub Actions compila el launcher
# ✅ Crea el release en GitHub
# ✅ Notifica al repositorio de la API
# ✅ La API se actualiza automáticamente
# ✅ Los usuarios reciben la actualización
```

## 🚀 **Comandos de Release Simplificados**

Con el script `release.js` que hemos creado:

```bash
# Opción 1: Release automático con incremento semántico
npm run release:patch    # 0.3.1 → 0.3.2 (bug fixes)
npm run release:minor    # 0.3.1 → 0.4.0 (new features)
npm run release:major    # 0.3.1 → 1.0.0 (breaking changes)

# Opción 2: Release manual con versión específica
npm run release 0.4.0    # Release version 0.4.0
npm run release 1.0.0-beta.1  # Release beta version

# Opción 3: Solo preparar (sin push automático)
node release.js 0.4.0    # Prepara pero no hace push
# Luego manualmente: git push origin main --tags
```

## 🎯 **Resultado Final**

**Antes**: 
- Crear release manualmente
- Actualizar API manualmente
- Usuarios esperan actualizaciones

**Después**:
- `git tag v0.4.0 && git push --tags`
- ¡Todo automático!
- Usuarios reciben actualizaciones inmediatamente

**¡Cero pasos manuales adicionales!** 🎉 