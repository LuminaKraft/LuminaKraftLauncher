import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { useLauncher } from '../../contexts/LauncherContext';
import { useAnimation } from '../../contexts/AnimationContext';
import ModpackCard from './ModpackCard';
import ModpackDetailsRefactored from './ModpackDetailsRefactored';
import type { Modpack } from '../../types/launcher';

const ModpacksPage: React.FC = () => {
  const { t } = useTranslation();
  const { getAnimationClass, getAnimationStyle, withDelay } = useAnimation();
  const { 
    launcherData, 
    modpackStates, 
    isLoading, 
    error, 
    refreshData 
  } = useLauncher();
  
  const [selectedModpack, setSelectedModpack] = useState<Modpack | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [isRefreshAnimating, setIsRefreshAnimating] = useState(false);
  const [showingDetails, setShowingDetails] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Check if any modpack is currently installing/updating
  const hasActiveInstallation = Object.values(modpackStates).some(state => 
    ['installing', 'updating', 'launching'].includes(state.status)
  );

  const filteredModpacks = launcherData?.modpacks.filter(modpack =>
    modpack.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleModpackSelect = (modpack: Modpack) => {
    setIsTransitioning(true);
    
    // First phase: fade out current view
    withDelay(() => {
      setSelectedModpack(modpack);
      setShowingDetails(true);
      
      // Second phase: fade in details view
      withDelay(() => {
        setIsTransitioning(false);
      }, 100);
    }, 200);
  };

  const handleBackToList = () => {
    setIsTransitioning(true);
    setShowingDetails(false);
    
    withDelay(() => {
      setSelectedModpack(null);
      setIsTransitioning(false);
    }, 200);
  };

  const handleRefresh = async () => {
    setIsRefreshAnimating(true);
    try {
      await refreshData();
    } finally {
      // Make animation faster - 300ms instead of 600ms
      withDelay(() => {
        setIsRefreshAnimating(false);
      }, 300);
    }
  };

  if (isLoading && !launcherData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-lumina-500 mx-auto mb-4" />
          <p className="text-white">{t('modpacks.loading')}</p>
          <p className="text-dark-400 text-sm mt-1">{t('modpacks.serverData')}</p>
        </div>
      </div>
    );
  }

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
      status: 'not_installed' 
    };

    return (
      <div className={`h-full w-full ${
        getAnimationClass('transition-opacity duration-300 ease-out', '')
      } ${
        showingDetails && !isTransitioning 
          ? 'opacity-100' 
          : 'opacity-0'
      }`}
      style={getAnimationStyle({})}
      >
        <ModpackDetailsRefactored 
          modpack={selectedModpack} 
          state={modpackState} 
          onBack={handleBackToList} 
        />
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${
      getAnimationClass('transition-opacity duration-300 ease-out', '')
    } ${
      isTransitioning 
        ? 'opacity-0' 
        : 'opacity-100'
    }`}
    style={getAnimationStyle({})}
    >
      {/* Header */}
      <div 
        className="p-6 border-b border-dark-700"
        style={{
          animation: 'fadeInUp 0.4s ease-out',
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
              animation: 'fadeInRight 0.4s ease-out 0.1s backwards',
              ...getAnimationStyle({})
            }}
          >
            <div className="relative group">
              <Search className={`w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400 transition-colors duration-200 ${
                getAnimationClass('', 'group-focus-within:text-lumina-400')
              }`} />
              <input
                type="text"
                placeholder={t('modpacks.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`input-field pl-10 w-64 transition-all duration-300 ${
                  getAnimationClass('', 'focus:ring-2 focus:ring-lumina-400/50 focus:border-lumina-400')
                }`}
                style={getAnimationStyle({})}
              />
            </div>
            
            <button
              onClick={handleRefresh}
              disabled={isLoading || hasActiveInstallation}
              className={`btn-secondary transition-transform duration-200 group ${
                getAnimationClass('', 'hover:scale-105')
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
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredModpacks.map((modpack, index) => {
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
                      animation: `fadeInUp 0.4s ease-out ${index * 0.05 + 0.2}s backwards`,
                      ...getAnimationStyle({})
                    }}
                  >
                    <ModpackCard
                      modpack={modpack}
                      state={modpackState}
                      onSelect={() => handleModpackSelect(modpack)}
                      index={index}
                    />
                  </div>
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