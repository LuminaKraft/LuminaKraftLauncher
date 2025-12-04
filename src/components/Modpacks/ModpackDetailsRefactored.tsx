import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download, Clock, Users, Terminal, Info, Image } from 'lucide-react';
import LogsSection from './Details/Sections/LogsSection';
import ScreenshotsSection from './Details/Sections/ScreenshotsSection';
import type { Modpack, ModpackState, ProgressInfo } from '../../types/launcher';
import { useLauncher } from '../../contexts/LauncherContext';
import { useAnimation } from '../../contexts/AnimationContext';
import LauncherService from '../../services/launcherService';

import ModpackActions from './Details/ModpackActions';
import ModpackInfo from './Details/ModpackInfo';
import ModpackRequirements from './Details/ModpackRequirements';
import ModpackFeatures from './Details/ModpackFeatures';
import ModpackScreenshotGallery from './Details/ModpackScreenshotGallery';

interface ModpackDetailsProps {
  modpack: Modpack;
  state: ModpackState & {
    progress?: ProgressInfo;
  };
  onBack: () => void;
  features?: any[] | null;
  isReadOnly?: boolean; // Read-only mode: hide management actions
}

const ModpackDetailsRefactored: React.FC<ModpackDetailsProps> = ({ modpack, state, onBack, isReadOnly = false }) => {
  const { t } = useTranslation();
  const { modpackStates } = useLauncher();
  const { getAnimationClass, getAnimationStyle } = useAnimation();
  const launcherService = LauncherService.getInstance();

  const liveState = modpackStates[modpack.id] || state;

  // Logs state
  const [logs, setLogs] = React.useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'content' | 'logs' | 'screenshots'>('content');

  // Stats state
  const [stats, setStats] = useState({
    totalDownloads: 0,
    totalPlaytime: 0,
    activePlayers: 0,
    userPlaytime: 0
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Load stats from database
  useEffect(() => {
    const loadStats = async () => {
      setIsLoadingStats(true);
      try {
        const [modpackStats, userStats] = await Promise.all([
          launcherService.getModpackStats(modpack.id),
          launcherService.getUserModpackStats(modpack.id)
        ]);

        setStats({
          totalDownloads: modpackStats?.totalDownloads || 0,
          totalPlaytime: modpackStats?.totalPlaytime || 0,
          activePlayers: modpackStats?.activePlayers || 0,
          userPlaytime: userStats?.playtimeHours || 0
        });
      } catch (error) {
        console.error('Error loading stats:', error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    loadStats();
  }, [modpack.id]);

  React.useEffect(() => {
    let unlisten: (() => void) | null = null;
    let unlistenStart: (() => void) | null = null;
    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<string>(`minecraft-log-${modpack.id}`, (event) => {
          setLogs((prev) => {
            // keep last 500 lines
            const next = [...prev, event.payload];
            if (next.length > 500) {
              return next.slice(next.length - 500);
            }
            return next;
          });
        });

        // Clear logs when the instance (re)starts
        unlistenStart = await listen(`minecraft-started-${modpack.id}`, () => {
          setLogs([]);
        });
      } catch (err) {
        console.error('Failed to listen logs', err);
      }
    };
    setup();
    return () => {
      if (unlisten) {
        unlisten();
      }
      if (unlistenStart) {
        unlistenStart();
      }
    };
  }, [modpack.id]);

  // Use modpack fields directly (translations/features are now in modpack details)
  const displayName = modpack.name;
  const displayDescription = modpack.description;
  // Defensive: always use features from modpack details, fallback to []
  const resolvedFeatures = Array.isArray((modpack as any).features) ? (modpack as any).features : [];

  // Get server status badge like in ModpackCard
  const getServerStatusBadge = () => {
    // Priority: New > Coming Soon (don't show Active if it's New or Coming Soon)
    if (modpack.isNew) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-600/40 text-green-300 border border-green-600/60">
          {t('modpacks.status.new')}
        </span>
      );
    }
    if (modpack.isComingSoon) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-600/40 text-blue-300 border border-blue-600/60">
          {t('modpacks.status.coming_soon')}
        </span>
      );
    }
    // Only show Inactive badge if it's not active (hide Active badge by default)
    if (!modpack.isActive) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-600/40 text-gray-300 border border-gray-600/60">
          {t('modpacks.status.inactive')}
        </span>
      );
    }
    return null; // Don't show badge for regular active modpacks
  };

  // Format playtime for display
  const formatPlaytime = (hours: number): string => {
    if (hours === 0) return '0h';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    return `${hours.toFixed(1)}h`;
  };

  // Different stats for read-only vs management mode
  const statsDisplay = isReadOnly
    ? [
        {
          icon: Download,
          value: isLoadingStats ? '...' : stats.totalDownloads.toString(),
          label: t('modpacks.downloads')
        },
        {
          icon: Users,
          value: isLoadingStats ? '...' : stats.activePlayers.toString(),
          label: t('modpacks.activePlayers')
        },
      ]
    : [
        {
          icon: Clock,
          value: isLoadingStats ? '...' : formatPlaytime(stats.userPlaytime),
          label: t('modpacks.playTime')
        },
        {
          icon: Users,
          value: isLoadingStats ? '...' : stats.activePlayers.toString(),
          label: t('modpacks.activePlayers')
        },
      ];

  const renderContentTab = () => (
    <>
      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {statsDisplay.map((stat, index) => (
          <div 
            key={index} 
            className={`bg-dark-800 rounded-xl p-4 border border-dark-700 group ${
              getAnimationClass('hover:border-lumina-400/50 transition-all duration-200', 'hover:scale-105')
            }`}
            style={getAnimationStyle({
              animation: `fadeInUp 0.4s ease-out ${index * 0.05}s backwards`
            })}
          >
            <stat.icon className={`w-5 h-5 text-lumina-400 mb-2 ${
              getAnimationClass('transition-transform duration-150', 'group-hover:scale-105')
            }`} />
            <div className={`text-2xl font-bold text-white ${
              getAnimationClass('transition-colors duration-150', 'group-hover:text-lumina-300')
            }`}>
              {stat.value}
            </div>
            <div className="text-sm text-dark-400">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Screenshots - Only show in read-only mode */}
      {isReadOnly && modpack.images && modpack.images.length > 0 && (
        <ModpackScreenshotGallery
          images={modpack.images}
          modpackName={displayName}
        />
      )}

      {/* Features */}
  <ModpackFeatures features={resolvedFeatures} />

    </>
  );

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden bg-dark-900">
      {/* Back button - Fixed position */}
      <button
        onClick={onBack}
        className={`fixed top-6 left-6 z-50 flex items-center space-x-2 px-3 py-2 bg-dark-800/80 backdrop-blur-sm text-dark-400 hover:text-white rounded-lg border border-dark-700/50 ${
          getAnimationClass('transition-all duration-200', 'hover:scale-105 hover:bg-dark-700/90')
        }`}
        style={getAnimationStyle({})}
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm font-medium">{t('navigation.backToList')}</span>
      </button>

      {/* Hero Section with banner or fallback image */}
      <div 
        className="relative h-80 flex flex-col justify-end p-8 text-white"
      >
        {/* Banner / fallback image */}
        <div 
          className="absolute inset-0 bg-center bg-cover"
          style={{
            backgroundImage: `url(${modpack.backgroundImage || modpack.images?.[0] || modpack.logo})`,
            opacity: 0.12
          }}
        />
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 bg-black/40" />
        
        {/* Logo and Content */}
        <div className="relative z-10 flex items-start space-x-6">
          {/* Logo */}
          <div className="flex-shrink-0">
            <div 
              className="w-40 h-40 rounded-lg overflow-hidden flex items-center justify-center"
              style={getAnimationStyle({
                animation: `fadeInUp 0.4s ease-out 0.05s backwards`
              })}
            >
              <img
                src={modpack.logo}
                alt={displayName}
                className="w-full h-full object-contain object-top"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHZpZXdCb3g9IjAgMCA5NiA5NiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9Ijk2IiBoZWlnaHQ9Ijk2IiBmaWxsPSIjMzc0MTUxIi8+CjxwYXRoIGQ9Ik0zNiAzNkg2MFY2MEgzNlYzNloiIGZpbGw9IiM2Mzc1ODMiLz4KPC9zdmc+';
                }}
              />
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 
                  className={`text-4xl font-bold text-white mb-2 ${
                    getAnimationClass('transition-all duration-200')
                  }`}
                  style={getAnimationStyle({
                    animation: `fadeInUp 0.4s ease-out 0.1s backwards`
                  })}
                >
                  {displayName}
                </h1>
                <p 
                  className={`text-lg text-dark-300 leading-relaxed ${
                    getAnimationClass('transition-all duration-200')
                  }`}
                  style={getAnimationStyle({
                    animation: `fadeInUp 0.4s ease-out 0.15s backwards`
                  })}
                >
                  {displayDescription}
                </p>
              </div>
              <div 
                className="flex-shrink-0"
                style={getAnimationStyle({
                  animation: `fadeInUp 0.4s ease-out 0.2s backwards`
                })}
              >
                {getServerStatusBadge()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Mobile Actions First */}
          <div
            className={`lg:hidden ${getAnimationClass('transition-all duration-200')}`}
            style={getAnimationStyle({
              animation: `fadeInUp 0.3s ease-out 0.1s backwards`
            })}
          >
            <ModpackActions modpack={modpack} state={liveState} isReadOnly={isReadOnly} />
          </div>

          {/* Left Column - Main Info */}
          <div className="lg:col-span-2 space-y-8">
            {/* Tab Navigation */}
            <div 
              className={`flex space-x-1 bg-dark-800 p-1 rounded-lg ${
                getAnimationClass('transition-all duration-200')
              }`}
              style={getAnimationStyle({
                animation: `fadeInUp 0.3s ease-out 0.1s backwards`
              })}
            >
              <button
                onClick={() => setActiveTab('content')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md font-medium transition-all duration-200 ${
                  activeTab === 'content'
                    ? 'bg-lumina-600 text-white shadow-lg'
                    : 'text-dark-300 hover:text-white hover:bg-dark-700'
                }`}
                >
                <Info className="w-4 h-4" />
                <span>{t('modpacks.information')}</span>
              </button>
              {/* Screenshots Tab Button - Only show in read-only mode */}
              {isReadOnly && (
                <button
                  onClick={() => setActiveTab('screenshots')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-md font-medium transition-all duration-200 ${
                    activeTab === 'screenshots'
                      ? 'bg-lumina-600 text-white shadow-lg'
                      : 'text-dark-300 hover:text-white hover:bg-dark-700'
                  }`}
                >
                  <Image className="w-4 h-4" />
                  <span>{t('modpacks.screenshots')}</span>
                  {modpack.images && modpack.images.length > 0 && (
                    <span className="bg-lumina-400 text-black text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {modpack.images.length}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={() => setActiveTab('logs')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md font-medium transition-all duration-200 ${
                  activeTab === 'logs'
                    ? 'bg-lumina-600 text-white shadow-lg'
                    : 'text-dark-300 hover:text-white hover:bg-dark-700'
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span>{t('modpacks.logs')}</span>
                {logs.length > 0 && (
                  <span className="bg-green-500 text-black text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {logs.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
              {activeTab === 'content' ? renderContentTab() : activeTab === 'logs' ? <LogsSection logs={logs} /> : <ScreenshotsSection images={modpack.images} modpackName={displayName} />}
            </div>
          </div>

          {/* Right Column - Desktop Actions */}
          <div className="hidden lg:block">
            <div
              className={`space-y-6 ${getAnimationClass('transition-all duration-200')}`}
              style={getAnimationStyle({
                animation: `fadeInUp 0.3s ease-out 0.2s backwards`
              })}
            >
              <ModpackActions modpack={modpack} state={liveState} isReadOnly={isReadOnly} />
              <ModpackInfo modpack={modpack} />
              {/* System Requirements - Only show in read-only mode */}
              {isReadOnly && <ModpackRequirements modpack={modpack} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModpackDetailsRefactored; 