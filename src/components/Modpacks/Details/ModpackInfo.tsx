import React from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Cpu, HardDrive, Server } from 'lucide-react';
import type { Modpack } from '../../../types/launcher';
import { useAnimation } from '../../../contexts/AnimationContext';

interface ModpackInfoProps {
  modpack: Modpack;
}

const ModpackInfo: React.FC<ModpackInfoProps> = ({ modpack }) => {
  const { t } = useTranslation();
  const { getAnimationClass, getAnimationStyle } = useAnimation();

  const getModloaderDisplayName = (modloader: string | undefined) => {
    if (!modloader) return 'Unknown';

    const modloaderMappings: { [key: string]: string } = {
      'forge': 'Forge',
      'fabric': 'Fabric',
      'quilt': 'Quilt',
      'neoforge': 'NeoForge',
      'vanilla': 'Vanilla'
    };

    return modloaderMappings[modloader.toLowerCase()] || modloader;
  };

  const isVanillaServer = modpack.modloader?.toLowerCase() === 'vanilla' && modpack.gamemode?.toLowerCase() === 'server';

  return (
    <div className="space-y-6">
      {/* Installation Card */}
      <div
        className={`bg-dark-800 rounded-xl p-6 border border-dark-700 transition-all duration-200 ${getAnimationClass('', 'hover:border-lumina-400/30')
          }`}
        style={{
          animation: 'fadeInUp 0.4s ease-out 0.4s backwards',
          ...getAnimationStyle({})
        }}
      >
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
            <div className="text-right">
              <div className="text-white font-medium">
                {getModloaderDisplayName(modpack.modloader)} {modpack.modloaderVersion && `${modpack.modloaderVersion}`}
              </div>
              <div className="text-sm text-dark-400">Minecraft {modpack.minecraftVersion}</div>
            </div>
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
        <div
          className={`bg-dark-800 rounded-xl p-6 border border-dark-700 transition-all duration-200 ${getAnimationClass('', 'hover:border-lumina-400/30')
            }`}
          style={getAnimationStyle({})}
        >
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
    </div>
  );
};

export default ModpackInfo; 