import React, { useState, useEffect } from 'react';
import { User, HardDrive, Coffee, Globe, Save, FolderOpen, CheckCircle, Wifi, WifiOff, RefreshCw, Trash2, Server } from 'lucide-react';
import { useLauncher } from '../../contexts/LauncherContext';
import LauncherService from '../../services/launcherService';

const SettingsPage: React.FC = () => {
  const { userSettings, updateUserSettings } = useLauncher();
  
  const [formData, setFormData] = useState(userSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const [savedNotification, setSavedNotification] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [apiInfo, setApiInfo] = useState<any>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  useEffect(() => {
    setFormData(userSettings);
  }, [userSettings]);

  useEffect(() => {
    const isDifferent = JSON.stringify(formData) !== JSON.stringify(userSettings);
    setHasChanges(isDifferent);
  }, [formData, userSettings]);

  useEffect(() => {
    checkAPIStatus();
    fetchAPIInfo();
  }, []);

  const checkAPIStatus = async () => {
    setApiStatus('checking');
    try {
      const isHealthy = await LauncherService.getInstance().checkAPIHealth();
      setApiStatus(isHealthy ? 'online' : 'offline');
    } catch (error) {
      setApiStatus('offline');
    }
  };

  const fetchAPIInfo = async () => {
    try {
      const info = await LauncherService.getInstance().getAPIInfo();
      setApiInfo(info);
    } catch (error) {
      console.error('Error fetching API info:', error);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = () => {
    updateUserSettings(formData);
    setHasChanges(false);
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 3000);
  };

  const handleSelectJavaPath = async () => {
    try {
      // In a real implementation, this would open a file dialog
      // For now, we'll show a placeholder
      console.log('Open file dialog for Java path');
    } catch (error) {
      console.error('Error selecting Java path:', error);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    await checkAPIStatus();
    await fetchAPIInfo();
    setIsTestingConnection(false);
  };

  const handleClearCache = () => {
    LauncherService.getInstance().clearCache();
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 3000);
  };

  const ramOptions = [
    { value: 2, label: '2 GB' },
    { value: 4, label: '4 GB' },
    { value: 6, label: '6 GB' },
    { value: 8, label: '8 GB' },
    { value: 12, label: '12 GB' },
    { value: 16, label: '16 GB' },
    { value: 32, label: '32 GB' }
  ];

  const getStatusIcon = () => {
    switch (apiStatus) {
      case 'checking':
        return <RefreshCw className="w-5 h-5 text-yellow-500 animate-spin" />;
      case 'online':
        return <Wifi className="w-5 h-5 text-green-500" />;
      case 'offline':
        return <WifiOff className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (apiStatus) {
      case 'checking':
        return 'Verificando...';
      case 'online':
        return 'Conectado';
      case 'offline':
        return 'Sin conexión';
    }
  };

  const getStatusColor = () => {
    switch (apiStatus) {
      case 'checking':
        return 'text-yellow-400';
      case 'online':
        return 'text-green-400';
      case 'offline':
        return 'text-red-400';
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-white text-2xl font-bold mb-2">Configuración</h1>
          <p className="text-dark-400">
            Personaliza tu experiencia con el LuminaKraft Launcher
          </p>
        </div>

        {/* Success notification */}
        {savedNotification && (
          <div className="mb-6 p-4 bg-green-600/20 border border-green-600/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-400 font-medium">
                Operación completada exitosamente
              </span>
            </div>
          </div>
        )}

        <div className="max-w-4xl space-y-8">
          {/* API Status */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Server className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">Estado de la API</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-dark-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getStatusIcon()}
                  <div>
                    <p className={`font-medium ${getStatusColor()}`}>
                      {getStatusText()}
                    </p>
                    <p className="text-dark-400 text-sm">
                      {apiInfo?.name || 'LuminaKraft Launcher API'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                  className="btn-secondary"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isTestingConnection ? 'animate-spin' : ''}`} />
                  Probar conexión
                </button>
              </div>

              {apiInfo && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-dark-700 rounded-lg">
                    <p className="text-dark-300 text-sm font-medium mb-1">Versión de la API</p>
                    <p className="text-white">{apiInfo.version}</p>
                  </div>
                  <div className="p-4 bg-dark-700 rounded-lg">
                    <p className="text-dark-300 text-sm font-medium mb-1">Descripción</p>
                    <p className="text-white text-sm">{apiInfo.description}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-4">
                <button
                  onClick={handleClearCache}
                  className="btn-secondary"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpiar caché
                </button>
                <p className="text-dark-400 text-sm">
                  Limpia los datos almacenados localmente para forzar una actualización
                </p>
              </div>
            </div>
          </div>

          {/* User Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <User className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">Usuario</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-dark-300 text-sm font-medium mb-2">
                  Nombre de usuario
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder="Introduce tu nombre de usuario"
                  className="input-field w-full max-w-md"
                />
                <p className="text-dark-400 text-xs mt-1">
                  Este nombre se usará para el modo offline de Minecraft
                </p>
              </div>
            </div>
          </div>

          {/* Performance Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <HardDrive className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">Rendimiento</h2>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-dark-300 text-sm font-medium mb-2">
                  Memoria RAM asignada
                </label>
                <div className="flex items-center space-x-4">
                  <select
                    value={formData.allocatedRam}
                    onChange={(e) => handleInputChange('allocatedRam', parseInt(e.target.value))}
                    className="input-field"
                  >
                    {ramOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="text-dark-400 text-sm">
                    <p>Recomendado: 4-8 GB para la mayoría de modpacks</p>
                  </div>
                </div>
                <div className="mt-3 p-3 bg-dark-700 rounded-lg">
                  <p className="text-dark-300 text-sm">
                    <strong>Nota:</strong> Asignar demasiada RAM puede ser contraproducente. 
                    La mayoría de modpacks funcionan bien con 4-8 GB.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Java Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Coffee className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">Java</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-dark-300 text-sm font-medium mb-2">
                  Ruta de Java (Opcional)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={formData.javaPath || ''}
                    onChange={(e) => handleInputChange('javaPath', e.target.value)}
                    placeholder="Automático (se detectará Java del sistema)"
                    className="input-field flex-1"
                  />
                  <button
                    onClick={handleSelectJavaPath}
                    className="btn-secondary"
                    title="Seleccionar archivo"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-dark-400 text-xs mt-1">
                  Deja vacío para usar la detección automática de Java
                </p>
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Globe className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">Avanzado</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-dark-300 text-sm font-medium mb-2">
                  URL de datos del launcher
                </label>
                <input
                  type="url"
                  value={formData.launcherDataUrl}
                  onChange={(e) => handleInputChange('launcherDataUrl', e.target.value)}
                  placeholder="https://api.luminakraft.com/v1/launcher_data.json"
                  className="input-field w-full"
                />
                <p className="text-dark-400 text-xs mt-1">
                  URL donde se obtienen los datos de modpacks disponibles
                </p>
              </div>
            </div>
          </div>

          {/* Save Button */}
          {hasChanges && (
            <div className="sticky bottom-0 bg-dark-900 border-t border-dark-700 p-4 -mx-6">
              <div className="flex justify-between items-center">
                <p className="text-dark-400 text-sm">
                  Tienes cambios sin guardar
                </p>
                <button
                  onClick={handleSave}
                  className="btn-primary"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Guardar cambios
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage; 