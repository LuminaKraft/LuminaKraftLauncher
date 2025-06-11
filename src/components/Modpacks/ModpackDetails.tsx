import React from 'react';
import { ArrowLeft, Calendar, Package, Cpu, HardDrive } from 'lucide-react';
import type { Modpack, ModpackState } from '../../types/launcher';
import ModpackCard from './ModpackCard';

interface ModpackDetailsProps {
  modpack: Modpack;
  state: ModpackState;
  onBack: () => void;
}

const ModpackDetails: React.FC<ModpackDetailsProps> = ({ modpack, state, onBack }) => {
  const formatChangelog = (changelog: string) => {
    return changelog.split('\n').map((line, index) => {
      if (line.trim() === '') return <br key={index} />;
      
      // Check if line starts with version (e.g., "v1.2.3:")
      const versionMatch = line.match(/^(v?\d+\.\d+\.\d+):?\s*(.*)/);
      if (versionMatch) {
        return (
          <div key={index} className="mb-3">
            <h4 className="text-lumina-400 font-semibold flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>{versionMatch[1]}</span>
            </h4>
            {versionMatch[2] && (
              <p className="text-dark-300 mt-1 ml-6">{versionMatch[2]}</p>
            )}
          </div>
        );
      }
      
      // Regular changelog line
      return (
        <p key={index} className="text-dark-300 mb-2 ml-6">
          {line}
        </p>
      );
    });
  };

  const getModloaderDisplayName = (modloader: string) => {
    switch (modloader.toLowerCase()) {
      case 'forge':
        return 'Minecraft Forge';
      case 'fabric':
        return 'Fabric';
      case 'quilt':
        return 'Quilt';
      case 'neoforge':
        return 'NeoForge';
      default:
        return modloader;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-dark-700">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-dark-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a la lista</span>
        </button>
        
        <div className="flex items-start space-x-6">
          <div className="w-24 h-24 rounded-lg overflow-hidden bg-dark-700 flex-shrink-0">
            <img
              src={modpack.urlIcono}
              alt={modpack.nombre}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHZpZXdCb3g9IjAgMCA5NiA5NiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9Ijk2IiBoZWlnaHQ9Ijk2IiBmaWxsPSIjMzc0MTUxIi8+CjxwYXRoIGQ9Ik0zNiAzNkg2MFY2MEgzNlYzNloiIGZpbGw9IiM2Mzc1ODMiLz4KPC9zdmc+';
              }}
            />
          </div>
          
          <div className="flex-1">
            <h1 className="text-white text-3xl font-bold mb-2">{modpack.nombre}</h1>
            <p className="text-dark-300 text-lg mb-4">{modpack.descripcion}</p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center space-x-2 text-dark-400">
                <Package className="w-4 h-4" />
                <span>v{modpack.version}</span>
              </div>
              <div className="flex items-center space-x-2 text-dark-400">
                <HardDrive className="w-4 h-4" />
                <span>Minecraft {modpack.minecraftVersion}</span>
              </div>
              <div className="flex items-center space-x-2 text-dark-400">
                <Cpu className="w-4 h-4" />
                <span>{getModloaderDisplayName(modpack.modloader)}</span>
              </div>
              <div className="text-dark-400">
                <span>{modpack.modloader} {modpack.modloaderVersion}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
          {/* Action Card */}
          <div className="lg:col-span-1">
            <div className="card">
              <h3 className="text-white font-semibold text-lg mb-4">Acciones</h3>
              <ModpackCard
                modpack={modpack}
                state={state}
                onSelect={() => {}} // No action needed in details view
              />
            </div>

            {/* System Requirements */}
            <div className="card mt-6">
              <h3 className="text-white font-semibold text-lg mb-4">Requerimientos</h3>
              <div className="space-y-3">
                <div>
                  <span className="text-dark-400 text-sm">RAM Recomendada:</span>
                  <p className="text-white">4 GB mínimo, 8 GB recomendado</p>
                </div>
                <div>
                  <span className="text-dark-400 text-sm">JVM Args Recomendados:</span>
                  <p className="text-white text-xs bg-dark-700 p-2 rounded mt-1 font-mono break-all">
                    {modpack.jvmArgsRecomendados}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Changelog */}
          <div className="lg:col-span-2">
            <div className="card">
              <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
                <Calendar className="w-5 h-5" />
                <span>Historial de Cambios</span>
              </h3>
              <div className="max-h-96 overflow-y-auto">
                {modpack.changelog ? (
                  <div className="space-y-2">
                    {formatChangelog(modpack.changelog)}
                  </div>
                ) : (
                  <p className="text-dark-400 italic">
                    No hay información de cambios disponible.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModpackDetails; 