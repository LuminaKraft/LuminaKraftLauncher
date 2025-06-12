import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Calendar, Package, Cpu, HardDrive, Users, Globe, Star, Image } from 'lucide-react';
import type { Modpack, ModpackState } from '../../types/launcher';
import { useLauncher } from '../../contexts/LauncherContext';
import ModpackCard from './ModpackCard';

interface ModpackDetailsProps {
  modpack: Modpack;
  state: ModpackState;
  onBack: () => void;
}

const ModpackDetails: React.FC<ModpackDetailsProps> = ({ modpack, state, onBack }) => {
  const { t } = useTranslation();
  const { translations } = useLauncher();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const formatChangelog = (changelog: string) => {
    return changelog.split('\n').map((line, index) => {
      if (line.trim() === '') return <br key={index} />;
      
      // Check if line starts with version (e.g., "v1.2.3:")
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
      
      // Regular changelog line
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
        case 'forge':
          return 'Minecraft Forge';
        case 'fabric':
          return 'Fabric';
        case 'neoforge':
          return 'NeoForge';
        case 'paper':
          return 'Paper';
        case 'vanilla':
          return 'Vanilla';
        default:
          return modloader;
      }
    })();
  };

  const getServerStatusInfo = () => {
    if (modpack.isNew) {
      return { text: translations?.ui.status.new || 'Nuevo', color: 'text-green-400', emoji: '✨' };
    }
    if (modpack.isActive) {
      return { text: translations?.ui.status.active || 'Activo', color: 'text-green-400', emoji: '🟢' };
    }
    if (modpack.isComingSoon) {
      return { text: translations?.ui.status.coming_soon || 'Próximamente', color: 'text-yellow-400', emoji: '🔜' };
    }
    return { text: translations?.ui.status.inactive || 'Inactivo', color: 'text-gray-400', emoji: '💤' };
  };

  // Obtener traducciones del modpack
  const modpackTranslations = state.translations;
  const displayName = modpackTranslations?.name || modpack.name;
  const displayDescription = modpackTranslations?.description || t('modpacks.descriptionNotAvailable');
  const features = state.features || [];
  const statusInfo = getServerStatusInfo();
  const isVanillaServer = modpack.modloader === 'vanilla' || modpack.modloader === 'paper';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-dark-700">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-dark-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('navigation.backToList')}</span>
        </button>
        
        <div className="flex items-start space-x-6">
          <div className="w-24 h-24 rounded-lg overflow-hidden bg-dark-700 flex-shrink-0">
            <img
              src={modpack.logo || modpack.urlIcono}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHZpZXdCb3g9IjAgMCA5NiA5NiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9Ijk2IiBoZWlnaHQ9Ijk2IiBmaWxsPSIjMzc0MTUxIi8+CjxwYXRoIGQ9Ik0zNiAzNkg2MFY2MEgzNlYzNloiIGZpbGw9IiM2Mzc1ODMiLz4KPC9zdmc+';
              }}
            />
          </div>
          
          <div className="flex-1">
            <div className="flex items-start justify-between mb-2">
              <h1 className="text-white text-3xl font-bold">{displayName}</h1>
              <span className={`flex items-center space-x-1 ${statusInfo.color} font-medium`}>
                <span>{statusInfo.emoji}</span>
                <span>{statusInfo.text}</span>
              </span>
            </div>
            
            <p className="text-dark-300 text-lg mb-4">{displayDescription}</p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center space-x-2 text-dark-400">
                <Package className="w-4 h-4" />
                <span>v{modpack.version}</span>
              </div>
              <div className="flex items-center space-x-2 text-dark-400">
                <HardDrive className="w-4 h-4" />
                <span>Minecraft {modpack.minecraftVersion}</span>
              </div>
              <div className="flex items-center space-x-2 text-dark-400">
                <Cpu className="w-4 h-4" />
                <span>{getModloaderDisplayName(modpack.modloader)}</span>
              </div>
              {modpack.gamemode && (
                <div className="flex items-center space-x-2 text-dark-400">
                  <Star className="w-4 h-4" />
                  <span>{modpack.gamemode}</span>
                </div>
              )}
            </div>

            {/* IP del servidor para vanilla/paper */}
            {isVanillaServer && modpack.ip && (
              <div className="mt-4 p-3 bg-dark-700 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Globe className="w-4 h-4 text-lumina-400" />
                  <span className="text-white font-medium">{t('modpacks.serverIPLabel')}</span>
                  <code className="text-lumina-400 bg-dark-800 px-2 py-1 rounded text-sm">{modpack.ip}</code>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
          {/* Left Column */}
          <div className="lg:col-span-1 space-y-6">
            {/* Action Card */}
            <div className="card">
              <h3 className="text-white font-semibold text-lg mb-4">{t('modpacks.actions')}</h3>
              <ModpackCard
                modpack={modpack}
                state={state}
                onSelect={() => {}} // No action needed in details view
              />
            </div>

            {/* System Requirements */}
            <div className="card">
              <h3 className="text-white font-semibold text-lg mb-4">{t('modpacks.requirements')}</h3>
              <div className="space-y-3">
                <div>
                  <span className="text-dark-400 text-sm">{t('modpacks.recommendedRAM')}</span>
                  <p className="text-white">{t('modpacks.ramMinRecommended', { min: 4, recommended: 8 })}</p>
                </div>
                {modpack.jvmArgsRecomendados && (
                  <div>
                    <span className="text-dark-400 text-sm">{t('modpacks.recommendedJVMArgs')}</span>
                    <p className="text-white text-xs bg-dark-700 p-2 rounded mt-1 font-mono break-all">
                      {modpack.jvmArgsRecomendados}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Collaborators */}
            {modpack.collaborators && modpack.collaborators.length > 0 && (
              <div className="card">
                <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
                  <Users className="w-5 h-5" />
                  <span>{t('modpacks.contributors')}</span>
                </h3>
                <div className="space-y-3">
                  {modpack.collaborators.map((collaborator, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-dark-700 flex-shrink-0">
                        <img
                          src={collaborator.logo}
                          alt={collaborator.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSIjMzc0MTUxIi8+CjxjaXJjbGUgY3g9IjE2IiBjeT0iMTYiIHI9IjgiIGZpbGw9IiM2Mzc1ODMiLz4KPC9zdmc+';
                          }}
                        />
                      </div>
                      <span className="text-white text-sm">{collaborator.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image Gallery */}
            {modpack.images && modpack.images.length > 0 && (
              <div className="card">
                <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
                  <Image className="w-5 h-5" />
                  <span>{t('modpacks.gallery')}</span>
                </h3>
                
                <div className="space-y-4">
                  {/* Main Image */}
                  <div className="aspect-video rounded-lg overflow-hidden bg-dark-700">
                    <img
                      src={modpack.images[selectedImageIndex]}
                      alt={t('modpacks.imageGallery', { index: selectedImageIndex + 1, total: modpack.images.length })}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </div>
                  
                  {/* Thumbnail Navigation */}
                  {modpack.images.length > 1 && (
                    <div className="flex space-x-2 overflow-x-auto">
                      {modpack.images.map((image, index) => (
                        <button
                          key={index}
                          onClick={() => setSelectedImageIndex(index)}
                          className={`w-20 h-12 rounded overflow-hidden flex-shrink-0 ${
                            selectedImageIndex === index 
                              ? 'ring-2 ring-lumina-500' 
                              : 'opacity-60 hover:opacity-100'
                          } transition-all`}
                        >
                          <img
                            src={image}
                            alt={`Thumbnail ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Features */}
            {features.length > 0 && (
              <div className="card">
                <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
                  <Star className="w-5 h-5" />
                  <span>{t('modpacks.features')}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {features.map((feature, index) => (
                    <div key={index} className="p-4 bg-dark-700 rounded-lg">
                      <h4 className="text-lumina-400 font-medium mb-2">{feature.title}</h4>
                      <p className="text-dark-300 text-sm">{feature.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Multimedia Content */}
            {(modpack.youtubeEmbed || modpack.tiktokEmbed) && (
              <div className="card">
                <h3 className="text-white font-semibold text-lg mb-4">{t('modpacks.multimedia')}</h3>
                <div className="space-y-4">
                  {modpack.youtubeEmbed && (
                    <div className="aspect-video rounded-lg overflow-hidden">
                      <iframe
                        src={modpack.youtubeEmbed}
                        title="YouTube video"
                        className="w-full h-full"
                        allowFullScreen
                      />
                    </div>
                  )}
                  {modpack.tiktokEmbed && (
                    <div className="flex justify-center">
                      <blockquote
                        className="tiktok-embed"
                        cite={`https://www.tiktok.com/@user/video/${modpack.tiktokEmbed}`}
                        data-video-id={modpack.tiktokEmbed}
                      >
                        <section>
                          <a
                            target="_blank"
                            rel="noopener"
                            title={displayName}
                            href={`https://www.tiktok.com/@user/video/${modpack.tiktokEmbed}`}
                          >
                            {t('modpacks.viewOnTikTok')}
                          </a>
                        </section>
                      </blockquote>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Changelog */}
            <div className="card">
              <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
                <Calendar className="w-5 h-5" />
                <span>{t('modpacks.changelog')}</span>
              </h3>
              <div className="max-h-96 overflow-y-auto">
                {modpack.changelog ? (
                  <div className="space-y-2">
                    {formatChangelog(modpack.changelog)}
                  </div>
                ) : (
                  <p className="text-dark-400 italic">
                    {t('modpacks.noChangelogAvailable')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModpackDetails; 