import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Play, RefreshCw, Wrench, AlertTriangle, Loader2, Globe, Trash2, FolderOpen } from 'lucide-react';
import type { Modpack, ModpackState, ProgressInfo } from '../../types/launcher';
import { useLauncher } from '../../contexts/LauncherContext';
import ConfirmDialog from '../ConfirmDialog';
import LauncherService from '../../services/launcherService';

interface ModpackCardProps {
  modpack: Modpack;
  state: ModpackState & {
    progress?: ProgressInfo;
  };
  onSelect: () => void;
}

const ModpackCard: React.FC<ModpackCardProps> = ({ modpack, state, onSelect }) => {
  const { t } = useTranslation();
  const { installModpack, updateModpack, launchModpack, repairModpack, removeModpack, translations } = useLauncher();
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const getServerStatusBadge = () => {
    if (modpack.isNew) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-600/20 text-green-400 border border-green-600/30">
          {translations?.ui.status.new || 'Nuevo'}
        </span>
      );
    }
    if (modpack.isActive) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-600/20 text-green-400 border border-green-600/30">
          {translations?.ui.status.active || 'Activo'}
        </span>
      );
    }
    if (modpack.isComingSoon) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-600/20 text-yellow-400 border border-yellow-600/30">
          {translations?.ui.status.coming_soon || 'Próximamente'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-600/20 text-gray-400 border border-gray-600/30">
        {translations?.ui.status.inactive || 'Inactivo'}
      </span>
    );
  };

  const isVanillaServer = modpack.modloader === 'vanilla' || modpack.modloader === 'paper';
  const requiresModpack = !!modpack.urlModpackZip;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const getButtonConfig = () => {
    if (isVanillaServer && modpack.ip) {
      return {
        text: `${t('modpacks.connect')} ${modpack.ip}`,
        icon: Globe,
        onClick: () => copyToClipboard(modpack.ip!),
        className: 'btn-secondary',
        disabled: false
      };
    }

    if (!requiresModpack && !modpack.ip) {
      return {
        text: t('modpacks.notAvailable'),
        icon: AlertTriangle,
        onClick: () => {},
        className: 'btn-secondary',
        disabled: true
      };
    }

    switch (state.status) {
      case 'not_installed':
        return {
          text: t('modpacks.install'),
          icon: Download,
          onClick: () => installModpack(modpack.id),
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
        return {
          text: state.status === 'installing' ? t('modpacks.installing') : t('modpacks.updating'),
          icon: Loader2,
          onClick: () => {},
          className: 'btn-secondary',
          disabled: true
        };
      case 'launching':
        return {
          text: t('modpacks.launching'),
          icon: Loader2,
          onClick: () => {},
          className: 'btn-success',
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
        return {
          text: t('modpacks.install'),
          icon: Download,
          onClick: () => installModpack(modpack.id),
          className: 'btn-primary',
          disabled: false
        };
    }
  };

  const buttonConfig = getButtonConfig();
  const ButtonIcon = buttonConfig.icon;
  const isLoading = ['installing', 'updating', 'launching'].includes(state.status);

  const modpackTranslations = state.translations;
  const displayName = modpackTranslations?.name || modpack.name;
  const displayDescription = modpackTranslations?.shortDescription || modpackTranslations?.description || t('modpacks.description');

  const getStepMessage = (step?: string): string => {
    if (!step) return '';
    
    const stepMessages: { [key: string]: string } = {
      'checking': 'Verificando archivos...',
      'initializing': 'Iniciando...',
      'preparing_installation': 'Preparando instalación...',
      'verifying_modpack_config': 'Verificando configuración...',
      'configuring_minecraft': 'Configurando Minecraft...',
      'downloading_minecraft': 'Descargando archivos de Minecraft...',
      'installing_minecraft': 'Instalando Minecraft y modloader...',
      'downloading_minecraft_file': 'Descargando archivos de Minecraft...',
      'downloading_minecraft_multiple': 'Descargando múltiples archivos...',
      'installing_component': 'Instalando componentes...',
      'minecraft_ready': 'Minecraft instalado',
      'downloading_modpack': 'Descargando modpack...',
      'processing_modpack': 'Procesando modpack...',
      'processing_curseforge': 'Procesando modpack de CurseForge...',
      'preparing_mod_downloads': 'Descargando mods...',
      'downloading_modpack_file': 'Descargando mods...',
      'downloading_mod_file': 'Descargando mods...',
      'mod_already_exists': 'Descargando mods...',
      'mod_downloaded_verified': 'Descargando mods...',
      'mod_unavailable': 'Descargando mods...',
      'extracting_modpack': 'Extrayendo modpack...',
      'downloading': 'Descargando archivos...',
      'downloading_update': 'Descargando actualización...',
      'processing': 'Procesando archivos...',
      'processing_update': 'Procesando actualización...',
      'extracting': 'Extrayendo archivos...',
      'modpack_ready': 'Archivos del modpack listos',
      'modpack_extracted': 'Modpack extraído exitosamente',
      'no_modpack_files': 'Sin archivos adicionales',
      'finalizing': 'Finalizando...',
      'updating': 'Actualizando...',
      'updating_curseforge_mods': 'Actualizando mods...',
      'replacing_mods': 'Reemplazando mods...',
      'updating_configs': 'Actualizando configuraciones...',
      'updating_standard_modpack': 'Actualizando modpack...',
      'backing_up_minecraft': 'Respaldando Minecraft...',
      'extracting_new_version': 'Extrayendo nueva versión...',
      'restoring_minecraft': 'Restaurando Minecraft...',
      'finalizing_update': 'Finalizando actualización...',
      'completed': 'Completado'
    };
    
    return stepMessages[step] || step;
  };

  const handleRemoveModpack = async () => {
    console.log('🔴 Starting modpack removal for:', modpack.id);
    setIsRemoving(true);
    
    try {
      await removeModpack(modpack.id);
      console.log('✅ Modpack removed successfully');
      setShowRemoveDialog(false);
    } catch (error) {
      console.error('❌ Error removing modpack:', error);
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

  return (
    <div className="card hover:bg-dark-700 transition-colors duration-200 cursor-pointer group flex flex-col h-full relative">
      {/* Status Badge - Moved to top right corner */}
      <div className="absolute top-2 right-2 z-10">
        {getServerStatusBadge()}
      </div>

      <div onClick={onSelect} className="flex-1 flex flex-col">
        <div className="space-y-4 flex-1">
          {/* Modpack Icon */}
          <div className="w-full h-32 rounded-lg overflow-hidden bg-dark-700 flex items-center justify-center p-4">
            <img
              src={modpack.logo || modpack.urlIcono}
              alt={displayName}
              className="max-w-full max-h-full object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMzc0MTUxIi8+CjxwYXRoIGQ9Ik0yNCAyNEg0MFY0MEgyNFYyNFoiIGZpbGw9IiM2Mzc1ODMiLz4KPC9zdmc+';
              }}
            />
          </div>

          {/* Modpack Info */}
          <div className="space-y-3 flex-1">
            <h3 className="text-white font-semibold text-lg truncate group-hover:text-lumina-400 transition-colors pr-2">
              {displayName}
            </h3>
            
            <p className="text-dark-300 text-sm line-clamp-2">
              {displayDescription}
            </p>
            
            <div className="flex items-center space-x-4 text-xs text-dark-400">
              <span>v{modpack.version}</span>
              <span>Minecraft {modpack.minecraftVersion}</span>
              <span className="capitalize">{modpack.modloader}</span>
              {modpack.gamemode && (
                <span className="text-lumina-400">{modpack.gamemode}</span>
              )}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {isLoading && state.progress && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-dark-300 mb-1">
              <span className="truncate">
                {state.progress.generalMessage || getStepMessage(state.progress.step) || buttonConfig.text}
              </span>
              <span className="font-mono">{Math.round(state.progress.percentage)}%</span>
            </div>
            <div className="w-full bg-dark-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-lumina-600 to-lumina-500 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${state.progress.percentage}%` }}
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
                      let bulletClass = "w-2 h-2 bg-lumina-600 rounded-full animate-pulse";

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
          <div className="mt-3 p-2 bg-red-600/20 border border-red-600/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-red-400 text-sm">{state.error}</span>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-4 pt-4 border-t border-dark-700">
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              buttonConfig.onClick();
            }}
            disabled={buttonConfig.disabled}
            className={`${buttonConfig.className} flex-1 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <ButtonIcon 
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
            />
            <span>{buttonConfig.text}</span>
          </button>
          
          {/* Open folder button */}
          {['installed', 'outdated', 'error'].includes(state.status) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenInstanceFolder();
              }}
              disabled={isLoading}
              className="btn-secondary px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('modpacks.openFolderTooltip')}
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          )}
          
          {/* Remove button */}
          {['installed', 'outdated', 'error'].includes(state.status) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                console.log('🔴 Remove button clicked for modpack:', modpack.id);
                setShowRemoveDialog(true);
              }}
              disabled={isLoading}
              className="btn-danger px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('modpacks.removeTooltip')}
            >
              <Trash2 className="w-4 h-4" />
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
    </div>
  );
};

export default ModpackCard; 