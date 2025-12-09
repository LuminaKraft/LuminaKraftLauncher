import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, Heart, Globe, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { updateService, UpdateInfo } from '../../services/updateService';

const AboutPage: React.FC = () => {
  const { t } = useTranslation();
  // Version is automatically updated by release.js
  const currentVersion = "0.0.9-alpha.2";
  const [loadedVersion, setLoadedVersion] = useState<string>(currentVersion);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  useEffect(() => {
    // Load current version and cached update info on component mount
    const loadInitialData = async () => {
      try {
        const version = await invoke<string>('get_launcher_version');
        setLoadedVersion(version);

        // Check for cached update info
        const cached = updateService.getCachedUpdateInfo();
        if (cached) {
          setUpdateInfo(cached);
        }
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };

    loadInitialData();
  }, []);

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);

    try {
      const info = await updateService.checkForUpdates();
      setUpdateInfo(info);
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setUpdateError('Failed to check for updates');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!updateInfo?.hasUpdate) return;

    setIsDownloadingUpdate(true);
    setUpdateError(null);

    try {
      await updateService.downloadAndInstallUpdate((progress, total) => {
        setDownloadProgress({ current: progress, total });
      });
    } catch (error) {
      console.error('Failed to download and install update:', error);
      setUpdateError('Failed to download and install update automatically');
    } finally {
      setIsDownloadingUpdate(false);
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

        <div className="space-y-8">
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
                    <p className="text-white font-mono">{t('about.version', { version: loadedVersion })}</p>
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
          <div className="card">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-white font-semibold text-lg mb-2">{t('about.updates')}</h3>
                {isCheckingUpdate ? (
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="w-4 h-4 text-lumina-500 animate-spin" />
                    <p className="text-dark-300">{t('about.checkingUpdates')}</p>
                  </div>
                ) : updateError ? (
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <p className="text-red-400">{updateError}</p>
                  </div>
                ) : updateInfo ? (
                  updateInfo.hasUpdate ? (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Download className="w-4 h-4 text-yellow-500" />
                        <p className="text-yellow-400">{t('about.updateAvailable', { version: updateInfo.latestVersion })}</p>
                      </div>
                      <p className="text-dark-300 text-sm">{t('about.newUpdateDesc')}</p>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <p className="text-green-400">{t('about.upToDate')}</p>
                    </div>
                  )
                ) : (
                  <p className="text-dark-300">{t('about.checkingUpdates')}</p>
                )}
              </div>
              <div className="flex space-x-2">
                {updateInfo?.hasUpdate && (
                  <button
                    onClick={handleDownloadUpdate}
                    disabled={isDownloadingUpdate}
                    className="inline-flex items-center px-4 py-2 bg-lumina-600 hover:bg-lumina-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    {isDownloadingUpdate ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        {downloadProgress.total > 0 && (
                          <span className="text-sm">
                            {Math.round((downloadProgress.current / downloadProgress.total) * 100)}%
                          </span>
                        )}
                        <span className="ml-2">{t('progress.installing')}</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        {t('about.installUpdate')}
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={handleCheckForUpdates}
                  disabled={isCheckingUpdate}
                  className="btn-secondary inline-flex items-center space-x-2"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                  {isCheckingUpdate ? t('about.checkingUpdates') : t('about.checkUpdates')}
                </button>
              </div>
            </div>
          </div>

          {/* Support Us */}
          <div className="card bg-gradient-to-r from-lumina-900/30 to-purple-900/30 border-lumina-500/30">
            <div className="flex items-center space-x-3 mb-4">
              <Heart className="w-6 h-6 text-pink-500" />
              <h3 className="text-white font-semibold text-xl">{t('about.supportUs')}</h3>
            </div>
            <p className="text-dark-300 mb-4">
              {t('about.supportDescription')}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleOpenUrl('https://www.paypal.com/donate/?hosted_button_id=99GHNYAKDZQGU')}
                className="inline-flex items-center px-4 py-2.5 bg-[#0070ba] hover:bg-[#005ea6] text-white rounded-lg font-medium transition-colors"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z" />
                </svg>
                {t('about.donatePaypal')}
              </button>
            </div>
          </div>

          {/* Features */}
          <div className="card">
            <h3 className="text-white font-semibold text-xl mb-4">{t('about.features')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <Download className="w-5 h-5 text-lumina-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">{t('about.feature1')}</p>
                    <p className="text-dark-400 text-sm">{t('about.feature1Desc')}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <RefreshCw className="w-5 h-5 text-lumina-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">{t('about.feature2')}</p>
                    <p className="text-dark-400 text-sm">{t('about.feature2Desc')}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Globe className="w-5 h-5 text-lumina-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">{t('about.feature3')}</p>
                    <p className="text-dark-400 text-sm">{t('about.feature3Desc')}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <Heart className="w-5 h-5 text-lumina-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">{t('about.feature4')}</p>
                    <p className="text-dark-400 text-sm">{t('about.feature4Desc')}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-lumina-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">{t('about.feature7')}</p>
                    <p className="text-dark-400 text-sm">{t('about.feature7Desc')}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <ExternalLink className="w-5 h-5 text-lumina-500 mt-0.5 flex-shrink-0" />
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