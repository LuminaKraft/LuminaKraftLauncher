import React from 'react';
import { Download, ExternalLink, Heart, Globe } from 'lucide-react';
import { useLauncher } from '../../contexts/LauncherContext';

const AboutPage: React.FC = () => {
  // Temporalmente removemos hasUpdate y updateUrl hasta implementar la funcionalidad
  const hasUpdate = false;
  const updateUrl = null;

  const handleDownloadUpdate = () => {
    if (updateUrl) {
      window.open(updateUrl, '_blank');
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-white text-2xl font-bold mb-2">Acerca de</h1>
          <p className="text-dark-400">
            Información sobre el LuminaKraft Launcher
          </p>
        </div>

        <div className="max-w-4xl space-y-8">
          {/* Launcher Info */}
          <div className="card">
            <div className="flex items-start space-x-6">
              <div className="w-20 h-20 bg-gradient-to-br from-lumina-500 to-lumina-700 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-2xl">L</span>
              </div>
              
              <div className="flex-1">
                <h2 className="text-white text-2xl font-bold mb-2">LuminaKraft Launcher</h2>
                <p className="text-dark-300 mb-4">
                  Un lanzador de modpacks personalizado para la comunidad de LuminaKraft Studios. 
                  Diseñado para hacer que la instalación y gestión de modpacks sea simple y eficiente.
                </p>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-dark-400">Versión:</span>
                    <p className="text-white font-mono">1.0.0</p>
                  </div>
                  <div>
                    <span className="text-dark-400">Tecnologías:</span>
                    <p className="text-white">Tauri + React + TypeScript</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Update Section */}
          {hasUpdate && (
            <div className="card border-yellow-600/30 bg-yellow-600/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-yellow-400 font-semibold text-lg mb-2">
                    Nueva actualización disponible
                  </h3>
                  <p className="text-yellow-300">
                    Hay una nueva versión del launcher disponible para descargar.
                  </p>
                </div>
                <button
                  onClick={handleDownloadUpdate}
                  className="btn-warning"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar
                </button>
              </div>
            </div>
          )}

          {/* Features */}
          <div className="card">
            <h3 className="text-white font-semibold text-xl mb-4">Características</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-lumina-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">Instalación automática</p>
                    <p className="text-dark-400 text-sm">Descarga e instala modpacks automáticamente</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-lumina-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">Actualizaciones automáticas</p>
                    <p className="text-dark-400 text-sm">Mantén tus modpacks siempre actualizados</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-lumina-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">Gestión de instancias</p>
                    <p className="text-dark-400 text-sm">Cada modpack en su propia carpeta</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-lumina-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">Compatible offline</p>
                    <p className="text-dark-400 text-sm">Funciona con cuentas premium y no premium</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-lumina-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">Multiplataforma</p>
                    <p className="text-dark-400 text-sm">Windows, macOS y Linux</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-lumina-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">Interfaz moderna</p>
                    <p className="text-dark-400 text-sm">Diseño intuitivo y fácil de usar</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Credits */}
          <div className="card">
            <h3 className="text-white font-semibold text-xl mb-4">Créditos</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-lumina-400 font-medium mb-2">Desarrollado con</h4>
                <div className="flex items-center space-x-2 text-dark-300">
                  <Heart className="w-4 h-4 text-red-500" />
                  <span>por el equipo de LuminaKraft Studios</span>
                </div>
              </div>
              
              <div>
                <h4 className="text-lumina-400 font-medium mb-2">Tecnologías utilizadas</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-dark-300">
                  <span>• Tauri (Framework)</span>
                  <span>• React (UI)</span>
                  <span>• TypeScript (Lenguaje)</span>
                  <span>• Tailwind CSS (Estilos)</span>
                  <span>• Rust (Backend)</span>
                  <span>• Vite (Build Tool)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="card">
            <h3 className="text-white font-semibold text-xl mb-4">Enlaces</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <a
                href="https://luminakraft.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-3 p-3 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors group"
              >
                <Globe className="w-5 h-5 text-lumina-500" />
                <div className="flex-1">
                  <p className="text-white font-medium group-hover:text-lumina-400 transition-colors">
                    Sitio Web Oficial
                  </p>
                  <p className="text-dark-400 text-sm">luminakraft.com</p>
                </div>
                <ExternalLink className="w-4 h-4 text-dark-400" />
              </a>
              
              <a
                href="https://discord.gg/UJZRrcUFMj"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-3 p-3 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors group"
              >
                <div className="w-5 h-5 bg-indigo-500 rounded flex items-center justify-center">
                  <span className="text-white text-xs font-bold">D</span>
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium group-hover:text-lumina-400 transition-colors">
                    Discord
                  </p>
                  <p className="text-dark-400 text-sm">Únete a nuestra comunidad</p>
                </div>
                <ExternalLink className="w-4 h-4 text-dark-400" />
              </a>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center py-8">
            <p className="text-dark-400 text-sm">
              © 2024 LuminaKraft Studios. Todos los derechos reservados.
            </p>
            <p className="text-dark-500 text-xs mt-1">
              Minecraft es una marca registrada de Mojang Studios
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage; 