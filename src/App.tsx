import { useState, useEffect } from 'react';
import { relaunch } from '@tauri-apps/plugin-process';
import { LauncherProvider, useLauncher } from './contexts/LauncherContext';
import { AnimationProvider, useAnimation } from './contexts/AnimationContext';
import Sidebar from './components/Layout/Sidebar';
import HomePage from './components/Home/HomePage';
import ModpacksPage from './components/Modpacks/ModpacksPage';
import MyModpacksPage from './components/Modpacks/MyModpacksPage';
import PublishModpackForm from './components/Modpacks/PublishModpackForm';
import EditModpackForm from './components/Modpacks/EditModpackForm';
import PublishedModpacksPage from './components/Modpacks/PublishedModpacksPage';
import SettingsPage from './components/Settings/SettingsPage';
import AboutPage from './components/About/AboutPage';
import AccountPage from './components/Account/AccountPage';
import UpdateDialog from './components/UpdateDialog';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import LauncherService from './services/launcherService';
import { updateService, UpdateInfo } from './services/updateService';
import './App.css';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

function AppContent() {
  const [activeSection, setActiveSection] = useState('home');
  const [selectedModpackId, setSelectedModpackId] = useState<string | null>(() => {
    // Restore selected modpack ID for edit-modpack from localStorage
    try {
      return localStorage.getItem('editModpackFormModpackId') || null;
    } catch {
      return null;
    }
  });
  const [lastPublishedSection, setLastPublishedSection] = useState<string>(() => {
    // If there's a saved edit modpack, remember we were in edit-modpack
    try {
      const savedModpackId = localStorage.getItem('editModpackFormModpackId');
      if (savedModpackId) {
        return 'edit-modpack';
      }
      const savedPublishStep = localStorage.getItem('publishModpackFormStep');
      if (savedPublishStep && parseInt(savedPublishStep, 10) > 1) {
        return 'publish-modpack';
      }
    } catch {
      // ignore
    }
    return 'published-modpacks';
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [modpacksPageKey, setModpacksPageKey] = useState(0); // Key to force re-render of ModpacksPage
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
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

            // Check if auto-update is enabled (default: true)
            const autoUpdateEnabled = launcherService.getUserSettings().autoUpdate !== false;

            // Auto-install stable releases if enabled, always show dialog for prereleases
            if (!update.isPrerelease && autoUpdateEnabled) {
              console.log('Auto-installing stable update...');
              try {
                await updateService.downloadAndInstallUpdate((progress, total) => {
                  setUpdateProgress({ current: progress, total });
                });
              } catch (error) {
                console.error('Auto-install failed, showing dialog instead:', error);
                setShowUpdateDialog(true);
              }
            } else {
              // Show dialog for prereleases or if auto-update is disabled
              console.log(update.isPrerelease ? 'Prerelease detected, showing dialog for manual approval' : 'Auto-update disabled, showing dialog');
              setShowUpdateDialog(true);
            }
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

    // Listen for restart failures
    const handleRestartFailed = () => {
      setShowRestartModal(true);
    };

    updateService.on('restart-failed', handleRestartFailed);

    // Cleanup on unmount
    return () => {
      updateService.stopAutomaticChecking();
      updateService.off('restart-failed', handleRestartFailed);
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

  const handleManualRestart = async () => {
    setIsRestarting(true);
    try {
      await relaunch();
    } catch (error) {
      console.error('Failed to restart application:', error);
      setIsRestarting(false);
    }
  };

  const handleSectionChange = (newSection: string) => {
    if (newSection === activeSection) {
      // If clicking on the same section (like modpacks button while viewing modpack details),
      // reset the ModpacksPage to go back to the main list
      if (newSection === 'home') {
        setModpacksPageKey(prev => prev + 1);
      }
      if (newSection === 'explore') {
        setSelectedModpackId(null);
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

    // If clicking on published-modpacks, navigate to the last remembered sub-section
    if (newSection === 'published-modpacks') {
      // If already in a sub-section, stay there
      if (activeSection === 'publish-modpack' || activeSection === 'edit-modpack') {
        return;
      }
      // Otherwise, navigate to the last remembered sub-section
      setIsTransitioning(true);
      withDelay(() => {
        setActiveSection(lastPublishedSection);
        withDelay(() => {
          setIsTransitioning(false);
        }, 50);
      }, 150);
      return;
    }

    // Remember the current section if leaving published-modpacks area
    if (activeSection === 'publish-modpack' || activeSection === 'edit-modpack' || activeSection === 'published-modpacks') {
      setLastPublishedSection(activeSection);
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
      // Clear selected modpack when navigating to explore/my-modpacks from sidebar
      // This ensures we show the list view, not a specific modpack
      if (newSection === 'explore' || newSection === 'my-modpacks') {
        setSelectedModpackId(null);
      }
      withDelay(() => {
        setIsTransitioning(false);
      }, 50);
    }, 150);
  };

  const handleModpackNavigation = (section: string, modpackId?: string) => {
    // Check for unsaved changes before allowing navigation
    if ((window as any).blockNavigation) {
      const shouldBlock = (window as any).blockNavigation();
      if (shouldBlock === false) {
        return; // Block navigation
      }
    }

    setIsTransitioning(true);
    withDelay(() => {
      // Clear or set the modpackId based on what was passed
      setSelectedModpackId(modpackId || null);
      setActiveSection(section);

      // Remember if navigating to a published-modpacks sub-section
      if (section === 'publish-modpack' || section === 'edit-modpack' || section === 'published-modpacks') {
        setLastPublishedSection(section);
      }

      withDelay(() => {
        setIsTransitioning(false);
      }, 50);
    }, 150);
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'home':
        return <HomePage onNavigate={handleModpackNavigation} />;
      case 'explore':
        return <ModpacksPage key={modpacksPageKey} initialModpackId={selectedModpackId || undefined} onNavigate={handleModpackNavigation} />;
      case 'my-modpacks':
        return <MyModpacksPage initialModpackId={selectedModpackId || undefined} onNavigate={handleModpackNavigation} />;
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
      case 'account':
        return <AccountPage />;
      case 'settings':
        return <SettingsPage onNavigationBlocked={() => { }} />;
      case 'about':
        return <AboutPage />;
      default:
        return <HomePage onNavigate={handleSectionChange} />;
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
          className={`h-full transition-all duration-200 ease-out ${isTransitioning
            ? 'opacity-0 scale-95 translate-y-2'
            : 'opacity-100 scale-100 translate-y-0'
            }`}
        >
          {renderContent()}
        </div>
      </main>

      {/* Restart Modal */}
      {showRestartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-8">
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                <RefreshCw className="w-6 h-6 text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-white text-center">
                {t('update.updateReady')}
              </h2>
              <p className="text-gray-400 text-center text-sm">
                {t('update.restartToApply')}
              </p>
              <div className="flex gap-3 w-full mt-2">
                <button
                  onClick={() => setShowRestartModal(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors"
                >
                  {t('update.restartLater')}
                </button>
                <button
                  onClick={handleManualRestart}
                  disabled={isRestarting}
                  className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isRestarting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      {t('update.restarting')}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      {t('update.restartNow')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
