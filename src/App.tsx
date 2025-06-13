import { useState, useEffect } from 'react';
import { LauncherProvider, useLauncher } from './contexts/LauncherContext';
import Sidebar from './components/Layout/Sidebar';
import ModpacksPage from './components/Modpacks/ModpacksPage';
import SettingsPage from './components/Settings/SettingsPage';
import AboutPage from './components/About/AboutPage';
import TauriWarning from './components/TauriWarning';
import UpdateDialog from './components/UpdateDialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import LauncherService from './services/launcherService';
import { updateService, UpdateInfo } from './services/updateService';
import './App.css';

function AppContent() {
  const [activeSection, setActiveSection] = useState('home');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const { isLoading, error, launcherData } = useLauncher();
  const launcherService = LauncherService.getInstance();


  useEffect(() => {
    const checkForUpdatesOnStartup = async () => {
      if (launcherService.isTauriAvailable()) {
        try {
          console.log('Checking for updates on startup...');
          const update = await updateService.checkForUpdates();
          
          if (update.hasUpdate) {
            console.log('Update available:', update);
            setUpdateInfo(update);
            setShowUpdateDialog(true);
          } else {
            console.log('No updates available');
          }
        } catch (error) {
          console.error('Failed to check for updates on startup:', error);
        }
        
        // Start automatic checking for future updates
        updateService.startAutomaticChecking();
      }
    };

    checkForUpdatesOnStartup();

    // Cleanup on unmount
    return () => {
      updateService.stopAutomaticChecking();
    };
  }, [updateService, launcherService]);

  const handleDownloadUpdate = async () => {
    if (!updateInfo || !updateInfo.downloadUrl) return;
    
    try {
      setIsInstallingUpdate(true);
      await updateService.downloadUpdate(updateInfo.downloadUrl);
    } catch (error) {
      console.error('Failed to download update:', error);
    } finally {
      setIsInstallingUpdate(false);
    }
  };

  const handleCloseUpdateDialog = () => {
    setShowUpdateDialog(false);
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'home':
        return <ModpacksPage />;
      case 'settings':
        return <SettingsPage />;
      case 'about':
        return <AboutPage />;
      default:
        return <ModpacksPage />;
    }
  };

  // Mostrar pantalla de carga inicial solo si no hay datos y está cargando
  if (isLoading && !launcherData) {
    return (
      <div className="flex h-screen bg-dark-900 text-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-lumina-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Cargando LuminaKraft Launcher</h2>
            <p className="text-dark-400">Conectando con los servidores...</p>
          </div>
        </div>
      </div>
    );
  }

  // Mostrar error crítico solo si no hay datos en absoluto
  if (error && !launcherData && !isLoading) {
    return (
      <div className="flex h-screen bg-dark-900 text-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error de Conexión</h2>
            <p className="text-dark-400 mb-4">{error}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="btn-primary"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-dark-900 text-white">
      {/* Show warning if not running in Tauri context */}
      {!launcherService.isTauriAvailable() && <TauriWarning />}
      
      <Sidebar 
        activeSection={activeSection} 
        onSectionChange={setActiveSection} 
      />
      <main className={`flex-1 overflow-hidden ${!launcherService.isTauriAvailable() ? 'pt-16' : ''}`}>
        {renderContent()}
      </main>

      {/* Update Dialog */}
      {showUpdateDialog && updateInfo && (
        <UpdateDialog
          updateInfo={updateInfo}
          onClose={handleCloseUpdateDialog}
          onDownload={handleDownloadUpdate}
          isDownloading={isInstallingUpdate}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <LauncherProvider>
      <AppContent />
    </LauncherProvider>
  );
}

export default App;
