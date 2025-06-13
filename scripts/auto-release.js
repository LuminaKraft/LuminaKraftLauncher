import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuración
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_REPO_PATH = path.join(__dirname, '../../luminakraft-launcher-releases');
const ARTIFACTS_PATH = path.join(__dirname, '../src-tauri/target/release');

// Obtener la versión actual del package.json
const getVersion = () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  return packageJson.version;
};

// Construir la aplicación
const buildApp = () => {
  console.log('🔨 Construyendo la aplicación...');
  execSync('npm run tauri build', { stdio: 'inherit' });
};

// Crear release en el repositorio público
const createRelease = (version) => {
  console.log(`📦 Creando release ${version}...`);
  
  // Cambiar al directorio del repositorio público
  process.chdir(PUBLIC_REPO_PATH);
  
  // Crear un tag para la nueva versión
  execSync(`git tag -a v${version} -m "Release v${version}"`, { stdio: 'inherit' });
  
  // Copiar los artefactos
  const artifacts = fs.readdirSync(ARTIFACTS_PATH)
    .filter(file => !file.endsWith('.pdb') && !file.endsWith('.d'));
    
  artifacts.forEach(artifact => {
    const source = path.join(ARTIFACTS_PATH, artifact);
    const dest = path.join(PUBLIC_REPO_PATH, 'releases', artifact);
    
    // Asegurar que el directorio releases existe
    if (!fs.existsSync(path.join(PUBLIC_REPO_PATH, 'releases'))) {
      fs.mkdirSync(path.join(PUBLIC_REPO_PATH, 'releases'), { recursive: true });
    }
    
    fs.copyFileSync(source, dest);
    console.log(`📄 Copiado: ${artifact}`);
  });
  
  // Commit y push de los artefactos
  execSync('git add releases/*', { stdio: 'inherit' });
  execSync(`git commit -m "release: v${version}"`, { stdio: 'inherit' });
  execSync('git push origin main --tags', { stdio: 'inherit' });
  
  console.log(`✅ Release v${version} creada y publicada!`);
};

// Función principal
const main = async () => {
  try {
    const version = getVersion();
    console.log(`🚀 Iniciando release automática v${version}`);
    
    // Construir
    buildApp();
    
    // Crear release
    createRelease(version);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

main(); 