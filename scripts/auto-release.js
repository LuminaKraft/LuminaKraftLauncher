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
  try {
    // Instalar dependencias si es necesario
    if (!fs.existsSync('node_modules')) {
      console.log('📦 Instalando dependencias...');
      execSync('npm install', { stdio: 'inherit' });
    }
    
    // Construir la aplicación
    execSync('npm run tauri build', { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Error al construir:', error.message);
    throw error;
  }
};

// Crear release en el repositorio público
const createRelease = (version) => {
  console.log(`📦 Creando release ${version}...`);
  
  try {
    // Cambiar al directorio del repositorio público
    process.chdir(PUBLIC_REPO_PATH);
    
    // Crear directorio releases si no existe
    const releasesDir = path.join(PUBLIC_REPO_PATH, 'releases');
    if (!fs.existsSync(releasesDir)) {
      fs.mkdirSync(releasesDir, { recursive: true });
    }
    
    // Copiar los artefactos
    console.log('📄 Copiando artefactos...');
    const artifacts = fs.readdirSync(ARTIFACTS_PATH)
      .filter(file => !file.endsWith('.pdb') && !file.endsWith('.d'));
      
    if (artifacts.length === 0) {
      throw new Error('No se encontraron artefactos para copiar');
    }
    
    artifacts.forEach(artifact => {
      const source = path.join(ARTIFACTS_PATH, artifact);
      const dest = path.join(releasesDir, artifact);
      fs.copyFileSync(source, dest);
      console.log(`✅ Copiado: ${artifact}`);
    });
    
    // Crear archivo de release info
    const releaseInfo = {
      version,
      date: new Date().toISOString(),
      artifacts: artifacts.map(name => ({ name, path: `releases/${name}` }))
    };
    
    fs.writeFileSync(
      path.join(releasesDir, `release-${version}.json`),
      JSON.stringify(releaseInfo, null, 2)
    );
    
    // Git operations
    console.log('🔄 Actualizando repositorio público...');
    execSync('git add releases/*', { stdio: 'inherit' });
    execSync(`git commit -m "release: v${version}"`, { stdio: 'inherit' });
    execSync(`git tag -a v${version} -m "Release v${version}"`, { stdio: 'inherit' });
    execSync('git push origin main --tags', { stdio: 'inherit' });
    
    console.log(`\n✨ Release v${version} completada!`);
    console.log('📝 Resumen:');
    console.log(`- ${artifacts.length} archivos subidos`);
    console.log(`- Tag v${version} creado`);
    console.log(`- Release info guardada en releases/release-${version}.json`);
    
  } catch (error) {
    console.error('❌ Error al crear release:', error.message);
    throw error;
  }
};

// Función principal
const main = async () => {
  const originalDir = process.cwd();
  
  try {
    const version = getVersion();
    console.log(`\n🚀 Iniciando release v${version}\n`);
    
    // Verificar que el repositorio público existe
    if (!fs.existsSync(PUBLIC_REPO_PATH)) {
      throw new Error('No se encontró el repositorio público. Asegúrate de que esté clonado en el directorio correcto.');
    }
    
    // Construir
    buildApp();
    
    // Crear release
    createRelease(version);
    
    console.log('\n✅ ¡Proceso completado con éxito!');
    console.log('🌐 Visita el repositorio público para ver la release:');
    console.log('   https://github.com/kristiangarcia/luminakraft-launcher-releases/releases\n');
    
  } catch (error) {
    console.error('\n❌ Error en el proceso de release:');
    console.error(error.message);
    process.exit(1);
  } finally {
    // Volver al directorio original
    process.chdir(originalDir);
  }
};

main(); 