import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle, ExternalLink, FileArchive, Package, Upload } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { ModFileInfo } from '../../services/modpackValidationService';
import ModpackValidationService from '../../services/modpackValidationService';

interface ModpackValidationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: (uploadedFiles?: Map<string, File>) => void;
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
  const validationService = ModpackValidationService.getInstance();
  const [uploadedFiles, setUploadedFiles] = useState<Map<string, File>>(new Map());

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
      toast.error('Please upload a .jar or .zip file');
      return;
    }

    const newFiles = new Map(uploadedFiles);
    newFiles.set(mod.fileName, file);
    setUploadedFiles(newFiles);
    toast.success(`${file.name} uploaded`);
  };

  const handleRemoveFile = (fileName: string) => {
    const newFiles = new Map(uploadedFiles);
    newFiles.delete(fileName);
    setUploadedFiles(newFiles);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <Package className="w-6 h-6 text-blue-500" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Modpack Validation
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
          {/* Summary */}
          <div className={`rounded-lg p-4 mb-6 ${
            canContinue
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
          }`}>
            <div className="flex items-start gap-3">
              {canContinue ? (
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h4 className={`font-semibold mb-1 ${
                  canContinue
                    ? 'text-green-900 dark:text-green-100'
                    : 'text-yellow-900 dark:text-yellow-100'
                }`}>
                  {canContinue ? 'Ready to Import!' : 'Action Required'}
                </h4>
                <p className={`text-sm ${
                  canContinue
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-yellow-800 dark:text-yellow-200'
                }`}>
                  {canContinue
                    ? `All ${modsWithoutUrl.length} mods that cannot be auto-downloaded are present in overrides/mods/.`
                    : `${missingMods.length} mod(s) cannot be auto-downloaded and are missing from overrides/mods/.`
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Mods with empty URL */}
          {modsWithoutUrl.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <FileArchive className="w-4 h-4" />
                Files Without Auto-Download ({modsWithoutUrl.length})
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                These files (mods/resourcepacks) cannot be downloaded automatically. You can upload them here or include them in the overrides folder:
              </p>

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
                      className={`p-3 rounded-lg border ${
                        isResolved
                          ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {isResolved ? (
                              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                            )}
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {mod.displayName || mod.fileName}
                            </p>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            {mod.fileName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Status: {validationService.getFileStatusText(mod.fileStatus)}
                            {' • '}
                            {isInOverrides
                              ? 'Found in overrides'
                              : uploadedFile
                                ? `Uploaded: ${uploadedFile.name}`
                                : 'Missing from overrides'}
                          </p>
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
                              Remove
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

          {/* Instructions for missing files */}
          {missingMods.length > 0 && missingMods.some(mod => !uploadedFiles.has(mod.fileName)) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Two ways to fix this:
              </h4>
              <div className="text-sm text-blue-800 dark:text-blue-200 space-y-3">
                <div>
                  <p className="font-medium mb-1">Option 1: Upload files directly (Recommended)</p>
                  <ol className="space-y-1 list-decimal list-inside ml-2">
                    <li>Click "Download" to get each file from CurseForge</li>
                    <li>Click "Upload" to attach the downloaded .jar or .zip file</li>
                    <li>Continue with import once all files are uploaded</li>
                  </ol>
                </div>
                <div>
                  <p className="font-medium mb-1">Option 2: Add to modpack ZIP manually</p>
                  <ol className="space-y-1 list-decimal list-inside ml-2">
                    <li>Download the files from CurseForge</li>
                    <li>Add them to overrides/mods/ or overrides/resourcepacks/ in your ZIP</li>
                    <li>Re-import the modpack</li>
                  </ol>
                </div>
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
            Cancel
          </button>
          <button
            onClick={() => onContinue(uploadedFiles.size > 0 ? uploadedFiles : undefined)}
            disabled={!canContinue}
            className={`px-4 py-2 rounded-lg transition-colors ${
              canContinue
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            }`}
          >
            {canContinue ? (uploadedFiles.size > 0 ? `Import with ${uploadedFiles.size} file(s)` : 'Import Modpack') : 'Cannot Import Yet'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModpackValidationDialog;
