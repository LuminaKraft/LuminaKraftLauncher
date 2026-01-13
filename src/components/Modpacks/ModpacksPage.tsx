import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, RefreshCw, AlertCircle } from 'lucide-react';
import { useLauncher } from '../../contexts/LauncherContext';
import { useAnimation } from '../../contexts/AnimationContext';
import ModpackCard from './ModpackCard';
import ModpackDetailsRefactored from './ModpackDetailsRefactored';
import LauncherService from '../../services/launcherService';

import type { Modpack } from '../../types/launcher';

interface ModpacksPageProps {
  initialModpackId?: string;
  onNavigate?: (_section: string, _modpackId?: string) => void;
}

const ModpacksPage: React.FC<ModpacksPageProps> = ({ initialModpackId, onNavigate }) => {
  const { t } = useTranslation();
  const { getAnimationClass, getAnimationStyle, withDelay } = useAnimation();
  const {
    modpacksData,
    modpackStates,
    isLoading,
    error,
    refreshData
  } = useLauncher();

  const [selectedModpack, setSelectedModpack] = useState<Modpack | null>(null);
  const [selectedModpackDetails, setSelectedModpackDetails] = useState<Modpack | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [isRefreshAnimating, setIsRefreshAnimating] = useState(false);
  const [showingDetails, setShowingDetails] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Handle initial modpack selection from navigation
  React.useEffect(() => {
    if (initialModpackId && modpacksData) {
      const modpack = modpacksData.modpacks.find(m => m.id === initialModpackId);
      if (modpack) {
        handleModpackSelect(modpack);
      }
    }
  }, [initialModpackId, modpacksData]);

  // Check if any modpack is currently installing/updating
  const hasActiveInstallation = Object.values(modpackStates).some(state =>
    ['installing', 'updating', 'launching'].includes(state.status)
  );

  const filteredModpacks = modpacksData?.modpacks.filter(modpack =>
    modpack.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleModpackSelect = (modpack: Modpack) => {
    setIsTransitioning(true);
    setDetailsLoading(true);
    withDelay(async () => {
      setSelectedModpack(modpack);
      setShowingDetails(true);
      try {
        const launcherService = LauncherService.getInstance();
        const details = await launcherService.fetchModpackDetails(modpack.id);
        setSelectedModpackDetails(details);
      } catch {
        setSelectedModpackDetails(null);
      } finally {
        setDetailsLoading(false);
      }
      withDelay(() => {
        setIsTransitioning(false);
      }, 50);
    }, 50);
  };

  const handleBackToList = () => {
    setIsTransitioning(true);
    setShowingDetails(false);

    withDelay(() => {
      setSelectedModpack(null);
      setIsTransitioning(false);
    }, 50);
  };

  const handleRefresh = async () => {
    setIsRefreshAnimating(true);
    try {
      // Limpia caché completa antes de refrescar
      const launcherService = LauncherService.getInstance();
      launcherService.clearCache();
      await refreshData();
    } finally {
      withDelay(() => {
        setIsRefreshAnimating(false);
      }, 100);
    }
  };

  // Show overlay loader when loading initial data
  const showLoadingOverlay = isLoading && !modpacksData;

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-white text-xl font-semibold mb-2">{t('modpacks.errorLoading')}</h2>
          <p className="text-dark-300 mb-4">{error}</p>
          <button
            onClick={refreshData}
            className="btn-primary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('modpacks.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (selectedModpack) {
    const modpackState = modpackStates[selectedModpack.id] || {
      installed: false,
      downloading: false,
      progress: { percentage: 0 },
      status: 'not_installed' as const
    };
    return (
      <div className={`h-full w-full ${getAnimationClass('transition-opacity duration-75 ease-out', '')
        } ${showingDetails && !isTransitioning
          ? 'opacity-100'
          : 'opacity-0'
        }`}
        style={getAnimationStyle({})}
      >
        {detailsLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-white text-lg">{t('modpacks.loadingDetails')}</div>
          </div>
        ) : (
          <ModpackDetailsRefactored
            modpack={selectedModpackDetails || selectedModpack}
            state={modpackState}
            onBack={handleBackToList}
            isReadOnly={true}
            onNavigate={onNavigate}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${getAnimationClass('transition-opacity duration-75 ease-out', '')
      } ${isTransitioning
        ? 'opacity-0'
        : 'opacity-100'
      }`}
      style={getAnimationStyle({})}
    >
      {/* Header */}
      <div
        className="p-6 border-b border-dark-700"
        style={{
          animation: 'fadeInUp 0.15s ease-out',
          ...getAnimationStyle({})
        }}
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-white text-2xl font-bold bg-gradient-to-r from-lumina-400 to-lumina-300 bg-clip-text text-transparent">
              {t('modpacks.title')}
            </h1>
            <p className="text-dark-400 mt-1">
              {t('modpacks.availableCount', { count: filteredModpacks.length })}
            </p>
          </div>

          <div
            className="flex items-center space-x-3"
            style={{
              animation: 'fadeInRight 0.15s ease-out 0.05s backwards',
              ...getAnimationStyle({})
            }}
          >
            <div className="relative group">
              <Search className={`w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400 transition-colors duration-200 ${getAnimationClass('', 'group-focus-within:text-lumina-400')
                }`} />
              <input
                type="text"
                placeholder={t('modpacks.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`input-field pl-10 w-64 transition-all duration-75 ${getAnimationClass('', 'focus:ring-2 focus:ring-lumina-400/50 focus:border-lumina-400')
                  }`}
                style={getAnimationStyle({})}
              />
            </div>

            <button
              onClick={handleRefresh}
              disabled={isLoading || hasActiveInstallation}
              className={`btn-secondary transition-transform duration-75 group ${getAnimationClass('', 'hover:scale-105')
                }`}
              style={getAnimationStyle({})}
              title={hasActiveInstallation ? t('modpacks.refreshDisabledDuringInstall') : t('modpacks.refresh')}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading || isRefreshAnimating ? 'animate-spin' : ''} transition-transform duration-150`} />
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
                {searchTerm ? t('modpacks.noResults') : t('modpacks.noModpacks')}
              </h2>
              <p className="text-dark-400">
                {searchTerm
                  ? t('modpacks.tryDifferentSearch')
                  : t('modpacks.checkConnection')
                }
              </p>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="btn-primary mt-4"
                >
                  {t('modpacks.clearSearch')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-8">
            {/* Helper function to render a category section */}
            {(['official', 'partner', 'community'] as const).map((category) => {
              const categoryModpacks = filteredModpacks.filter(m => {
                // Default to community if no category is set, or match the category
                if (!m.category) return category === 'community';
                return m.category === category;
              });

              if (categoryModpacks.length === 0) return null;

              return (
                <div key={category} className="space-y-4">
                  <div className="flex items-center space-x-2 border-b border-dark-700 pb-2">
                    <h2 className="text-xl font-bold text-white">
                      {t(`modpacks.category.${category}`)}
                    </h2>
                    <span className="text-sm text-dark-400 bg-dark-700 px-2 py-0.5 rounded-full">
                      {categoryModpacks.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {categoryModpacks.map((modpack, index) => {
                      const modpackState = modpackStates[modpack.id] || {
                        status: 'not_installed' as const,
                        installed: false,
                        downloading: false,
                        progress: {
                          percentage: 0,
                          downloaded: 0,
                          total: 0,
                          speed: 0,
                          currentFile: '',
                          downloadSpeed: '',
                          eta: '',
                          phase: ''
                        },
                        features: []
                      };

                      return (
                        <div
                          key={modpack.id}
                          style={{
                            animation: `fadeInUp 0.15s ease-out ${index * 0.02 + 0.1}s backwards`,
                            ...getAnimationStyle({})
                          }}
                        >
                          <ModpackCard
                            modpack={modpack}
                            state={modpackState}
                            onSelect={() => handleModpackSelect(modpack)}
                            index={index}
                            isReadOnly={true}
                            onNavigateToMyModpacks={() => onNavigate?.('my-modpacks')}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Loading Overlay */}
      {showLoadingOverlay && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] pointer-events-auto">
          <div className="bg-dark-800 rounded-lg p-6 max-w-md w-full mx-4 border border-dark-700">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lumina-500 mx-auto mb-4"></div>
              <h3 className="text-white text-lg font-semibold mb-2">
                {t('modpacks.loading')}
              </h3>
              <p className="text-dark-300 text-sm">
                {t('modpacks.serverData')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModpacksPage; 