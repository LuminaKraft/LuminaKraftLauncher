import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  ArrowLeft, Calendar, Package, Cpu, HardDrive, Users, Globe, Star, 
  Image as ImageIcon, Download, Clock, Server, Shield, ChevronDown,
  AlertCircle, CheckCircle2, Clock3, CircleDot, Play, RefreshCw, Wrench, FolderOpen, Trash2,
  Loader2
} from 'lucide-react';
import type { Modpack, ModpackState, Feature } from '../../types/launcher';
import { useLauncher } from '../../contexts/LauncherContext';
import ConfirmDialog from '../ConfirmDialog';
import LauncherService from '../../services/launcherService';

interface ModpackDetailsProps {
  modpack: Modpack;
  state: ModpackState;
  onBack: () => void;
}

const ModpackDetails: React.FC<ModpackDetailsProps> = ({ modpack, state, onBack }) => {
  const { t } = useTranslation();
  const { translations, installModpack, updateModpack, launchModpack, repairModpack, removeModpack } = useLauncher();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showFullChangelog, setShowFullChangelog] = useState(false);
  const [expandedFeatures, setExpandedFeatures] = useState<string[]>([]);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const toggleFeature = (featureId: string) => {
    setExpandedFeatures(prev => 
      prev.includes(featureId) 
        ? prev.filter(id => id !== featureId)
        : [...prev, featureId]
    );
  };

  const formatChangelog = (changelog: string) => {
    const lines = changelog.split('\n');
    const displayLines = showFullChangelog ? lines : lines.slice(0, 5);
    
    return displayLines.map((line, index) => {
      if (line.trim() === '') return <br key={index} />;
      
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
      
      return (
        <p key={index} className="text-dark-300 mb-2 ml-6">
          {line}
        </p>
      );
    });
  };

  const getModloaderDisplayName = (modloader: string) => {
    const displayNames = translations?.ui.modloader || {};
    return displayNames[modloader.toLowerCase()] || (() => {
      switch (modloader.toLowerCase()) {
        case 'forge': return 'Minecraft Forge';
        case 'fabric': return 'Fabric';
        case 'neoforge': return 'NeoForge';
        case 'paper': return 'Paper';
        case 'vanilla': return 'Vanilla';
        default: return modloader;
      }
    })();
  };

  const getStatusInfo = () => {
    if (modpack.isNew) {
      return { 
        text: t('modpacks.status.new'), 
        icon: AlertCircle,
        color: 'text-green-400'
      };
    }
    if (modpack.isActive) {
      return { 
        text: t('modpacks.status.active'), 
        icon: CheckCircle2,
        color: 'text-blue-400'
      };
    }
    if (modpack.isComingSoon) {
      return { 
        text: t('modpacks.status.coming_soon'), 
        icon: Clock3,
        color: 'text-yellow-400'
      };
    }
    return { 
      text: t('modpacks.status.inactive'), 
      icon: CircleDot,
      color: 'text-gray-400'
    };
  };

  const modpackTranslations = state.translations;
  const displayName = modpackTranslations?.name || modpack.name;
  const displayDescription = modpackTranslations?.description || t('modpacks.descriptionNotAvailable');
  const features = (state.features || []) as Feature[];
  const statusInfo = getStatusInfo();
  const isVanillaServer = modpack.modloader === 'vanilla' || modpack.modloader === 'paper';

  const stats = [
    { icon: Download, value: modpack.downloads || 0, label: t('modpacks.downloads') },
    { icon: Clock, value: modpack.playTime || 0, label: t('modpacks.playTime') },
    { icon: Users, value: modpack.players || 0, label: t('modpacks.activePlayers') },
  ];

  return (
    <div className="h-full overflow-auto bg-dark-900">
      {/* Hero Section */}
      <div className="relative h-64 bg-gradient-to-b from-dark-800 to-dark-900">
        <div className="absolute inset-0 bg-center bg-cover" style={{ 
          backgroundImage: `url(${modpack.banner || modpack.logo})`,
          opacity: 0.1 
        }} />
        
        <div className="relative h-full container mx-auto px-6 flex items-center">
          <button
            onClick={onBack}
            className="absolute top-6 left-6 flex items-center space-x-2 text-dark-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('navigation.backToList')}</span>
          </button>

          <div className="flex items-center space-x-8">
            <div className="w-32 h-32 rounded-xl overflow-hidden bg-dark-800 border border-dark-700 shadow-lg">
              <img
                src={modpack.logo}
                alt={displayName}
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHZpZXdCb3g9IjAgMCA5NiA5NiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9Ijk2IiBoZWlnaHQ9Ijk2IiBmaWxsPSIjMzc0MTUxIi8+CjxwYXRoIGQ9Ik0zNiAzNkg2MFY2MEgzNlYzNloiIGZpbGw9IiM2Mzc1ODMiLz4KPC9zdmc+';
                }}
              />
            </div>
            
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h1 className="text-4xl font-bold text-white">{displayName}</h1>
                <div className={`flex items-center space-x-2 ${statusInfo.color}`}>
                  <statusInfo.icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{statusInfo.text}</span>
                </div>
              </div>
              <p className="mt-2 text-lg text-dark-300 max-w-2xl">{displayDescription}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Main Info */}
          <div className="lg:col-span-2 space-y-8">
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
              {stats.map((stat, index) => (
                <div key={index} className="bg-dark-800 rounded-xl p-4 border border-dark-700">
                  <stat.icon className="w-5 h-5 text-lumina-400 mb-2" />
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                  <div className="text-sm text-dark-400">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Features Grid */}
            {features.length > 0 && (
              <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
                <h2 className="text-xl font-bold text-white mb-4">{t('modpacks.features')}</h2>
                <div className="space-y-4">
                  {features.map((feature, index) => {
                    const isExpanded = expandedFeatures.includes(feature.title);
                    return (
                      <div key={index} className="bg-dark-700/50 rounded-lg p-4">
                        <button
                          onClick={() => toggleFeature(feature.title)}
                          className="w-full flex items-start justify-between text-left"
                        >
                          <div className="flex items-start space-x-3">
                            <ChevronDown 
                              className={`w-5 h-5 text-lumina-400 flex-shrink-0 mt-0.5 transform transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`} 
                            />
                            <span className="text-white font-medium">{feature.title}</span>
                          </div>
                        </button>
                        {isExpanded && feature.description && (
                          <p className="text-dark-300 mt-3 ml-8">{feature.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Changelog */}
            <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
              <h2 className="text-xl font-bold text-white mb-4">{t('modpacks.changelog')}</h2>
              <div className="space-y-2">
                {formatChangelog(modpack.changelog || '')}
                {modpack.changelog && modpack.changelog.split('\n').length > 5 && (
                  <button
                    onClick={() => setShowFullChangelog(!showFullChangelog)}
                    className="text-lumina-400 hover:text-lumina-300 transition-colors mt-4"
                  >
                    {showFullChangelog ? t('common.showLess') : t('common.showMore')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Technical Info */}
          <div className="space-y-6">
            {/* Actions Card */}
            <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
              <h2 className="text-xl font-bold text-white mb-4">{t('modpacks.actions')}</h2>
              <div className="flex flex-col space-y-4">
                {/* Primary Action Button */}
                <button
                  onClick={() => {
                    switch (state.status) {
                      case 'not_installed':
                        installModpack(modpack.id);
                        break;
                      case 'installed':
                        launchModpack(modpack.id);
                        break;
                      case 'outdated':
                        updateModpack(modpack.id);
                        break;
                      case 'error':
                        repairModpack(modpack.id);
                        break;
                    }
                  }}
                  disabled={['installing', 'updating', 'launching'].includes(state.status)}
                  className={`w-full flex items-center justify-center space-x-3 px-6 py-3 rounded-lg font-medium transition-colors ${
                    state.status === 'installed' 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : state.status === 'outdated'
                      ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                      : state.status === 'error'
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-lumina-600 hover:bg-lumina-700 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {state.status === 'installed' && (
                    <>
                      <Play className="w-5 h-5" />
                      <span>{t('modpacks.play')}</span>
                    </>
                  )}
                  {state.status === 'not_installed' && (
                    <>
                      <Download className="w-5 h-5" />
                      <span>{t('modpacks.install')}</span>
                    </>
                  )}
                  {state.status === 'outdated' && (
                    <>
                      <RefreshCw className="w-5 h-5" />
                      <span>{t('modpacks.update')}</span>
                    </>
                  )}
                  {state.status === 'error' && (
                    <>
                      <Wrench className="w-5 h-5" />
                      <span>{t('modpacks.repair')}</span>
                    </>
                  )}
                  {state.status === 'installing' && (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{t('modpacks.installing')}</span>
                    </>
                  )}
                  {state.status === 'updating' && (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{t('modpacks.updating')}</span>
                    </>
                  )}
                  {state.status === 'launching' && (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{t('modpacks.launching')}</span>
                    </>
                  )}
                </button>

                {/* Progress Bar */}
                {['installing', 'updating', 'launching'].includes(state.status) && state.progress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-dark-300">
                      <span>{Math.round(state.progress)}%</span>
                    </div>
                    <div className="w-full bg-dark-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-lumina-600 to-lumina-500 h-2 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${state.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Secondary Actions */}
                {['installed', 'outdated', 'error'].includes(state.status) && (
                  <div className="flex gap-4">
                    <button
                      onClick={() => LauncherService.getInstance().openInstanceFolder(modpack.id)}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white transition-colors"
                    >
                      <FolderOpen className="w-5 h-5" />
                      <span>{t('modpacks.openFolder')}</span>
                    </button>
                    <button
                      onClick={() => setShowRemoveDialog(true)}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span>{t('modpacks.remove')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Installation Card */}
            <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
              <h2 className="text-xl font-bold text-white mb-4">{t('modpacks.installation')}</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-dark-300">
                    <Package className="w-4 h-4" />
                    <span>{t('modpacks.version')}</span>
                  </div>
                  <span className="text-white">v{modpack.version}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-dark-300">
                    <Cpu className="w-4 h-4" />
                    <span>{t('modpacks.modloader')}</span>
                  </div>
                  <span className="text-white">{getModloaderDisplayName(modpack.modloader)}</span>
                </div>
                {modpack.gamemode && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-dark-300">
                      <HardDrive className="w-4 h-4" />
                      <span>{t('modpacks.gamemode')}</span>
                    </div>
                    <span className="text-white">{modpack.gamemode}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Server Info */}
            {isVanillaServer && modpack.ip && (
              <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
                <h3 className="text-xl font-bold text-white mb-4">{t('modpacks.serverInfo')}</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-dark-300">
                      <Server className="w-4 h-4" />
                      <span>{t('modpacks.serverIPLabel')}</span>
                    </div>
                    <code className="text-lumina-400 bg-dark-900 px-3 py-1 rounded-lg text-sm">
                      {modpack.ip}
                    </code>
                  </div>
                </div>
              </div>
            )}

            {/* System Requirements */}
            <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
              <h3 className="text-xl font-bold text-white mb-4">{t('modpacks.requirements')}</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center space-x-2 text-dark-300 mb-2">
                    <Shield className="w-4 h-4" />
                    <span>{t('modpacks.recommendedRAM')}</span>
                  </div>
                  <p className="text-white bg-dark-900 px-3 py-2 rounded-lg">
                    {t('modpacks.ramMinRecommended', { min: 4, recommended: 8 })}
                  </p>
                </div>
                {modpack.jvmArgsRecomendados && (
                  <div>
                    <div className="flex items-center space-x-2 text-dark-300 mb-2">
                      <Cpu className="w-4 h-4" />
                      <span>{t('modpacks.recommendedJVMArgs')}</span>
                    </div>
                    <code className="block text-lumina-400 bg-dark-900 px-3 py-2 rounded-lg text-sm break-all">
                      {modpack.jvmArgsRecomendados}
                    </code>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Remove Confirmation Dialog */}
      {showRemoveDialog && (
        <ConfirmDialog
          title={t('modpacks.removeConfirmTitle')}
          message={t('modpacks.removeConfirmMessage', { name: displayName })}
          confirmText={t('modpacks.removeButton')}
          cancelText={t('app.cancel')}
          onConfirm={async () => {
            setIsRemoving(true);
            try {
              await removeModpack(modpack.id);
            } finally {
              setIsRemoving(false);
              setShowRemoveDialog(false);
            }
          }}
          onCancel={() => setShowRemoveDialog(false)}
          isLoading={isRemoving}
          type="danger"
        />
      )}
    </div>
  );
};

export default ModpackDetails; 