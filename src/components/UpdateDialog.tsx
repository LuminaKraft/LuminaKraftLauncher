import React, { useState } from 'react';
import { Download, X, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { UpdateInfo } from '../services/updateService';

interface UpdateDialogProps {
  updateInfo: UpdateInfo;
  onClose: () => void;
  onInstall: () => void;
  isInstalling?: boolean;
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({
  updateInfo,
  onClose,
  onInstall,
  isInstalling = false
}) => {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleInstall = async () => {
    setMessage(null);
    try {
      await onInstall();
      setMessage({ type: 'success', text: 'Update installed successfully! App will restart...' });
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to install update' 
      });
    }
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-lg p-6 max-w-md w-full mx-4 border border-dark-600">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <RefreshCw className="w-6 h-6 text-lumina-500 mr-2" />
            <h2 className="text-xl font-semibold text-white">Update Available</h2>
          </div>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-white transition-colors"
            disabled={isInstalling}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-dark-300 mb-4">
            A new version of LuminaKraft Launcher is available!
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

          <p className="text-dark-400 text-sm">
            The update will be downloaded and installed automatically. The app will restart when complete.
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
            disabled={isInstalling}
          >
            Later
          </button>
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className="flex-1 px-4 py-2 bg-lumina-600 text-white rounded-lg hover:bg-lumina-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isInstalling ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Install Update
              </>
            )}
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-dark-500 text-xs">
            Platform: {updateInfo.platform}
          </p>
        </div>
      </div>
    </div>
  );
};

export default UpdateDialog; 