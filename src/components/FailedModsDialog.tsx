import React, { useState, useEffect } from 'react';
import { X, ExternalLink, AlertTriangle } from 'lucide-react';

interface FailedMod {
  projectId: number;
  fileId: number;
  fileName?: string;
}

interface ModInfo {
  id: number;
  name: string;
  slug: string;
  links: {
    websiteUrl: string;
  };
}

interface FailedModsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  failedMods: FailedMod[];
}

export const FailedModsDialog: React.FC<FailedModsDialogProps> = ({
  isOpen,
  onClose,
  failedMods
}) => {
  const [modInfos, setModInfos] = useState<ModInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen && failedMods.length > 0) {
      fetchModInfos();
    }
  }, [isOpen, failedMods]);

  const fetchModInfos = async () => {
    setLoading(true);
    setError('');
    
    try {
      const modIds = failedMods.map(mod => mod.projectId);
      
      const response = await fetch('https://api.luminakraft.com/v1/curseforge/mods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          modIds: modIds,
          filterPcOnly: true
        })
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setModInfos(data.data || []);
    } catch (err) {
      console.error('Error fetching mod information:', err);
      setError('No se pudo obtener la información de los mods');
    } finally {
      setLoading(false);
    }
  };

  const handleModClick = (mod: ModInfo, fileId: number) => {
    const url = `${mod.links.websiteUrl}/files/${fileId}`;
    window.open(url, '_blank');
  };

  const getModInfo = (projectId: number): ModInfo | undefined => {
    return modInfos.find(mod => mod.id === projectId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Mods no disponibles
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Los siguientes mods no se pudieron descargar porque no están disponibles para descarga pública. 
            Haz clic en cada mod para ver más detalles en CurseForge:
          </p>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-gray-600 dark:text-gray-300">
                Obteniendo información de los mods...
              </span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {failedMods.map((failedMod, index) => {
                const modInfo = getModInfo(failedMod.projectId);
                
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer"
                    onClick={() => modInfo && handleModClick(modInfo, failedMod.fileId)}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {modInfo ? modInfo.name : `Mod ID: ${failedMod.projectId}`}
                      </div>
                      {failedMod.fileName && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Archivo: {failedMod.fileName}
                        </div>
                      )}
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        ID: {failedMod.projectId} | File ID: {failedMod.fileId}
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400 ml-2" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}; 