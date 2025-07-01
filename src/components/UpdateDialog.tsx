import React from 'react';
import { useTranslation } from 'react-i18next';
import { Download, X, AlertCircle, ExternalLink, AlertTriangle } from 'lucide-react';
import { UpdateInfo } from '../services/updateService';

interface UpdateDialogProps {
  updateInfo: UpdateInfo;
  onClose: () => void;
  onDownload: () => void;
  isDownloading?: boolean;
  downloadProgress?: { current: number; total: number };
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({
  updateInfo,
  onClose,
  onDownload,
  isDownloading = false,
  downloadProgress = { current: 0, total: 0 }
}) => {
  const { t } = useTranslation();

  const getPrereleaseTitle = () => {
    if (updateInfo.isPrerelease) {
      const version = updateInfo.latestVersion;
      if (version.includes('alpha')) {
        return t('update.alphaTitle');
      } else if (version.includes('beta')) {
        return t('update.betaTitle');
      } else if (version.includes('rc')) {
        return t('update.rcTitle');
      }
      return t('update.updateAvailable');
    }
    return t('update.updateAvailable');
  };

  const getPrereleaseDescription = () => {
    if (!updateInfo.isPrerelease) return '';
    const version = updateInfo.latestVersion;
    if (version.includes('alpha')) {
      return t('update.alphaDesc');
    } else if (version.includes('beta')) {
      return t('update.betaDesc');
    } else if (version.includes('rc')) {
      return t('update.rcDesc');
    }
    return t('update.prereleaseBanner');
  };

  const getIcon = () => {
    return updateInfo.isPrerelease ? (
      <AlertCircle className="w-6 h-6 text-yellow-400 mr-3" />
    ) : (
      <Download className="w-6 h-6 text-lumina-400 mr-3" />
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-lg p-6 max-w-md w-full mx-4 border border-dark-600">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            {getIcon()}
            <h2 className="text-xl font-semibold text-white">{getPrereleaseTitle()}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-white transition-colors"
            disabled={isDownloading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6">
          {updateInfo.isPrerelease && (
            <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-600 text-yellow-200 rounded-lg flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="text-sm">
                {t('update.prereleaseBanner')}
              </span>
            </div>
          )}
          
          <p className="text-dark-300 mb-4">
            {updateInfo.isPrerelease ? getPrereleaseDescription() : t('update.newVersionDesc')}
          </p>
          
          <div className="bg-dark-700 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-dark-400">{t('update.currentVersion')}</span>
              <span className="text-white font-mono">{updateInfo.currentVersion}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-dark-400">{t('update.latestVersion')}</span>
              <span className="text-lumina-400 font-mono font-semibold">{updateInfo.latestVersion}</span>
            </div>
          </div>

          {updateInfo.releaseNotes && (
            <div className="bg-dark-700 rounded-lg p-4 mb-4">
              <h4 className="text-white font-semibold mb-2">{t('update.whatsNew')}</h4>
              <div className="text-dark-300 text-sm max-h-32 overflow-y-auto">
                {updateInfo.releaseNotes.split('\n').slice(0, 5).map((line, index) => (
                  <p key={index} className="mb-1">{line}</p>
                ))}
              </div>
            </div>
          )}

          <p className="text-dark-400 text-sm">
            {t('update.downloadNote')}
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-dark-700 text-white rounded-lg hover:bg-dark-600 transition-colors"
            disabled={isDownloading}
          >
            {t('update.later')}
          </button>
          <button
            onClick={onDownload}
            disabled={isDownloading}
            className="bg-lumina-600 hover:bg-lumina-700 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center"
          >
            {isDownloading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {downloadProgress.total > 0 ? (
                  <>
                    <span className="text-sm mr-2">
                      {Math.round((downloadProgress.current / downloadProgress.total) * 100)}%
                    </span>
                    <span>Instalando...</span>
                  </>
                ) : (
                  <span>Preparando...</span>
                )}
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {t('update.installUpdate')}
              </>
            )}
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-dark-500 text-xs">
            {t('update.platform', { platform: updateInfo.platform })}
          </p>
          <a 
            href="https://github.com/LuminaKraft/LuminaKraftLauncher/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dark-500 hover:text-lumina-400 text-xs inline-flex items-center mt-1 transition-colors"
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            {t('update.viewOnGithub')}
          </a>
        </div>
      </div>
    </div>
  );
};

export default UpdateDialog; 