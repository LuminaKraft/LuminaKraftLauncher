import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertTriangle, CheckCircle, ExternalLink, FileArchive, Package, Upload } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { createPortal } from 'react-dom';
import { ModFileInfo } from '../../services/modpackValidationService';

interface ModpackValidationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: (_uploadedFiles?: Map<string, File>) => void;
  modpackName: string;
  modsWithoutUrl: ModFileInfo[];
  modsInOverrides: string[];
}

export const ModpackValidationDialog: React.FC<ModpackValidationDialogProps> = ({
  isOpen,
  onClose,
  onContinue,
  modpackName,
  modsWithoutUrl,
  modsInOverrides
}) => {
  const { t } = useTranslation();
  const [uploadedFiles, setUploadedFiles] = useState<Map<string, File>>(new Map());
  const [isDragging, setIsDragging] = useState(false);

  const missingMods = modsWithoutUrl.filter(
    mod => !modsInOverrides.includes(mod.fileName)
  );

  const canContinue = missingMods.length === 0 || missingMods.every(mod => uploadedFiles.has(mod.fileName));

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

  const handleFileUpload = (mod: ModFileInfo, file: File) => {
    // Validate it's a JAR or ZIP file
    if (!file.name.endsWith('.jar') && !file.name.endsWith('.zip')) {
      toast.error(t('publishModpack.validation.invalidFileType'));
      return;
    }

    // Validate filename matches (exact or without extension)
    const modNameWithoutExt = mod.fileName.replace(/\.(jar|zip)$/i, '');
    const fileNameWithoutExt = file.name.replace(/\.(jar|zip)$/i, '');
    const isExactMatch = mod.fileName.toLowerCase() === file.name.toLowerCase();
    const isNameMatch = modNameWithoutExt.toLowerCase() === fileNameWithoutExt.toLowerCase();

    if (!isExactMatch && !isNameMatch) {
      toast.error(t('publishModpack.validation.filenameMismatch', {
        expected: mod.fileName,
        got: file.name
      }));
      return;
    }

    const newFiles = new Map(uploadedFiles);
    newFiles.set(mod.fileName, file);
    setUploadedFiles(newFiles);
  };

  const handleBulkFileUpload = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(f => f.name.endsWith('.jar') || f.name.endsWith('.zip'));

    if (validFiles.length === 0) {
      toast.error(t('publishModpack.validation.noValidFiles'));
      return;
    }

    const newFiles = new Map(uploadedFiles);
    let matchedCount = 0;

    // Try to match each file with a missing mod by filename
    validFiles.forEach(file => {
      const matchingMod = missingMods.find(mod => {
        // Try exact match first
        if (mod.fileName.toLowerCase() === file.name.toLowerCase()) return true;
        // Try without extension
        const modNameWithoutExt = mod.fileName.replace(/\.(jar|zip)$/i, '');
        const fileNameWithoutExt = file.name.replace(/\.(jar|zip)$/i, '');
        return modNameWithoutExt.toLowerCase() === fileNameWithoutExt.toLowerCase();
      });

      if (matchingMod) {
        newFiles.set(matchingMod.fileName, file);
        matchedCount++;
      }
    });

    setUploadedFiles(newFiles);

    if (validFiles.length > matchedCount) {
      toast.error(t('publishModpack.validation.filesNotMatched', { count: validFiles.length - matchedCount }));
    }
  };

  const handleRemoveFile = (fileName: string) => {
    const newFiles = new Map(uploadedFiles);
    newFiles.delete(fileName);
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

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <Package className="w-6 h-6 text-blue-500" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('publishModpack.validation.title')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{modpackName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Mods with empty URL */}
          {modsWithoutUrl.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <FileArchive className="w-4 h-4" />
                {missingMods.length > 0
                  ? t('publishModpack.validation.fileMissing', { count: missingMods.length })
                  : t('publishModpack.validation.allFilesPresent', { count: modsWithoutUrl.length })
                }
              </h4>

              {/* Bulk Upload / Drag & Drop Zone */}
              {missingMods.length > 0 && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`mb-4 border-2 border-dashed rounded-lg p-4 text-center transition-all ${isDragging
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                    }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-gray-400" />
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('publishModpack.validation.dragAndDrop')}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      {t('publishModpack.validation.autoMatched')} ({t('publishModpack.validation.remaining', { count: missingMods.length - uploadedFiles.size })})
                    </p>
                    <label className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors cursor-pointer">
                      {t('publishModpack.validation.selectMultiple')}
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

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {modsWithoutUrl.map((mod, index) => {
                  const isInOverrides = modsInOverrides.includes(mod.fileName);
                  const uploadedFile = uploadedFiles.get(mod.fileName);
                  const isResolved = isInOverrides || uploadedFile !== undefined;
                  const curseforgeUrl = mod.modWebsiteUrl
                    ? `${mod.modWebsiteUrl}/files/${mod.id}`
                    : `https://www.curseforge.com/minecraft/mc-mods/search?search=${encodeURIComponent(mod.fileName)}`;

                  return (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${isResolved
                          ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {isResolved ? (
                            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {mod.displayName || mod.fileName}
                            </p>
                            {isResolved && (
                              <p className="text-xs text-gray-500 dark:text-gray-500">
                                {isInOverrides
                                  ? t('publishModpack.validation.inOverrides')
                                  : t('publishModpack.validation.uploadFile')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {!isInOverrides && !uploadedFile && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenUrl(curseforgeUrl);
                                }}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                                {t('publishModpack.validation.downloadButton')}
                              </button>
                              <label className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors cursor-pointer">
                                <Upload className="w-3 h-3" />
                                {t('publishModpack.validation.uploadButton')}
                                <input
                                  type="file"
                                  accept=".jar,.zip"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleFileUpload(mod, file);
                                      e.target.value = ''; // Reset input
                                    }
                                  }}
                                />
                              </label>
                            </>
                          )}
                          {uploadedFile && (
                            <button
                              onClick={() => handleRemoveFile(mod.fileName)}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                            >
                              <X className="w-3 h-3" />
                              {t('publishModpack.validation.removeFile')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            {t('publishModpack.validation.buttons.cancel')}
          </button>
          <button
            onClick={() => onContinue(uploadedFiles.size > 0 ? uploadedFiles : undefined)}
            disabled={!canContinue}
            className={`px-4 py-2 rounded-lg transition-colors ${canContinue
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }`}
          >
            {canContinue ? (uploadedFiles.size > 0 ? t('publishModpack.validation.buttons.continueWithFiles', { count: uploadedFiles.size }) : t('publishModpack.validation.buttons.continue')) : t('publishModpack.validation.buttons.cannotImportYet')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ModpackValidationDialog;
