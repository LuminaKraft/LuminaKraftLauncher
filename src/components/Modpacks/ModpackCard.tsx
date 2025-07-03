import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Play, RefreshCw, Wrench, AlertTriangle, Loader2, Globe, Trash2, FolderOpen } from 'lucide-react';
import type { Modpack, ModpackState, ProgressInfo } from '../../types/launcher';
import { useLauncher } from '../../contexts/LauncherContext';
import { useAnimation } from '../../contexts/AnimationContext';
import ConfirmDialog from '../ConfirmDialog';
import LauncherService from '../../services/launcherService';

interface ModpackCardProps {
  modpack: Modpack;
  state: ModpackState & {
    progress?: ProgressInfo;
  };
  onSelect: () => void;
  index?: number;
}

const ModpackCard: React.FC<ModpackCardProps> = ({ modpack, state, onSelect, index = 0 }) => {
  const { t } = useTranslation();
  const { getAnimationClass, getAnimationStyle } = useAnimation();
  const { installModpack, updateModpack, launchModpack, repairModpack, removeModpack, translations } = useLauncher();
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const getServerStatusBadge = () => {
    if (modpack.isNew) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-600/40 text-green-300 border border-green-600/60">
          {translations?.ui?.status?.new || 'Nuevo'}
        </span>
      );
    }
    if (modpack.isActive) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-600/40 text-green-300 border border-green-600/60">
          {translations?.ui?.status?.active || 'Activo'}
        </span>
      );
    }
    if (modpack.isComingSoon) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-600/40 text-blue-300 border border-blue-600/60">
          {translations?.ui?.status?.coming_soon || 'Próximamente'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-600/40 text-gray-300 border border-gray-600/60">
        {translations?.ui?.status?.inactive || 'Inactivo'}
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
    try {
      setIsRemoving(true);
      console.log('🗑️ Removing modpack:', modpack.id);
      await removeModpack(modpack.id);
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

  // Get a gradient based on modpack primary color or fallback to name hash
  const getModpackGradient = () => {
    if (modpack.primaryColor) {
      // Use primary color if available
      const baseColor = modpack.primaryColor;
      // Create a complementary color by shifting hue
      const rgb = parseInt(baseColor.slice(1), 16);
      const r = (rgb >> 16) & 255;
      const g = (rgb >> 8) & 255;
      const b = rgb & 255;
      
      // Convert to HSL to shift hue
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      
      let h;
      if (max === min) {
        h = 0;
      } else {
        const d = max - min;
        switch (max) {
          case r / 255: h = (g / 255 - b / 255) / d + (g < b ? 6 : 0); break;
          case g / 255: h = (b / 255 - r / 255) / d + 2; break;
          case b / 255: h = (r / 255 - g / 255) / d + 4; break;
          default: h = 0;
        }
        h /= 6;
      }
      
      const hue1 = Math.round(h * 360);
      const hue2 = (hue1 + 60) % 360;
      
      return `linear-gradient(135deg, hsl(${hue1}, 70%, 25%) 0%, hsl(${hue2}, 60%, 15%) 100%)`;
    } else {
      // Fallback to name hash
      const hash = modpack.name.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);
      
      const hue1 = Math.abs(hash) % 360;
      const hue2 = (hue1 + 60) % 360;
      
      return `linear-gradient(135deg, hsl(${hue1}, 70%, 25%) 0%, hsl(${hue2}, 60%, 15%) 100%)`;
    }
  };

  // Special styling for coming soon items
  const isComingSoon = modpack.isComingSoon;
  const cardClasses = `card cursor-pointer group flex flex-col h-full relative ${
    getAnimationClass('hover:bg-dark-700 transition-all duration-200', 'hover:border-lumina-400/40')
  } ${
    isComingSoon 
      ? `border-2 border-blue-500/50 shadow-blue-500/20 shadow-lg ${
          getAnimationClass('', 'hover:border-blue-400/70 hover:shadow-blue-400/30 hover:shadow-xl')
        }` 
      : ''
  }`;

  return (
    <div 
      className={cardClasses}
      style={{
        animation: `fadeInUp 0.4s ease-out ${index * 0.05 + 0.2}s backwards`,
        ...getAnimationStyle({})
      }}
    >
      {/* Status Badge - Top right corner of entire card */}
      <div className="absolute top-2 right-2 z-20 transition-all duration-200">
        {getServerStatusBadge()}
      </div>

      {/* Coming Soon Glow Effect */}
      {isComingSoon && (
        <div className={`absolute inset-0 rounded-lg bg-gradient-to-br from-blue-500/10 via-transparent to-blue-400/5 pointer-events-none ${
          getAnimationClass('', 'animate-pulse')
        }`} />
      )}

      <div onClick={onSelect} className="flex-1 flex flex-col">
        <div className="space-y-4 flex-1">
          {/* Modpack Icon with Gradient Background */}
          <div className="w-full h-32 rounded-lg overflow-hidden flex items-center justify-center p-4 relative group-hover:bg-dark-600 transition-all duration-200"
               style={{ background: getModpackGradient() }}>
            
            {/* Logo */}
            <img
              src={modpack.logo || modpack.urlIcono}
              alt={displayName}
              className={`max-w-full max-h-full object-contain transition-all duration-200 ${
                getAnimationClass('', 'group-hover:scale-105')
              }`}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMzc0MTUxIi8+CjxwYXRoIGQ9Ik0yNCAyNEg0MFY0MEgyNFYyNFoiIGZpbGw9IiM2Mzc1ODMiLz4KPC9zdmc+';
              }}
            />
          </div>

          {/* Modpack Info */}
          <div className="space-y-3 flex-1">
            <h3 className={`text-white font-semibold text-lg truncate transition-colors duration-200 pr-2 ${
              getAnimationClass('', 'group-hover:text-lumina-300')
            }`}>
              {displayName}
            </h3>
            
            <p className={`text-dark-300 text-sm line-clamp-2 transition-colors duration-200 ${
              getAnimationClass('', 'group-hover:text-dark-200')
            }`}>
              {displayDescription}
            </p>
            
            <div className={`flex items-center space-x-3 text-xs text-dark-400 transition-colors duration-200 ${
              getAnimationClass('', 'group-hover:text-dark-300')
            }`}>
              <span className={`bg-dark-700/50 px-2 py-1 rounded-full transition-all duration-200 ${
                getAnimationClass('', 'group-hover:bg-lumina-600/20')
              }`}>
                v{modpack.version}
              </span>
              <span className={`capitalize bg-dark-700/50 px-2 py-1 rounded-full transition-all duration-200 ${
                getAnimationClass('', 'group-hover:bg-lumina-600/20')
              }`}>
                {modpack.modloader} {modpack.minecraftVersion}
              </span>
              {modpack.gamemode && (
                <span className={`text-lumina-400 bg-lumina-600/20 px-2 py-1 rounded-full transition-all duration-200 ${
                  getAnimationClass('', 'group-hover:bg-lumina-600/30')
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
                {state.progress.generalMessage || getStepMessage(state.progress.step) || buttonConfig.text}
              </span>
              <span className="font-mono">{Math.round(state.progress.percentage)}%</span>
            </div>
            <div className="w-full bg-dark-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-lumina-600 to-lumina-500 h-2 rounded-full transition-all duration-300 ease-out"
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
      <div className={`mt-4 pt-4 border-t border-dark-700 transition-colors duration-200 ${
        getAnimationClass('', 'group-hover:border-lumina-400/30')
      }`}>
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