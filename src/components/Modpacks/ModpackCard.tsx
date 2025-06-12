import React from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Play, RefreshCw, Wrench, AlertTriangle, Loader2, Globe, Copy } from 'lucide-react';
import type { Modpack, ModpackState } from '../../types/launcher';
import { useLauncher } from '../../contexts/LauncherContext';

interface ModpackCardProps {
  modpack: Modpack;
  state: ModpackState;
  onSelect: () => void;
}

const ModpackCard: React.FC<ModpackCardProps> = ({ modpack, state, onSelect }) => {
  const { t } = useTranslation();
  const { installModpack, updateModpack, launchModpack, repairModpack, translations } = useLauncher();

  const getServerStatusBadge = () => {
    if (modpack.isNew) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-600/20 text-green-400 border border-green-600/30">
          ✨ {translations?.ui.status.new || 'Nuevo'}
        </span>
      );
    }
    if (modpack.isActive) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-600/20 text-green-400 border border-green-600/30">
          🟢 {translations?.ui.status.active || 'Activo'}
        </span>
      );
    }
    if (modpack.isComingSoon) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-600/20 text-yellow-400 border border-yellow-600/30">
          🔜 {translations?.ui.status.coming_soon || 'Próximamente'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-600/20 text-gray-400 border border-gray-600/30">
        💤 {translations?.ui.status.inactive || 'Inactivo'}
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
    // Si es un servidor vanilla/paper con IP, mostrar botón de conectar
    if (isVanillaServer && modpack.ip) {
      return {
        text: `${t('modpacks.connect')} (${modpack.ip})`,
        icon: Globe,
        onClick: () => copyToClipboard(modpack.ip!),
        className: 'btn-secondary',
        disabled: false
      };
    }

    // Si no tiene modpack para descargar y no es servidor vanilla, deshabilitar
    if (!requiresModpack && !modpack.ip) {
      return {
        text: t('modpacks.notAvailable'),
        icon: AlertTriangle,
        onClick: () => {},
        className: 'btn-secondary',
        disabled: true
      };
    }

    // Lógica normal para modpacks que requieren instalación
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

  // Obtener traducciones del modpack
  const modpackTranslations = state.translations;
  const displayName = modpackTranslations?.name || modpack.name;
  const displayDescription = modpackTranslations?.shortDescription || modpackTranslations?.description || t('modpacks.description');

  return (
    <div className="card hover:bg-dark-700 transition-colors duration-200 cursor-pointer group">
      <div onClick={onSelect} className="flex-1">
        <div className="flex items-start space-x-4">
          {/* Modpack Icon */}
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-dark-700 flex-shrink-0">
            <img
              src={modpack.logo || modpack.urlIcono}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMzc0MTUxIi8+CjxwYXRoIGQ9Ik0yNCAyNEg0MFY0MEgyNFYyNFoiIGZpbGw9IiM2Mzc1ODMiLz4KPC9zdmc+';
              }}
            />
          </div>

          {/* Modpack Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <h3 className="text-white font-semibold text-lg truncate group-hover:text-lumina-400 transition-colors pr-2">
                {displayName}
              </h3>
              {getServerStatusBadge()}
            </div>
            
            <p className="text-dark-300 text-sm mt-1 line-clamp-2">
              {displayDescription}
            </p>
            
            <div className="flex items-center space-x-4 mt-3 text-xs text-dark-400">
              <span>v{modpack.version}</span>
              <span>Minecraft {modpack.minecraftVersion}</span>
              <span className="capitalize">{modpack.modloader}</span>
              {modpack.gamemode && (
                <span className="text-lumina-400">{modpack.gamemode}</span>
              )}
            </div>

            {/* IP del servidor para vanilla/paper */}
            {isVanillaServer && modpack.ip && (
              <div className="mt-2 flex items-center space-x-2">
                <span className="text-xs text-dark-400">{t('modpacks.serverIP')}</span>
                <code className="text-xs bg-dark-700 px-2 py-1 rounded text-lumina-400">{modpack.ip}</code>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(modpack.ip!);
                  }}
                  className="text-dark-400 hover:text-lumina-400 transition-colors"
                  title={t('modpacks.copyIP')}
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {isLoading && state.progress && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-dark-300 mb-1">
              <span className="truncate">{buttonConfig.text}</span>
              <span className="font-mono">{Math.round(state.progress.percentage)}%</span>
            </div>
            <div className="w-full bg-dark-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-lumina-600 to-lumina-500 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${state.progress.percentage}%` }}
              />
            </div>
            {/* Progress details */}
            {state.progress.currentFile && (
              <div className="mt-2 text-xs text-dark-400">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-lumina-600 rounded-full animate-pulse"></div>
                  <span className="truncate">{state.progress.currentFile}</span>
                </div>
              </div>
            )}
            {/* Speed and ETA */}
            <div className="mt-1 flex justify-between text-xs text-dark-500">
              {state.progress.downloadSpeed && (
                <span>⚡ {state.progress.downloadSpeed}</span>
              )}
              {state.progress.eta && (
                <span>⏱️ {state.progress.eta}</span>
              )}
            </div>
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

      {/* Action Button */}
      <div className="mt-4 pt-4 border-t border-dark-700">
        <button
          onClick={(e) => {
            e.stopPropagation();
            buttonConfig.onClick();
          }}
          disabled={buttonConfig.disabled}
          className={`${buttonConfig.className} w-full flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <ButtonIcon 
            className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
          />
          <span>{buttonConfig.text}</span>
        </button>
      </div>
    </div>
  );
};

export default ModpackCard; 