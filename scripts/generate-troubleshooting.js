/**
 * Generate TROUBLESHOOTING.md files from known-errors.json
 * Run with: node scripts/generate-troubleshooting.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT_DIR, 'known-errors.json');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

// Ensure docs directory exists
if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
}

// Read the JSON
const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));

// Generate markdown content for a language
function generateMarkdown(lang) {
    const isEnglish = lang === 'en';

    const header = isEnglish
        ? `# LKLauncher - Troubleshooting Guide

> **Note:** The launcher now automatically detects these errors and shows solutions directly in the app.

`
        : `# LKLauncher - Guía de Solución de Problemas

> **Nota:** El launcher ahora detecta automáticamente estos errores y muestra las soluciones directamente en la app.

`;

    const sections = data.errors.map(error => {
        const localized = error[lang];
        const patterns = error.patterns.map(p => `\`${p}\``).join(', ');

        return `## ${localized.title}

**Error patterns:** ${patterns}

**${isEnglish ? 'Solution' : 'Solución'}:**

${localized.solution}

---
`;
    }).join('\n');

    const footer = isEnglish
        ? `
## How to get logs

### Minecraft logs
Location: \`%APPDATA%\\LKLauncher\\instances\\<modpack-id>\\logs\\latest.log\`

From the launcher: In "My Modpacks", click the folder button (Open Instance) next to the settings icon. This opens the file explorer in the modpack folder. Inside, go to the \`logs\` folder and open \`latest.log\`.
`
        : `
## Cómo obtener logs

### Logs de Minecraft
Ubicación: \`%APPDATA%\\LKLauncher\\instances\\<id-del-modpack>\\logs\\latest.log\`

Desde el launcher: en "Mis Modpacks", haz click en el botón de carpeta (Abrir Instancia) que aparece al lado del icono de configuración. Se abrirá el explorador de archivos en la carpeta del modpack. Dentro, entra a la carpeta \`logs\` y abre \`latest.log\`.
`;

    return header + sections + footer;
}

// Generate English version (main)
const englishContent = generateMarkdown('en');
fs.writeFileSync(path.join(ROOT_DIR, 'TROUBLESHOOTING.md'), englishContent);
console.log('✅ Generated TROUBLESHOOTING.md');

// Generate Spanish version
const spanishContent = generateMarkdown('es');
fs.writeFileSync(path.join(DOCS_DIR, 'TROUBLESHOOTING.es.md'), spanishContent);
console.log('✅ Generated docs/TROUBLESHOOTING.es.md');

console.log('Done!');
