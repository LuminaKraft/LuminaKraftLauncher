import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download, Play, RefreshCw, Wrench, FolderOpen, Trash2,
  Loader2, StopCircle, Globe, AlertTriangle, Settings, Clock
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { Modpack, ModpackState, ProgressInfo } from '../../../types/launcher';
import { useLauncher } from '../../../contexts/LauncherContext';
import { useAnimation } from '../../../contexts/AnimationContext';
import ConfirmDialog from '../../ConfirmDialog';
import LauncherService from '../../../services/launcherService';
import ProfileOptionsModal from '../ProfileOptionsModal';

interface ModpackActionsProps {
  modpack: Modpack;
  state: ModpackState & {
    progress?: ProgressInfo;
  };
  isReadOnly?: boolean; // Read-only mode: show Install/Installed only
}

const ModpackActions: React.FC<ModpackActionsProps> = ({ modpack, state, isReadOnly = false }) => {
  const { t } = useTranslation();
  const { installModpack, updateModpack, launchModpack, repairModpack, removeModpack, stopInstance } = useLauncher();
  const { getAnimationClass, getAnimationStyle } = useAnimation();
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [showProfileOptions, setShowProfileOptions] = useState(false);
  const [instanceMetadata, setInstanceMetadata] = useState<any>(null);

  const requiresModpack = !!modpack.urlModpackZip;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const getStatusInfo = () => {
    const hasValidIp = modpack.ip && modpack.ip.trim() !== '';

    // Check if Coming Soon - disable downloads
    if (modpack.isComingSoon) {
      return {
        icon: Clock,
        label: t('modpacks.comingSoon'),
        bgColor: 'bg-gray-600/50 cursor-not-allowed',
        textColor: 'text-gray-400',
        action: () => {},
        disabled: true
      };
    }

    // Read-only mode (Home/Explore): Show Install or Installed only
    if (isReadOnly) {
      // Show installing/updating state in read-only mode
      if (['installing', 'updating'].includes(state.status)) {
        return {
          icon: Loader2,
          label: state.status === 'installing' ? t('modpacks.installing') : t('modpacks.updating'),
          bgColor: 'bg-lumina-500/50 cursor-not-allowed',
          textColor: 'text-white/70',
          spinning: true,
          disabled: true
        };
      }

      if (['installed', 'outdated', 'error'].includes(state.status)) {
        return {
          icon: Download,
          label: t('modpacks.installed'),
          bgColor: 'bg-gray-600/50 cursor-not-allowed',
          textColor: 'text-gray-400',
          action: () => {},
          disabled: true
        };
      }

      // Not installed in read-only mode
      return {
        icon: Download,
        label: t('modpacks.install'),
        bgColor: 'bg-lumina-500 hover:bg-lumina-600',
        textColor: 'text-white',
        action: () => installModpack(modpack.id),
        disabled: false
      };
    }

    switch (state.status) {
      case 'not_installed':
        return {
          icon: Download,
          label: t('modpacks.install'),
          bgColor: 'bg-lumina-500 hover:bg-lumina-600',
          textColor: 'text-white',
          action: () => installModpack(modpack.id)
        };
      case 'installed':
        return {
          icon: Play,
          label: t('modpacks.play'),
          bgColor: 'bg-green-600 hover:bg-green-700',
          textColor: 'text-white',
          action: () => launchModpack(modpack.id)
        };
      case 'outdated':
        return {
          icon: RefreshCw,
          label: t('modpacks.update'),
          bgColor: 'bg-orange-600 hover:bg-orange-700',
          textColor: 'text-white',
          action: () => updateModpack(modpack.id)
        };
      case 'installing':
      case 'updating':
        return {
          icon: Loader2,
          label: state.status === 'installing' ? t('modpacks.installing') : t('modpacks.updating'),
          bgColor: state.status === 'installing' ? 'bg-lumina-500/50 cursor-not-allowed' : 'bg-orange-600/50 cursor-not-allowed',
          textColor: 'text-white/70',
          spinning: true,
          disabled: true
        };
      case 'launching':
        return {
          icon: Loader2,
          label: t('modpacks.launching'),
          bgColor: 'bg-green-600/50 cursor-not-allowed',
          textColor: 'text-white/70',
          spinning: true,
          disabled: true
        };
      case 'running':
        return {
          icon: StopCircle,
          label: t('modpacks.stop'),
          bgColor: 'bg-red-600 hover:bg-red-700',
          textColor: 'text-white',
          action: () => stopInstance(modpack.id),
          disabled: false
        };
      case 'stopping':
        return {
          icon: Loader2,
          label: t('modpacks.stopping'),
          bgColor: 'bg-red-600/50 cursor-not-allowed',
          textColor: 'text-white/70',
          spinning: true,
          disabled: true
        };
      case 'error':
        return {
          icon: Wrench,
          label: t('modpacks.repair'),
          bgColor: 'bg-orange-600 hover:bg-orange-700',
          textColor: 'text-white',
          action: () => repairModpack(modpack.id)
        };

      default:
        // Handle servers without modpack
        // If has IP: show connect button
        if (!requiresModpack && hasValidIp) {
          return {
            icon: Globe,
            label: `${t('modpacks.connect')} ${modpack.ip}`,
            bgColor: 'bg-blue-600 hover:bg-blue-700',
            textColor: 'text-white',
            action: () => copyToClipboard(modpack.ip!),
            disabled: false
          };
        }

        // If no modpack and no IP: show not available
        if (!requiresModpack && !hasValidIp) {
          return {
            icon: AlertTriangle,
            label: t('modpacks.notAvailable'),
            bgColor: 'bg-gray-600/50 cursor-not-allowed',
            textColor: 'text-gray-400',
            action: () => {},
            disabled: true
          };
        }

        // Default: show install button for modpacks
        return {
          icon: Download,
          label: t('modpacks.install'),
          bgColor: 'bg-lumina-500 hover:bg-lumina-600',
          textColor: 'text-white',
          action: () => installModpack(modpack.id)
        };
    }
  };

  const getStepMessage = (step?: string): string => {
    if (!step) return '';
    
    const stepMappings: { [key: string]: string } = {
      'downloading_manifest': t('modpacks.steps.downloadingManifest'),
      'processing_manifest': t('modpacks.steps.processingManifest'),
      'downloading_mods': t('modpacks.steps.downloadingMods'),
      'downloading_overrides': t('modpacks.steps.downloadingOverrides'),
      'extracting_overrides': t('modpacks.steps.extractingOverrides'),
      'installing_modloader': t('modpacks.steps.installingModloader'),
      'finalizing': t('modpacks.steps.finalizing'),
      'complete': t('modpacks.steps.complete')
    };
    
    return stepMappings[step] || step;
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await removeModpack(modpack.id);
      setShowRemoveDialog(false);
    } catch (error) {
              console.error('Failed to remove instance:', error);
    } finally {
      setIsRemoving(false);
    }
  };

  const statusInfo = getStatusInfo();
  const Icon = statusInfo.icon;

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
          return prev + 2; // +2% cada 50 ms -> ~2.5 s
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
      if (state.installed) {
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
      }
    };

    loadMetadata();
  }, [state.installed, modpack.id]);

  const displayedPercentage = state.status === 'launching'
    ? fakeLaunchProgress
    : state.progress?.percentage ?? 0;

  return (
    <>
      {/* Main Action Button */}
      <div className="space-y-4">
        <button
          onClick={statusInfo.action}
          disabled={statusInfo.disabled}
          className={`w-full flex items-center justify-center space-x-3 px-6 py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
            getAnimationClass('', 'hover:scale-[1.02] active:scale-[0.98]')
          } ${statusInfo.bgColor} ${statusInfo.textColor} shadow-lg disabled:opacity-50 disabled:cursor-not-allowed`}
          style={getAnimationStyle({})}
        >
          <Icon className={`w-6 h-6 ${statusInfo.spinning ? 'animate-spin' : ''}`} />
          <span>{statusInfo.label}</span>
        </button>

        {/* Progress Display */}
        {['installing', 'updating', 'launching'].includes(state.status) && state.progress && (
          <div className="space-y-3">
            {/* Progress header */}
            <div className="flex justify-between text-sm text-dark-300 mb-2">
              <span className="truncate">
                {state.progress.generalMessage || getStepMessage(state.progress.step) || statusInfo.label}
              </span>
              <span className="font-mono">{Math.round(displayedPercentage)}%</span>
            </div>
            
            {/* Progress Bar */}
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

        {/* Error Message */}
        {state.status === 'error' && state.error && (
          <div className="p-3 bg-red-600/20 border border-red-600/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-red-400 text-sm">{state.error}</span>
            </div>
          </div>
        )}

        {/* Secondary Actions - only in full management mode */}
        {!isReadOnly && ['installed', 'outdated', 'error'].includes(state.status) && (
          <div className="flex flex-col gap-2">
            {/* Profile Options Button (Full Width) */}
            <button
              onClick={() => setShowProfileOptions(true)}
              className={`w-full flex items-center justify-center space-x-2 px-3 py-2.5 rounded-lg bg-lumina-600 hover:bg-lumina-700 text-white transition-all duration-200 ${
                getAnimationClass('', 'hover:scale-[1.02]')
              } group`}
              style={getAnimationStyle({})}
            >
              <Settings className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${
                getAnimationClass('', 'group-hover:rotate-90')
              }`} />
              <span className="text-sm font-medium">{t('profileOptions.button')}</span>
            </button>

            {/* Other Actions Row */}
            <div className="flex gap-2">
              <button
                onClick={() => LauncherService.getInstance().openInstanceFolder(modpack.id)}
                className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white transition-all duration-200 ${
                  getAnimationClass('', 'hover:scale-[1.02]')
                } min-w-0 group`}
                style={getAnimationStyle({})}
              >
                <FolderOpen className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${
                  getAnimationClass('', 'group-hover:scale-110')
                }`} />
                <span className="truncate text-sm">{t('modpacks.openFolder')}</span>
              </button>
              <button
                onClick={() => setShowRemoveDialog(true)}
                className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all duration-200 ${
                  getAnimationClass('', 'hover:scale-[1.02]')
                } min-w-0 group`}
                style={getAnimationStyle({})}
              >
                <Trash2 className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${
                  getAnimationClass('', 'group-hover:scale-110')
                }`} />
                <span className="truncate text-sm">{t('modpacks.remove')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Remove Confirmation Dialog */}
      {showRemoveDialog && (
        <ConfirmDialog
          title={t('modpacks.removeConfirmTitle')}
          message={t('modpacks.removeConfirmMessage', { name: modpack.name })}
          confirmText={t('modpacks.removeButton')}
          cancelText={t('app.cancel')}
          onConfirm={handleRemove}
          onCancel={() => setShowRemoveDialog(false)}
          isLoading={isRemoving}
          type="danger"
        />
      )}

      {/* Profile Options Modal */}
      <ProfileOptionsModal
        modpackId={modpack.id}
        modpackName={modpack.name}
        isOpen={showProfileOptions}
        onClose={() => setShowProfileOptions(false)}
        isLocalModpack={!modpack.urlModpackZip}
        metadata={instanceMetadata}
      />
    </>
  );
};

export default ModpackActions; 