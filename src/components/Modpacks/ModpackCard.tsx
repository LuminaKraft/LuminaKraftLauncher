import React from 'react';
import { Download, Play, RefreshCw, Wrench, AlertTriangle, Loader2 } from 'lucide-react';
import type { Modpack, ModpackState } from '../../types/launcher';
import { useLauncher } from '../../contexts/LauncherContext';

interface ModpackCardProps {
  modpack: Modpack;
  state: ModpackState;
  onSelect: () => void;
}

const ModpackCard: React.FC<ModpackCardProps> = ({ modpack, state, onSelect }) => {
  const { installModpack, updateModpack, launchModpack, repairModpack } = useLauncher();

  const getButtonConfig = () => {
    switch (state.status) {
      case 'not_installed':
        return {
          text: 'Instalar',
          icon: Download,
          onClick: () => installModpack(modpack.id),
          className: 'btn-primary',
          disabled: false
        };
      case 'installed':
        return {
          text: 'Jugar',
          icon: Play,
          onClick: () => launchModpack(modpack.id),
          className: 'btn-success',
          disabled: false
        };
      case 'outdated':
        return {
          text: 'Actualizar',
          icon: RefreshCw,
          onClick: () => updateModpack(modpack.id),
          className: 'btn-warning',
          disabled: false
        };
      case 'installing':
      case 'updating':
        return {
          text: state.status === 'installing' ? 'Instalando...' : 'Actualizando...',
          icon: Loader2,
          onClick: () => {},
          className: 'btn-secondary',
          disabled: true
        };
      case 'launching':
        return {
          text: 'Lanzando...',
          icon: Loader2,
          onClick: () => {},
          className: 'btn-success',
          disabled: true
        };
      case 'error':
        return {
          text: 'Reparar',
          icon: Wrench,
          onClick: () => repairModpack(modpack.id),
          className: 'btn-warning',
          disabled: false
        };
      default:
        return {
          text: 'Instalar',
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

  return (
    <div className="card hover:bg-dark-700 transition-colors duration-200 cursor-pointer group">
      <div onClick={onSelect} className="flex-1">
        <div className="flex items-start space-x-4">
          {/* Modpack Icon */}
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-dark-700 flex-shrink-0">
            <img
              src={modpack.urlIcono}
              alt={modpack.nombre}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMzc0MTUxIi8+CjxwYXRoIGQ9Ik0yNCAyNEg0MFY0MEgyNFYyNFoiIGZpbGw9IiM2Mzc1ODMiLz4KPC9zdmc+';
              }}
            />
          </div>

          {/* Modpack Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-lg truncate group-hover:text-lumina-400 transition-colors">
              {modpack.nombre}
            </h3>
            <p className="text-dark-300 text-sm mt-1 line-clamp-2">
              {modpack.descripcion}
            </p>
            <div className="flex items-center space-x-4 mt-3 text-xs text-dark-400">
              <span>v{modpack.version}</span>
              <span>Minecraft {modpack.minecraftVersion}</span>
              <span className="capitalize">{modpack.modloader}</span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {isLoading && state.progress && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-dark-300 mb-1">
              <span>{buttonConfig.text}</span>
              <span>{Math.round(state.progress.percentage)}%</span>
            </div>
            <div className="w-full bg-dark-700 rounded-full h-2">
              <div
                className="bg-lumina-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${state.progress.percentage}%` }}
              />
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