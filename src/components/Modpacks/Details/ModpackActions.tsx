import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download, Play, RefreshCw, Wrench, FolderOpen, Trash2,
  Loader2
} from 'lucide-react';
import type { Modpack, ModpackState, ProgressInfo } from '../../../types/launcher';
import { useLauncher } from '../../../contexts/LauncherContext';
import { useAnimation } from '../../../contexts/AnimationContext';
import ConfirmDialog from '../../ConfirmDialog';
import LauncherService from '../../../services/launcherService';
import { useState } from 'react';

interface ModpackActionsProps {
  modpack: Modpack;
  state: ModpackState & {
    progress?: ProgressInfo;
  };
}

const ModpackActions: React.FC<ModpackActionsProps> = ({ modpack, state }) => {
  const { t } = useTranslation();
  const { installModpack, updateModpack, launchModpack, repairModpack, removeModpack } = useLauncher();
  const { getAnimationClass, getAnimationStyle } = useAnimation();
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const getStatusInfo = () => {
    switch (state.status) {
      case 'not_installed':
        return {
          icon: Download,
          label: t('modpacks.install'),
          bgColor: 'bg-lumina-500 hover:bg-lumina-600',
          textColor: 'text-white',
          action: () => installModpack(modpack.id)
        };
      case 'installing':
        return {
          icon: Loader2,
          label: t('modpacks.installing'),
          bgColor: 'bg-lumina-500/50 cursor-not-allowed',
          textColor: 'text-white/70',
          spinning: true,
          disabled: true
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
      case 'updating':
        return {
          icon: Loader2,
          label: t('modpacks.updating'),
          bgColor: 'bg-orange-600/50 cursor-not-allowed',
          textColor: 'text-white/70',
          spinning: true,
          disabled: true
        };
      case 'error':
        return {
          icon: Wrench,
          label: t('modpacks.repair'),
          bgColor: 'bg-red-600 hover:bg-red-700',
          textColor: 'text-white',
          action: () => repairModpack(modpack.id)
        };

      default:
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
      console.error('Failed to remove modpack:', error);
    } finally {
      setIsRemoving(false);
    }
  };

  const statusInfo = getStatusInfo();
  const Icon = statusInfo.icon;

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
        {['installing', 'updating'].includes(state.status) && state.progress && (
          <div className="space-y-3">
            {/* Progress Bar */}
            <div className="w-full bg-dark-700 rounded-full h-3 overflow-hidden">
              <div 
                className={getAnimationClass('h-full bg-gradient-to-r from-lumina-500 to-lumina-400 transition-all duration-300 ease-out', '')}
                style={getAnimationStyle({
                  width: `${Math.max(0, Math.min(100, state.progress.percentage || 0))}%`
                })}
              />
            </div>

            {/* Progress Info */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2 min-w-0 flex-1">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  {(() => {
                    const step = state.progress?.step;
                    const percentage = state.progress?.percentage;
                    const displayText = step ? getStepMessage(step) : '';
                    
                    let bulletClass = 'w-2 h-2 rounded-full flex-shrink-0 ';
                    
                    if (step === 'complete') {
                      bulletClass += 'bg-green-500';
                    } else if (percentage !== undefined && percentage > 0) {
                      bulletClass += 'bg-lumina-400 animate-pulse';
                    } else {
                      bulletClass += 'bg-dark-500';
                    }

                    return (
                      <>
                        <div className={bulletClass}></div>
                        <span className="truncate">{displayText}</span>
                      </>
                    );
                  })()}
                </div>
                
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
          </div>
        )}

        {/* Secondary Actions */}
        {['installed', 'outdated', 'error'].includes(state.status) && (
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
              className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-400 hover:text-red-300 transition-all duration-200 ${
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
        )}
      </div>

      {/* Remove Confirmation Dialog */}
      {showRemoveDialog && (
        <ConfirmDialog
          title={t('modpacks.removeModpack')}
          message={t('modpacks.removeConfirmation', { name: modpack.name })}
          confirmText={t('modpacks.removeFiles')}
          cancelText={t('common.cancel')}
          onConfirm={handleRemove}
          onCancel={() => setShowRemoveDialog(false)}
          isLoading={isRemoving}
          type="danger"
        />
      )}
    </>
  );
};

export default ModpackActions; 