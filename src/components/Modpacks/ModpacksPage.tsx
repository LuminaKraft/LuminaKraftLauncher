import React, { useState } from 'react';
import { Search, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { useLauncher } from '../../contexts/LauncherContext';
import ModpackCard from './ModpackCard';
import ModpackDetails from './ModpackDetails';
import type { Modpack } from '../../types/launcher';

const ModpacksPage: React.FC = () => {
  const { 
    launcherData, 
    modpackStates, 
    isLoading, 
    error, 
    refreshLauncherData 
  } = useLauncher();
  
  const [selectedModpack, setSelectedModpack] = useState<Modpack | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredModpacks = launcherData?.modpacks.filter(modpack =>
    modpack.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    modpack.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (isLoading && !launcherData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-lumina-500 mx-auto mb-4" />
          <p className="text-white">Cargando modpacks...</p>
          <p className="text-dark-400 text-sm mt-1">Obteniendo datos del servidor</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-white text-xl font-semibold mb-2">Error al cargar</h2>
          <p className="text-dark-300 mb-4">{error}</p>
          <button
            onClick={refreshLauncherData}
            className="btn-primary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (selectedModpack) {
    const modpackState = modpackStates[selectedModpack.id] || { status: 'not_installed' };
    return (
      <ModpackDetails
        modpack={selectedModpack}
        state={modpackState}
        onBack={() => setSelectedModpack(null)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-dark-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-white text-2xl font-bold">Modpacks</h1>
            <p className="text-dark-400 mt-1">
              {filteredModpacks.length} modpack{filteredModpacks.length !== 1 ? 's' : ''} disponible{filteredModpacks.length !== 1 ? 's' : ''}
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" />
              <input
                type="text"
                placeholder="Buscar modpacks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10 w-64"
              />
            </div>
            
            <button
              onClick={refreshLauncherData}
              disabled={isLoading}
              className="btn-secondary"
              title="Actualizar lista de modpacks"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {filteredModpacks.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-dark-700 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-dark-400" />
              </div>
              <h2 className="text-white text-xl font-semibold mb-2">
                {searchTerm ? 'No se encontraron modpacks' : 'No hay modpacks disponibles'}
              </h2>
              <p className="text-dark-400">
                {searchTerm 
                  ? 'Intenta con términos de búsqueda diferentes' 
                  : 'Verifica tu conexión e intenta actualizar la lista'
                }
              </p>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="btn-primary mt-4"
                >
                  Limpiar búsqueda
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredModpacks.map((modpack) => {
                const modpackState = modpackStates[modpack.id] || { status: 'not_installed' };
                
                return (
                  <ModpackCard
                    key={modpack.id}
                    modpack={modpack}
                    state={modpackState}
                    onSelect={() => setSelectedModpack(modpack)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModpacksPage; 