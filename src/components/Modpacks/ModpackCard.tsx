import React, { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Play, RefreshCw, Wrench, AlertTriangle, Loader2, Globe, Trash2, FolderOpen, StopCircle, Clock, Settings, Info } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { Modpack, ModpackState, ProgressInfo } from '../../types/launcher';
import { useLauncher } from '../../contexts/LauncherContext';
import { useAnimation } from '../../contexts/AnimationContext';
import ConfirmDialog from '../ConfirmDialog';
import ProfileOptionsModal from './ProfileOptionsModal';
import LauncherService from '../../services/launcherService';
import { UnknownErrorModal } from '../UnknownErrorModal';

interface ModpackCardProps {
  modpack: Modpack;
  state: ModpackState & {
    progress?: ProgressInfo;
  };
  onSelect: () => void;
  index?: number;
  hideServerBadges?: boolean; // Hide category and status badges for local modpacks
  isReadOnly?: boolean; // Read-only mode: only show Install/Installed buttons (for Home/Explore)
  onNavigateToMyModpacks?: () => void; // Callback to navigate to My Modpacks after install
  onModpackUpdated?: (updates: { name?: string; logo?: string; backgroundImage?: string }) => void; // Called when modpack is updated
}

const ModpackCard: React.FC<ModpackCardProps> = memo(({ modpack, state, onSelect, index = 0, hideServerBadges = false, isReadOnly = false, onNavigateToMyModpacks, onModpackUpdated }) => {
  const { t } = useTranslation();
  const { getAnimationClass, getAnimationStyle } = useAnimation();
  const { installModpack, updateModpack, launchModpack, repairModpack, removeModpack, stopInstance } = useLauncher();
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [showProfileOptionsModal, setShowProfileOptionsModal] = useState(false);
  const [instanceMetadata, setInstanceMetadata] = useState<any>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const getServerStatusBadge = () => {
    // Priority: New > Coming Soon (don't show Active if it's New or Coming Soon)
    if (modpack.isNew) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-600/40 text-green-300 border border-green-600/60">
          {t('modpacks.status.new')}
        </span>
      );
    }
    if (modpack.isComingSoon) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-600/40 text-blue-300 border border-blue-600/60">
          {t('modpacks.status.coming_soon')}
        </span>
      );
    }
    // Only show Inactive badge if it's not active (hide Active badge by default)
    if (!modpack.isActive) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-600/40 text-gray-300 border border-gray-600/60">
          {t('modpacks.status.inactive')}
        </span>
      );
    }
    return null; // Don't show badge for regular active modpacks
  };

  const requiresModpack = !!modpack.urlModpackZip;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const handleInstall = async () => {
    // Save full modpack data to localStorage so MyModpacksPage can use it during installation
    try {
      localStorage.setItem(`installing_modpack_${modpack.id}`, JSON.stringify(modpack));
    } catch (error) {
      console.error('Failed to save modpack to localStorage:', error);
    }
    return await installModpack(modpack.id);
  };

  const getButtonConfig = () => {
    const hasValidIp = modpack.ip && modpack.ip.trim() !== '';

    // Check if Coming Soon - disable downloads
    if (modpack.isComingSoon) {
      return {
        text: t('modpacks.comingSoon'),
        icon: Clock,
        onClick: () => { },
        className: 'btn-secondary',
        disabled: true
      };
    }

    // Read-only mode (Home/Explore): Show Install or Installed (disabled) only
    if (isReadOnly) {
      // Show installing/updating/reinstalling state
      if (['installing', 'updating', 'reinstalling'].includes(state.status)) {
        return {
          text: state.status === 'installing' ? t('modpacks.installing')
            : state.status === 'reinstalling' ? t('modpacks.reinstalling', 'Reinstalling...')
              : t('modpacks.updating'),
          icon: Loader2,
          onClick: () => { },
          className: 'btn-secondary',
          disabled: true
        };
      }

      if (['installed', 'outdated', 'error'].includes(state.status)) {
        // Show Repair for error state, Installed for others
        if (state.status === 'error') {
          return {
            text: t('modpacks.repair'),
            icon: Wrench,
            onClick: () => repairModpack(modpack.id),
            className: 'btn-warning',
            disabled: false
          };
        }
        return {
          text: t('modpacks.installed'),
          icon: Download,
          onClick: () => { },
          className: 'btn-secondary',
          disabled: true
        };
      }

      // Not installed in read-only mode: Show Install with navigation
      return {
        text: t('modpacks.install'),
        icon: Download,
        onClick: async () => {
          const started = await handleInstall();
          if (started && onNavigateToMyModpacks) {
            onNavigateToMyModpacks();
          }
        },
        className: 'btn-primary',
        disabled: false
      };
    }

    // Full management mode (My Modpacks): Regular button logic
    switch (state.status) {
      case 'not_installed':
        return {
          text: t('modpacks.install'),
          icon: Download,
          onClick: () => handleInstall(),
          className: 'btn-primary',
          disabled: false
        };
      case 'installed':
        return {
          text: t('modpacks.play'),
          icon: Play,
          onClick: () => launchModpack(modpack.id),
          className: 'btn-success',
          disabled: false
        };
      case 'outdated':
        return {
          text: t('modpacks.update'),
          icon: RefreshCw,
          onClick: () => updateModpack(modpack.id),
          className: 'btn-warning',
          disabled: false
        };
      case 'installing':
      case 'updating':
      case 'repairing':
      case 'reinstalling':
        return {
          text: state.status === 'installing' ? t('modpacks.installing')
            : state.status === 'updating' ? t('modpacks.updating')
              : state.status === 'reinstalling' ? t('modpacks.reinstalling', 'Reinstalling...')
                : t('modpacks.repairing'),
          icon: Loader2,
          onClick: () => { },
          className: 'btn-secondary',
          disabled: true
        };
      case 'launching':
        return {
          text: t('modpacks.launching'),
          icon: Loader2,
          onClick: () => { },
          className: 'btn-success',
          disabled: true
        };
      case 'running':
        return {
          text: t('modpacks.stop'),
          icon: StopCircle,
          onClick: () => stopInstance(modpack.id),
          className: 'btn-danger',
          disabled: false
        };
      case 'stopping':
        return {
          text: t('modpacks.stopping'),
          icon: Loader2,
          onClick: () => { },
          className: 'btn-danger',
          disabled: true
        };
      case 'error':
        return {
          text: t('modpacks.repair'),
          icon: Wrench,
          onClick: () => repairModpack(modpack.id),
          className: 'btn-warning',
          disabled: false
        };
      default:
        // Handle servers without modpack and without IP (not available)
        if (!requiresModpack && !hasValidIp) {
          return {
            text: t('modpacks.notAvailable'),
            icon: AlertTriangle,
            onClick: () => { },
            className: 'btn-secondary',
            disabled: true
          };
        }

        // Handle any server with IP (vanilla or non-vanilla)
        if (!requiresModpack && hasValidIp) {
          return {
            text: `${t('modpacks.connect')} ${modpack.ip}`,
            icon: Globe,
            onClick: () => copyToClipboard(modpack.ip!),
            className: 'btn-secondary',
            disabled: false
          };
        }

        // Default: show install button for modpacks
        return {
          text: t('modpacks.install'),
          icon: Download,
          onClick: () => handleInstall(),
          className: 'btn-primary',
          disabled: false
        };
    }
  };

  const buttonConfig = getButtonConfig();
  const ButtonIcon = buttonConfig.icon;
  const isLoading = ['installing', 'updating', 'repairing', 'reinstalling', 'launching', 'stopping'].includes(state.status);

  // Fake progress for the "launching" phase
  const [fakeLaunchProgress, setFakeLaunchProgress] = useState(0);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (state.status === 'launching') {
      setFakeLaunchProgress(0);

      intervalId = setInterval(() => {
        setFakeLaunchProgress(prev => {
          if (prev >= 100) {
            if (intervalId) clearInterval(intervalId);
            return 100;
          }
          return prev + 2; // +2% cada 50 ms -> ~2.5 s para llegar a 100 %
        });
      }, 50);
    } else {
      setFakeLaunchProgress(0);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [state.status]);

  // Load instance metadata when installed
  useEffect(() => {
    const loadMetadata = async () => {
      // Skip if no modpack ID or not installed
      if (!modpack.id || !state.installed) return;

      try {
        const metadataJson = await invoke<string | null>('get_instance_metadata', {
          modpackId: modpack.id
        });

        if (metadataJson) {
          setInstanceMetadata(JSON.parse(metadataJson));
        }
      } catch (error) {
        console.error('Failed to load instance metadata:', error);
      }
    };

    loadMetadata();
  }, [state.installed, modpack.id]);

  const displayedPercentage = state.status === 'launching'
    ? fakeLaunchProgress
    : state.progress?.percentage ?? 0;

  // Use modpack.name as source of truth - it's updated immediately when edited in MyModpacksPage
  const displayName = modpack.name;
  const displayDescription = modpack.shortDescription || modpack.description || '';

  const reloadInstanceMetadata = async () => {
    try {
      const metadataJson = await invoke<string | null>('get_instance_metadata', {
        modpackId: modpack.id
      });

      if (metadataJson) {
        setInstanceMetadata(JSON.parse(metadataJson));
      }
    } catch (error) {
      console.error('Failed to reload instance metadata:', error);
    }
  };

  // Parse general message format: "progress.key|counter" or just "progress.key"
  const parseGeneralMessage = (message?: string): { translatedMessage: string; counter?: string } => {
    if (!message) return { translatedMessage: '' };

    const parts = message.split('|');
    const key = parts[0];
    const counter = parts[1]; // Could be "3/150" or undefined

    // If the key starts with "progress.", translate it
    if (key.startsWith('progress.')) {
      const translationKey = key.substring('progress.'.length);
      const translatedMessage = t(`progress.${translationKey}`, key);
      return { translatedMessage, counter };
    }

    return { translatedMessage: message, counter };
  };

  const getStepMessage = (step?: string): string => {
    if (!step) return '';

    // Map snake_case step names to camelCase translation keys
    const stepToTranslationKey: { [key: string]: string } = {
      'checking': 'checking',
      'initializing': 'initializing',
      'preparing_installation': 'preparingInstallation',
      'verifying_modpack_config': 'verifyingModpackConfig',
      'configuring_minecraft': 'configuringMinecraft',
      'downloading_minecraft': 'downloadingMinecraft',
      'installing_minecraft': 'installingMinecraft',
      'downloading_minecraft_file': 'downloadingMinecraft',
      'downloading_minecraft_multiple': 'downloadingMinecraftMultiple',
      'installing_component': 'installingComponent',
      'minecraft_ready': 'minecraftReady',
      'downloading_modpack': 'downloadingModpack',
      'processing_modpack': 'processingModpack',
      'processing_curseforge': 'processingCurseforge',
      'preparing_mod_downloads': 'preparingModDownloads',
      'downloading_modpack_file': 'downloadingModpackFile',
      'downloading_mod_file': 'downloadingModFile',
      'mod_already_exists': 'modAlreadyExists',
      'mod_downloaded_verified': 'modDownloadedVerified',
      'mod_unavailable': 'modUnavailable',
      'extracting_modpack': 'extractingModpack',
      'downloading': 'downloading',
      'downloading_update': 'downloadingUpdate',
      'processing': 'processing',
      'processing_update': 'processingUpdate',
      'extracting': 'extracting',
      'modpack_ready': 'modpackReady',
      'modpack_extracted': 'modpackExtracted',
      'no_modpack_files': 'noModpackFiles',
      'finalizing': 'finalizing',
      'updating': 'updating',
      'updating_curseforge_mods': 'updatingCurseforgeMods',
      'replacing_mods': 'replacingMods',
      'updating_configs': 'updatingConfigs',
      'updating_standard_modpack': 'updatingStandardModpack',
      'backing_up_minecraft': 'backingUpMinecraft',
      'extracting_new_version': 'extractingNewVersion',
      'restoring_minecraft': 'restoringMinecraft',
      'finalizing_update': 'finalizingUpdate',
      'copying_modpack': 'copyingModpack',
      'saving_instance_config': 'savingInstanceConfig',
      'finalizing_installation': 'finalizingInstallation',
      'installation_completed': 'installationCompleted',
      'completed': 'completed'
    };

    const translationKey = stepToTranslationKey[step];
    return translationKey ? t(`progress.${translationKey}`) : step;
  };

  const handleRemoveModpack = async () => {
    try {
      setIsRemoving(true);
      console.log('🗑️ Removing instance:', modpack.id);
      await removeModpack(modpack.id);
      setShowRemoveDialog(false);
    } catch (error) {
      console.error('❌ Error removing instance:', error);
    } finally {
      setIsRemoving(false);
    }
  };

  const handleOpenInstanceFolder = async () => {
    try {
      console.log('📂 Opening instance folder for:', modpack.id);
      await LauncherService.getInstance().openInstanceFolder(modpack.id);
    } catch (error) {
      console.error('❌ Error opening instance folder:', error);
    }
  };

  // Special styling for coming soon items
  const isComingSoon = modpack.isComingSoon;
  const cardClasses = `card cursor-pointer group flex flex-col h-full relative transition-all duration-75 ${getAnimationClass('hover:bg-dark-700', 'hover:border-lumina-400/40')
    } ${isComingSoon
      ? `border-2 border-blue-500/50 shadow-blue-500/20 shadow-lg ${getAnimationClass('', 'hover:border-blue-400/70 hover:shadow-blue-400/30 hover:shadow-xl')
      }`
      : ''
    }`;

  return (
    <div
      className={cardClasses}
      style={{
        animation: `fadeInUp 0.15s ease-out ${index * 0.02 + 0.1}s backwards`,
        ...getAnimationStyle({})
      }}
    >
      {/* Status Badge - Top right corner of entire card */}
      {!hideServerBadges && (
        <div className="absolute top-2 right-2 z-20 transition-all duration-75">
          {getServerStatusBadge()}
        </div>
      )}

      {/* Coming Soon Glow Effect */}
      {isComingSoon && (
        <div className={`absolute inset-0 rounded-lg bg-gradient-to-br from-blue-500/10 via-transparent to-blue-400/5 pointer-events-none ${getAnimationClass('', 'animate-pulse')
          }`} />
      )}

      <div onClick={onSelect} className="flex-1 flex flex-col">
        <div className="space-y-3 flex-1">
          {/* Modpack Icon with API Background - Reduced height */}
          <div className={`w-full h-24 rounded-lg overflow-hidden flex items-center justify-center p-3 relative group-hover:bg-dark-600 transition-all duration-75 ${!modpack.backgroundImage ? 'bg-gradient-to-br from-blue-500 to-purple-600' : ''}`}>
            {/* API backgroundImage */}
            {modpack.backgroundImage && (
              <div
                className="absolute inset-0 bg-center bg-cover"
                style={{
                  backgroundImage: modpack.backgroundImage.startsWith('linear-gradient')
                    ? modpack.backgroundImage
                    : `url(${modpack.backgroundImage})`,
                  opacity: 0.35
                }}
              />
            )}

            {/* Dark overlay to ensure readability (only for images) */}
            {modpack.backgroundImage && <div className="absolute inset-0 bg-black/40" />}

            {/* Logo or first letter */}
            {modpack.logo && modpack.logo.length === 1 ? (
              // Show first letter for local modpacks
              <div className="text-5xl font-bold text-white opacity-20 relative z-10">
                {modpack.logo}
              </div>
            ) : modpack.logo ? (
              // Show logo image for server modpacks
              <img
                src={modpack.logo}
                alt={displayName}
                loading="lazy"
                className={`relative z-10 max-w-full max-h-full object-contain transition-transform duration-75 ${getAnimationClass('', 'group-hover:scale-105')
                  }`}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMzc0MTUxIi8+CjxwYXRoIGQ9Ik0yNCAyNEg0MFY0MEgyNFYyNFoiIGZpbGw9IiM2Mzc1ODMiLz4KPC9zdmc+';
                }}
              />
            ) : (
              // Show first letter of modpack name when no logo
              <div className="text-5xl font-bold text-white opacity-20 relative z-10">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Modpack Info */}
          <div className="space-y-2 flex-1">
            <h3 className={`text-white font-semibold text-base truncate transition-colors duration-75 pr-2 ${getAnimationClass('', 'group-hover:text-lumina-300')
              }`}>
              {displayName}
            </h3>

            <p className={`text-dark-300 text-sm line-clamp-2 transition-colors duration-75 ${getAnimationClass('', 'group-hover:text-dark-200')
              }`}>
              {displayDescription}
            </p>

            {/* Partner Name Display */}
            {!hideServerBadges && modpack.category === 'partner' && modpack.partnerName && (
              <div className="mb-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-600/20 text-blue-300 border border-blue-600/30">
                  {modpack.partnerName}
                </span>
              </div>
            )}

            {/* Author Name Display for Community Modpacks */}
            {!hideServerBadges && modpack.category === 'community' && modpack.authorName && (
              <div className="mb-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-600/20 text-green-300 border border-green-600/30">
                  {modpack.authorName}
                </span>
              </div>
            )}

            <div className={`flex items-center space-x-2 text-xs text-dark-400 transition-colors duration-75 ${getAnimationClass('', 'group-hover:text-dark-300')
              }`}>
              <span className={`bg-dark-700/50 px-2 py-0.5 rounded-full transition-all duration-75 ${getAnimationClass('', 'group-hover:bg-lumina-600/20')
                }`}>
                MC {modpack.minecraftVersion}
              </span>
              <span className={`capitalize bg-dark-700/50 px-2 py-0.5 rounded-full transition-all duration-75 ${getAnimationClass('', 'group-hover:bg-lumina-600/20')
                }`}>
                {modpack.modloader} {modpack.modloaderVersion}
              </span>
              {modpack.gamemode && (
                <span className={`text-lumina-400 bg-lumina-600/20 px-2 py-0.5 rounded-full transition-all duration-75 ${getAnimationClass('', 'group-hover:bg-lumina-600/30')
                  }`}>
                  {modpack.gamemode}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {isLoading && state.progress && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-dark-300 mb-1">
              <span className="truncate">
                {(() => {
                  const { translatedMessage, counter } = parseGeneralMessage(state.progress.generalMessage);
                  const message = translatedMessage || getStepMessage(state.progress.step) || buttonConfig.text;
                  const displayCounter = counter || (
                    state.progress.downloaded !== undefined && state.progress.total !== undefined && state.progress.total > 0
                      ? `${state.progress.downloaded}/${state.progress.total}`
                      : null
                  );
                  return (
                    <>
                      {message}
                      {displayCounter && <span className="ml-2 text-dark-400">({displayCounter})</span>}
                    </>
                  );
                })()}
              </span>
              <span className="font-mono">{Math.round(displayedPercentage)}%</span>
            </div>
            <div className="w-full bg-dark-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-lumina-600 to-lumina-500 h-2 rounded-full transition-all duration-200 ease-out"
                style={{ width: `${displayedPercentage}%` }}
              />
            </div>
            {/* Progress details */}
            {(state.progress.detailMessage && state.progress.detailMessage.trim() !== '') || state.progress.eta ? (
              <div className="mt-2 text-xs">
                <div className="flex justify-between items-start">
                  {/* Left side: current file details */}
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    {state.progress.detailMessage && state.progress.detailMessage.trim() !== '' && (() => {
                      const message = state.progress.detailMessage;
                      let displayText = message;
                      let bulletClass = "w-2 h-2 bg-lumina-600 rounded-full animate-heartbeat";

                      // Extract only the filename from the message
                      if (message.includes(":")) {
                        displayText = message.substring(message.indexOf(":") + 1).trim();
                      }

                      // Set bullet color based on message type without changing text
                      if (message.startsWith("mod_exists:") || message.startsWith("mod_completed:")) {
                        bulletClass = "w-2 h-2 bg-green-500 rounded-full";
                      } else if (message.startsWith("mod_error:") || message.startsWith("mod_unavailable:")) {
                        bulletClass = "w-2 h-2 bg-red-500 rounded-full";
                      }

                      return (
                        <>
                          <div className={bulletClass}></div>
                          <span className="truncate">{displayText}</span>
                        </>
                      );
                    })()}
                  </div>

                  {/* Right side: ETA aligned with percentage */}
                  <div className="flex-shrink-0 font-mono">
                    <div className="relative">
                      <span className="opacity-0 pointer-events-none select-none">00m 00s</span>
                      {state.progress.eta && (
                        <span className="absolute top-0 right-0 text-dark-400">{state.progress.eta}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Error Message - Clickable to show modal */}
        {state.status === 'error' && state.error && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowErrorModal(true);
            }}
            className="mt-3 p-2 bg-red-600/20 border border-red-600/30 rounded-lg w-full text-left hover:bg-red-600/30 transition-colors cursor-pointer group"
          >
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-red-400 text-sm flex-1 line-clamp-2">{state.error}</span>
              <Info className="w-4 h-4 text-red-400 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </div>
          </button>
        )}
      </div>

      {/* Action Buttons */}
      <div className={`mt-3 pt-3 border-t border-dark-700 transition-colors duration-75 ${getAnimationClass('', 'group-hover:border-lumina-400/30')
        }`}>
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              buttonConfig.onClick();
            }}
            disabled={buttonConfig.disabled}
            className={`${buttonConfig.className} flex-1 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-75 ${getAnimationClass('', !buttonConfig.disabled ? 'hover:scale-[1.02]' : '')} group`}
          >
            <ButtonIcon
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''} transition-transform duration-75 ${getAnimationClass('', !isLoading && !buttonConfig.disabled ? 'group-hover:scale-110' : '')}`}
            />
            <span>{buttonConfig.text}</span>
          </button>

          {/* Settings/Profile Options button - only in full management mode */}
          {!isReadOnly && ['installed', 'outdated', 'error'].includes(state.status) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowProfileOptionsModal(true);
              }}
              disabled={isLoading}
              className={`btn-secondary px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-75 ${getAnimationClass('', 'hover:scale-[1.02]')} group`}
              title="Profile Options"
            >
              <Settings className={`w-4 h-4 transition-transform duration-75 ${getAnimationClass('', 'group-hover:rotate-90')}`} />
            </button>
          )}

          {/* Open folder button - only in full management mode */}
          {!isReadOnly && ['installed', 'outdated', 'error'].includes(state.status) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenInstanceFolder();
              }}
              disabled={isLoading}
              className={`btn-secondary px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-75 ${getAnimationClass('', 'hover:scale-[1.02]')} group`}
              title={t('modpacks.openFolderTooltip')}
            >
              <FolderOpen className={`w-4 h-4 transition-transform duration-75 ${getAnimationClass('', 'group-hover:scale-110')}`} />
            </button>
          )}

          {/* Remove button - only in full management mode */}
          {!isReadOnly && ['installed', 'outdated', 'error'].includes(state.status) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                console.log('🔴 Remove button clicked for instance:', modpack.id);
                setShowRemoveDialog(true);
              }}
              disabled={isLoading}
              className={`btn-danger px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-75 ${getAnimationClass('', 'hover:scale-[1.02]')} group`}
              title={t('modpacks.removeTooltip')}
            >
              <Trash2 className={`w-4 h-4 transition-transform duration-75 ${getAnimationClass('', 'group-hover:scale-110')}`} />
            </button>
          )}
        </div>
      </div>

      {/* Remove Confirmation Dialog */}
      {showRemoveDialog && (
        <ConfirmDialog
          title={t('modpacks.removeConfirmTitle')}
          message={t('modpacks.removeConfirmMessage', { name: displayName })}
          confirmText={t('modpacks.removeButton')}
          cancelText={t('app.cancel')}
          onConfirm={handleRemoveModpack}
          onCancel={() => setShowRemoveDialog(false)}
          isLoading={isRemoving}
          type="danger"
        />
      )}

      {/* Profile Options Modal */}
      <ProfileOptionsModal
        modpackId={modpack.id}
        modpackName={displayName}
        isOpen={showProfileOptionsModal}
        onClose={() => setShowProfileOptionsModal(false)}
        isLocalModpack={!modpack.urlModpackZip}
        metadata={instanceMetadata}
        onSaveComplete={reloadInstanceMetadata}
        onModpackUpdated={onModpackUpdated}
      />

      {/* Error Modal */}
      <UnknownErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        modpackId={modpack.id}
        errorMessage={state.error || ''}
      />
    </div>
  );
});

ModpackCard.displayName = 'ModpackCard';

export default ModpackCard; 