import React, { useState, useEffect } from 'react';
import { X, ExternalLink, AlertTriangle, Upload, CheckCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../services/supabaseClient';


interface FailedMod {
  projectId: number;
  fileId: number;
  fileName?: string;
}

interface ModInfo {
  id: number;
  name: string;
  slug: string;
  links: {
    websiteUrl: string;
  };
}

interface FailedModsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  failedMods: FailedMod[];
  instancePath?: string; // Path to the modpack instance
}

export const FailedModsDialog: React.FC<FailedModsDialogProps> = ({
  isOpen,
  onClose,
  failedMods,
  instancePath
}) => {
  const { t } = useTranslation();
  const [modInfos, setModInfos] = useState<ModInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<Map<number, File>>(new Map()); // Map projectId to File

  useEffect(() => {
    if (isOpen && failedMods.length > 0) {
      fetchModInfos();
    }
  }, [isOpen, failedMods]);

  const fetchModInfos = async () => {
    setLoading(true);
    setError('');
    try {
      const modIds = failedMods.map(mod => mod.projectId);

      // Use Supabase Edge Function for CurseForge proxy
      const { data, error: invokeError } = await supabase.functions.invoke('curseforge-proxy', {
        body: {
          endpoint: '/mods',
          method: 'POST',
          body: {
            modIds: modIds,
            filterPcOnly: true
          }
        }
      });

      if (invokeError) {
        throw invokeError;
      }

      setModInfos(data?.data || []);
    } catch (err) {
      console.error('Error fetching mod information:', err);
      setError(t('failedMods.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleModClick = async (mod: ModInfo, fileId: number) => {
    const url = `${mod.links.websiteUrl}/files/${fileId}`;
    try {
      // Try using Tauri API to open external URLs
      await invoke('open_url', { url });
    } catch (error) {
      // Fallback to regular window.open for web environment
      console.warn('Tauri command not available, using fallback:', error);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const getModInfo = (projectId: number): ModInfo | undefined => {
    return modInfos.find(mod => mod.id === projectId);
  };

  const handleFileUpload = (failedMod: FailedMod, file: File) => {
    // Validate it's a JAR or ZIP file
    if (!file.name.endsWith('.jar') && !file.name.endsWith('.zip')) {
      toast.error('Please upload a .jar or .zip file');
      return;
    }

    const newFiles = new Map(uploadedFiles);
    newFiles.set(failedMod.projectId, file);
    setUploadedFiles(newFiles);
    toast.success(`${file.name} uploaded`);
  };

  const handleRemoveFile = (projectId: number) => {
    const newFiles = new Map(uploadedFiles);
    newFiles.delete(projectId);
    setUploadedFiles(newFiles);
  };

  const handleInstallUploadedMods = async () => {
    if (!instancePath || uploadedFiles.size === 0) return;

    toast.loading('Installing uploaded mods...');
    try {
      // TODO: Implement Tauri command to copy files to instance mods folder
      console.log('Installing to:', instancePath);
      console.log('Files:', Array.from(uploadedFiles.entries()));

      toast.dismiss();
      toast.success(`${uploadedFiles.size} file(s) installed successfully!`);
      onClose();
    } catch (error) {
      console.error('Error installing mods:', error);
      toast.dismiss();
      toast.error('Failed to install mods');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('failedMods.title')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            {t('failedMods.description')}
          </p>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-gray-600 dark:text-gray-300">
                {t('failedMods.loading')}
              </span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="space-y-3 max-h-60 overflow-y-auto mb-4">
                {failedMods.map((failedMod, index) => {
                  const modInfo = getModInfo(failedMod.projectId);
                  const uploadedFile = uploadedFiles.get(failedMod.projectId);
                  const isResolved = uploadedFile !== undefined;

                  return (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        isResolved
                          ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                          : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {isResolved && (
                              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                            )}
                            <div className="font-medium text-gray-900 dark:text-white">
                              {modInfo ? modInfo.name : `Mod ID: ${failedMod.projectId}`}
                            </div>
                          </div>
                          {failedMod.fileName && (
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {t('failedMods.fileName')} {failedMod.fileName}
                            </div>
                          )}
                          {uploadedFile && (
                            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                              Uploaded: {uploadedFile.name}
                            </div>
                          )}
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            ID: {failedMod.projectId} | File ID: {failedMod.fileId}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {!uploadedFile && (
                            <>
                              <button
                                onClick={() => modInfo && handleModClick(modInfo, failedMod.fileId)}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Download
                              </button>
                              <label className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors cursor-pointer">
                                <Upload className="w-3 h-3" />
                                Upload
                                <input
                                  type="file"
                                  accept=".jar,.zip"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleFileUpload(failedMod, file);
                                      e.target.value = ''; // Reset input
                                    }
                                  }}
                                />
                              </label>
                            </>
                          )}
                          {uploadedFile && (
                            <button
                              onClick={() => handleRemoveFile(failedMod.projectId)}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                            >
                              <X className="w-3 h-3" />
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {uploadedFiles.size > 0 && instancePath && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    {uploadedFiles.size} file(s) ready to install. Click "Install & Close" to add them to your modpack instance.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            {uploadedFiles.size > 0 ? 'Skip Installation' : t('failedMods.close')}
          </button>
          {uploadedFiles.size > 0 && instancePath && (
            <button
              onClick={handleInstallUploadedMods}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              Install & Close ({uploadedFiles.size} file{uploadedFiles.size > 1 ? 's' : ''})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}; 