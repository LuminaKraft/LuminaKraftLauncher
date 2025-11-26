import { useState, useEffect } from 'react';
import { LauncherProvider, useLauncher } from './contexts/LauncherContext';
import { AnimationProvider, useAnimation } from './contexts/AnimationContext';
import Sidebar from './components/Layout/Sidebar';
import ModpacksPage from './components/Modpacks/ModpacksPage';
import MyModpacksPage from './components/Modpacks/MyModpacksPage';
import PublishModpackForm from './components/Modpacks/PublishModpackForm';
import EditModpackForm from './components/Modpacks/EditModpackForm';
import PublishedModpacksPage from './components/Modpacks/PublishedModpacksPage';
import SettingsPage from './components/Settings/SettingsPage';
import AboutPage from './components/About/AboutPage';
import UpdateDialog from './components/UpdateDialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import LauncherService from './services/launcherService';
import { updateService, UpdateInfo } from './services/updateService';
import './App.css';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import AuthService from './services/authService';
import toast from 'react-hot-toast';

function AppContent() {
  const [activeSection, setActiveSection] = useState('home');
  const [selectedModpackId, setSelectedModpackId] = useState<string | null>(null); // For edit modpack
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [modpacksPageKey, setModpacksPageKey] = useState(0); // Key to force re-render of ModpacksPage
  const { isLoading, error, modpacksData, isAuthenticating, refreshData } = useLauncher();
  const { withDelay } = useAnimation();
  const { t } = useTranslation();
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
    if (!updateInfo || !updateInfo.hasUpdate) return;
    
    try {
      setIsInstallingUpdate(true);
      await updateService.downloadAndInstallUpdate((progress, total) => {
        setUpdateProgress({ current: progress, total });
      });
    } catch (error) {
      console.error('Failed to download and install update:', error);
    } finally {
      setIsInstallingUpdate(false);
    }
  };

  const handleCloseUpdateDialog = () => {
    setShowUpdateDialog(false);
  };

  const handleSectionChange = (newSection: string) => {
    if (newSection === activeSection) {
      // If clicking on the same section (like modpacks button while viewing modpack details),
      // reset the ModpacksPage to go back to the main list
      if (newSection === 'home') {
        setModpacksPageKey(prev => prev + 1);
      }
      return;
    }
    
    // Check for unsaved changes before allowing navigation
    if ((window as any).blockNavigation) {
      const shouldBlock = (window as any).blockNavigation();
      if (shouldBlock === false) {
        return; // Block navigation
      }
    }
    
    setIsTransitioning(true);
    withDelay(() => {
      setActiveSection(newSection);
      // Reset modpacks page when navigating to it and ensure data is loaded
      if (newSection === 'home') {
        setModpacksPageKey(prev => prev + 1);
        // If no launcher data is available, try to refresh
        if (!modpacksData && !isLoading) {
          refreshData();
        }
      }
      withDelay(() => {
        setIsTransitioning(false);
      }, 50);
    }, 150);
  };

  const handleModpackNavigation = (section: string, modpackId?: string) => {
    if (section === 'edit-modpack' && modpackId) {
      setSelectedModpackId(modpackId);
    }
    handleSectionChange(section);
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'home':
        return <ModpacksPage key={modpacksPageKey} />;
      case 'my-modpacks':
        return <MyModpacksPage />;
      case 'published-modpacks':
        return <PublishedModpacksPage onNavigate={handleModpackNavigation} />;
      case 'publish-modpack':
        return <PublishModpackForm onNavigate={handleModpackNavigation} />;
      case 'edit-modpack':
        return selectedModpackId ? (
          <EditModpackForm modpackId={selectedModpackId} onNavigate={handleModpackNavigation} />
        ) : (
          <PublishedModpacksPage onNavigate={handleModpackNavigation} />
        );
      case 'settings':
        return <SettingsPage onNavigationBlocked={() => {}} />;
      case 'about':
        return <AboutPage />;
      default:
        return <ModpacksPage key={modpacksPageKey} />;
    }
  };

  // Mostrar pantalla de carga inicial solo si no hay datos y está cargando
  if (isLoading && !modpacksData) {
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
  if (error && !modpacksData && !isLoading) {
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
      <Sidebar 
        activeSection={activeSection} 
        onSectionChange={handleSectionChange} 
      />
      <main className="flex-1 overflow-auto">
        <div
          className={`h-full transition-all duration-300 ease-out ${
            isTransitioning
              ? 'opacity-0 scale-95 translate-y-2'
              : 'opacity-100 scale-100 translate-y-0'
          }`}
        >
          {renderContent()}
        </div>
      </main>

      {/* Update Dialog */}
      {showUpdateDialog && updateInfo && (
        <UpdateDialog
          updateInfo={updateInfo}
          onClose={handleCloseUpdateDialog}
          onDownload={handleDownloadUpdate}
          isDownloading={isInstallingUpdate}
          downloadProgress={updateProgress}
        />
      )}
      <Toaster
        position="top-right"
        reverseOrder={false}
        toastOptions={{
          style: {
            background: '#1f2937', // dark-800
            color: '#ffffff',
          },
          success: {
            iconTheme: {
              primary: '#22c55e', // green-500
              secondary: '#1f2937',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444', // red-500
              secondary: '#1f2937',
            },
          },
        }}
      />

      {/* Global Authentication Overlay */}
      {isAuthenticating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] pointer-events-auto">
          <div className="bg-dark-800 rounded-lg p-6 max-w-md w-full mx-4 border border-dark-700">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lumina-500 mx-auto mb-4"></div>
              <h3 className="text-white text-lg font-semibold mb-2">
                {t('auth.signing')}
              </h3>
              <p className="text-dark-300 text-sm">
                {t('auth.microsoftDescription')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <LauncherProvider>
      <AnimationProvider>
        <AppContent />
      </AnimationProvider>
    </LauncherProvider>
  );
}

export default App;
