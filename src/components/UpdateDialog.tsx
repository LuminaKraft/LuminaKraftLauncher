import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, X, RefreshCw, AlertCircle, CheckCircle, ExternalLink, AlertTriangle } from 'lucide-react';
import { UpdateInfo } from '../services/updateService';

interface UpdateDialogProps {
  updateInfo: UpdateInfo;
  onClose: () => void;
  onDownload: () => void;
  isDownloading?: boolean;
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({
  updateInfo,
  onClose,
  onDownload,
  isDownloading = false
}) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDownload = async () => {
    setMessage(null);
    try {
      await onDownload();
      setMessage({ type: 'success', text: 'Download started! Check your browser downloads.' });
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: 'Failed to open download. Please try again or download manually from GitHub.' 
      });
    }
  };

  const getTitle = () => {
    return updateInfo.isPrerelease ? t('about.prereleaseUpdate') : 'Update Available';
  };

  const getIcon = () => {
    return updateInfo.isPrerelease ? (
      <AlertTriangle className="w-6 h-6 text-yellow-500 mr-2" />
    ) : (
      <RefreshCw className="w-6 h-6 text-lumina-500 mr-2" />
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-lg p-6 max-w-md w-full mx-4 border border-dark-600">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            {getIcon()}
            <h2 className="text-xl font-semibold text-white">{getTitle()}</h2>
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
              <span className="text-sm">{t('about.prereleaseWarning')}</span>
            </div>
          )}
          
          <p className="text-dark-300 mb-4">
            {updateInfo.isPrerelease ? t('about.prereleaseUpdateDesc') : 'A new version of LuminaKraft Launcher is available!'}
          </p>
          
          <div className="bg-dark-700 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-dark-400">Current Version:</span>
              <span className="text-white font-mono">{updateInfo.currentVersion}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-dark-400">Latest Version:</span>
              <span className="text-lumina-400 font-mono font-semibold">{updateInfo.latestVersion}</span>
            </div>
          </div>

          {updateInfo.releaseNotes && (
            <div className="bg-dark-700 rounded-lg p-4 mb-4">
              <h4 className="text-white font-semibold mb-2">What's New:</h4>
              <div className="text-dark-300 text-sm max-h-32 overflow-y-auto">
                {updateInfo.releaseNotes.split('\n').slice(0, 5).map((line, index) => (
                  <p key={index} className="mb-1">{line}</p>
                ))}
              </div>
            </div>
          )}

          <p className="text-dark-400 text-sm">
            Click "Download Update" to open the download page in your browser.
          </p>
        </div>

        {/* Message display */}
        {message && (
          <div className={`p-3 rounded-lg mb-4 flex items-center ${
            message.type === 'success' 
              ? 'bg-green-900/30 border border-green-600 text-green-200' 
              : 'bg-red-900/30 border border-red-600 text-red-200'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            )}
            <span className="text-sm">{message.text}</span>
          </div>
        )}

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-dark-700 text-white rounded-lg hover:bg-dark-600 transition-colors"
            disabled={isDownloading}
          >
            Later
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading || !updateInfo.downloadUrl}
            className="flex-1 px-4 py-2 bg-lumina-600 text-white rounded-lg hover:bg-lumina-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isDownloading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Opening...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download Update
              </>
            )}
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-dark-500 text-xs">
            Platform: {updateInfo.platform}
          </p>
          <a 
            href="https://github.com/kristiangarcia/luminakraft-launcher/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dark-500 hover:text-lumina-400 text-xs inline-flex items-center mt-1 transition-colors"
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  );
};

export default UpdateDialog; 