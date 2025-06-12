import React from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, Heart, Globe } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

const AboutPage: React.FC = () => {
  const { t } = useTranslation();
  // Temporalmente removemos hasUpdate y updateUrl hasta implementar la funcionalidad
  const hasUpdate = false;
  const updateUrl = null;

  const handleDownloadUpdate = () => {
    if (updateUrl) {
      window.open(updateUrl, '_blank');
    }
  };

  const handleOpenUrl = async (url: string) => {
    try {
      // Try using Tauri API to open external URLs
      await invoke('open_url', { url });
    } catch (error) {
      // Fallback to regular window.open for web environment
      console.warn('Tauri command not available, using fallback:', error);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-white text-2xl font-bold mb-2">{t('about.title')}</h1>
          <p className="text-dark-400">
            {t('about.description')}
          </p>
        </div>

        <div className="max-w-4xl space-y-8">
          {/* Launcher Info */}
          <div className="card">
            <div className="flex items-start space-x-6">
              <div className="w-20 h-20 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                <img 
                  src="/luminakraft-logo.svg" 
                  alt="LuminaKraft Logo" 
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // Fallback to the original "L" if SVG fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div className="w-full h-full bg-gradient-to-br from-lumina-500 to-lumina-700 rounded-xl flex items-center justify-center" style={{ display: 'none' }}>
                  <span className="text-white font-bold text-2xl">L</span>
                </div>
              </div>
              
              <div className="flex-1">
                <h2 className="text-white text-2xl font-bold mb-2">LuminaKraft Launcher</h2>
                <p className="text-dark-300 mb-4">
                  {t('about.descriptionLong')}
                </p>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-dark-400">{t('about.versionLabel')}</span>
                    <p className="text-white font-mono">{t('about.version', { version: '0.2.1' })}</p>
                  </div>
                  <div>
                    <span className="text-dark-400">{t('about.technologies')}</span>
                    <p className="text-white">{t('about.technologiesValue')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Update Section */}
          {hasUpdate && (
            <div className="card border-yellow-600/30 bg-yellow-600/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-yellow-400 font-semibold text-lg mb-2">
                    {t('about.newUpdate')}
                  </h3>
                  <p className="text-yellow-300">
                    {t('about.newUpdateDesc')}
                  </p>
                </div>
                <button
                  onClick={handleDownloadUpdate}
                  className="btn-warning"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {t('about.download')}
                </button>
              </div>
            </div>
          )}

          {/* Features */}
          <div className="card">
            <h3 className="text-white font-semibold text-xl mb-4">{t('about.features')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-lumina-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">{t('about.feature1')}</p>
                    <p className="text-dark-400 text-sm">{t('about.feature1Desc')}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-lumina-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">{t('about.feature2')}</p>
                    <p className="text-dark-400 text-sm">{t('about.feature2Desc')}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-lumina-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">{t('about.feature3')}</p>
                    <p className="text-dark-400 text-sm">{t('about.feature3Desc')}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-lumina-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">{t('about.feature4')}</p>
                    <p className="text-dark-400 text-sm">{t('about.feature4Desc')}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-lumina-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">{t('about.feature7')}</p>
                    <p className="text-dark-400 text-sm">{t('about.feature7Desc')}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-lumina-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">{t('about.feature9')}</p>
                    <p className="text-dark-400 text-sm">{t('about.feature9Desc')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Credits */}
          <div className="card">
            <h3 className="text-white font-semibold text-xl mb-4">{t('about.credits')}</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-lumina-400 font-medium mb-2">{t('about.developedWith')}</h4>
                <div className="flex items-center space-x-2 text-dark-300">
                  <Heart className="w-4 h-4 text-red-500" />
                  <span>{t('about.byTeam')}</span>
                </div>
              </div>
              
              <div>
                <h4 className="text-lumina-400 font-medium mb-2">{t('about.technologiesUsed')}</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-dark-300">
                  <span>• Tauri (Framework)</span>
                  <span>• React (UI)</span>
                  <span>• TypeScript (Language)</span>
                  <span>• Tailwind CSS (Styles)</span>
                  <span>• Rust (Backend)</span>
                  <span>• Vite (Build Tool)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="card">
            <h3 className="text-white font-semibold text-xl mb-4">{t('about.links')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => handleOpenUrl('https://luminakraft.com')}
                className="flex items-center space-x-3 p-3 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors group w-full text-left"
              >
                <Globe className="w-5 h-5 text-lumina-500" />
                <div className="flex-1">
                  <p className="text-white font-medium group-hover:text-lumina-400 transition-colors">
                    {t('about.officialWebsite')}
                  </p>
                  <p className="text-dark-400 text-sm">luminakraft.com</p>
                </div>
                <ExternalLink className="w-4 h-4 text-dark-400" />
              </button>
              
              <button
                onClick={() => handleOpenUrl('https://discord.gg/UJZRrcUFMj')}
                className="flex items-center space-x-3 p-3 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors group w-full text-left"
              >
                <div className="w-5 h-5 bg-indigo-500 rounded flex items-center justify-center">
                  <span className="text-white text-xs font-bold">D</span>
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium group-hover:text-lumina-400 transition-colors">
                    {t('about.discord')}
                  </p>
                  <p className="text-dark-400 text-sm">{t('about.joinCommunity')}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-dark-400" />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center py-8">
            <p className="text-dark-400 text-sm">
              {t('about.copyright')}
            </p>
            <p className="text-dark-500 text-xs mt-1">
              {t('about.minecraftTrademark')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage; 