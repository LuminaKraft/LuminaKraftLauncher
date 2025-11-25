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
  const [isDragging, setIsDragging] = useState(false);

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

  const handleBulkFileUpload = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(f => f.name.endsWith('.jar') || f.name.endsWith('.zip'));

    if (validFiles.length === 0) {
      toast.error('No valid .jar or .zip files found');
      return;
    }

    const newFiles = new Map(uploadedFiles);
    let matchedCount = 0;

    // Try to match each file with a failed mod by filename
    validFiles.forEach(file => {
      const matchingMod = failedMods.find(mod => {
        // Try exact match with fileName if available
        if (mod.fileName && mod.fileName.toLowerCase() === file.name.toLowerCase()) return true;
        // Try without extension
        if (mod.fileName) {
          const modNameWithoutExt = mod.fileName.replace(/\.(jar|zip)$/i, '');
          const fileNameWithoutExt = file.name.replace(/\.(jar|zip)$/i, '');
          return modNameWithoutExt.toLowerCase() === fileNameWithoutExt.toLowerCase();
        }
        return false;
      });

      if (matchingMod) {
        newFiles.set(matchingMod.projectId, file);
        matchedCount++;
      }
    });

    setUploadedFiles(newFiles);

    if (matchedCount > 0) {
      toast.success(`${matchedCount} file(s) matched and uploaded`);
    }
    if (validFiles.length > matchedCount) {
      toast.error(`${validFiles.length - matchedCount} file(s) could not be matched`);
    }
  };

  const handleRemoveFile = (projectId: number) => {
    const newFiles = new Map(uploadedFiles);
    newFiles.delete(projectId);
    setUploadedFiles(newFiles);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleBulkFileUpload(files);
    }
  };

  const handleInstallUploadedMods = async () => {
    if (!instancePath || uploadedFiles.size === 0) return;

    const loadingToast = toast.loading('Installing uploaded mods...');
    try {
      // Write files to temporary directory first, then call Tauri command
      const { writeFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
      const { appDataDir, join } = await import('@tauri-apps/api/path');

      const tempDir = await join(await appDataDir(), 'temp', 'uploaded_mods');

      // Create directory if it doesn't exist
      if (!(await exists(tempDir))) {
        await mkdir(tempDir, { recursive: true });
      }

      const filePaths: string[] = [];

      // Write each file to temp directory
      for (const file of uploadedFiles.values()) {
        const buffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);
        const tempFilePath = await join(tempDir, file.name);

        await writeFile(tempFilePath, uint8Array);
        filePaths.push(tempFilePath);
      }

      // Extract modpack ID from instancePath (format: .../instances/{modpackId}/.minecraft)
      const pathParts = instancePath.split('/');
      const instancesIndex = pathParts.indexOf('instances');
      const modpackId = pathParts[instancesIndex + 1];

      // Call Tauri command to copy files to instance
      await invoke('add_mods_to_instance', {
        modpackId,
        filePaths
      });

      toast.success(`${uploadedFiles.size} file(s) installed successfully!`, { id: loadingToast });
      onClose();
    } catch (error) {
      console.error('Error installing mods:', error);
      toast.error('Failed to install mods', { id: loadingToast });
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
              {/* Bulk Upload / Drag & Drop Zone */}
              {failedMods.length > 0 && failedMods.some(mod => !uploadedFiles.has(mod.projectId)) && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`mb-4 border-2 border-dashed rounded-lg p-4 text-center transition-all ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-gray-400" />
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Drop all files here or click to browse
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      Files will be automatically matched by name ({failedMods.length - uploadedFiles.size} remaining)
                    </p>
                    <label className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors cursor-pointer">
                      Select Multiple Files
                      <input
                        type="file"
                        multiple
                        accept=".jar,.zip"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            handleBulkFileUpload(e.target.files);
                            e.target.value = ''; // Reset input
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}

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