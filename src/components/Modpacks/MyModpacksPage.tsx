import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FolderOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import ModpackValidationService, { ModFileInfo } from '../../services/modpackValidationService';
import ModpackValidationDialog from './ModpackValidationDialog';
import ModpackCard from './ModpackCard';
import { useLauncher } from '../../contexts/LauncherContext';
import { ConfirmDialog } from '../Common/ConfirmDialog';
import LauncherService from '../../services/launcherService';
import type { Modpack } from '../../types/launcher';

interface LocalModpack {
  id: string;
  name: string;
  version: string;
  minecraftVersion: string;
  modloader: string;
  modloaderVersion: string;
  path: string;
  createdAt: string;
  lastPlayed?: string;
}

interface MyModpacksPageProps {
  onNavigate?: (section: string, modpackId?: string) => void;
}

export function MyModpacksPage({ onNavigate }: MyModpacksPageProps = {}) {
  const { t } = useTranslation();
  const validationService = ModpackValidationService.getInstance();
  const { installModpackFromZip, modpackStates } = useLauncher();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const launcherService = LauncherService.getInstance();

  const [localModpacks, setLocalModpacks] = useState<LocalModpack[]>([]);
  const [modpackDetails, setModpackDetails] = useState<Map<string, Modpack>>(new Map());
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationData, setValidationData] = useState<{
    modpackName: string;
    modsWithoutUrl: ModFileInfo[];
    modsInOverrides: string[];
    file: File;
  } | null>(null);
  const [_zipProgress, setZipProgress] = useState<{
    current: number;
    total: number;
    stage: string;
    message: string;
  } | null>(null);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [pendingUploadedFiles, setPendingUploadedFiles] = useState<Map<string, File> | null>(null);

  useEffect(() => {
    loadLocalModpacks();
  }, []);

  const loadLocalModpacks = async () => {
    try {
      setLoading(true);
      const result = await invoke<string>('get_local_modpacks');
      const instances = JSON.parse(result);

      // Map instances to LocalModpack format
      const modpacks: LocalModpack[] = instances.map((instance: any) => ({
        id: instance.id,
        name: instance.name || instance.id, // Use name from metadata, fallback to ID
        version: instance.version,
        minecraftVersion: instance.minecraftVersion, // Backend uses camelCase via serde rename
        modloader: instance.modloader,
        modloaderVersion: instance.modloaderVersion, // Backend uses camelCase via serde rename
        path: '', // Path is not returned by backend, but we know it's in instances/{id}
        createdAt: instance.installedAt, // Backend uses camelCase via serde rename
        lastPlayed: undefined // We don't track last played yet
      }));

      setLocalModpacks(modpacks);

      // Fetch details for each modpack from Supabase (in parallel)
      const detailsMap = new Map<string, Modpack>();
      await Promise.all(
        modpacks.map(async (localModpack) => {
          try {
            const details = await launcherService.fetchModpackDetails(localModpack.id);
            if (details) {
              detailsMap.set(localModpack.id, details);
            }
          } catch (error) {
            console.log(`Could not fetch details for ${localModpack.id}:`, error);
            // Silently fail - modpack might be imported and not in database
          }
        })
      );
      setModpackDetails(detailsMap);
    } catch (error) {
      console.error('Error loading local modpacks:', error);
      toast.error('Failed to load local modpacks');
    } finally {
      setLoading(false);
    }
  };

  const handleImportModpack = () => {
    // Reset validating state in case it got stuck
    setValidating(false);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be selected again
    event.target.value = '';

    if (!file.name.endsWith('.zip')) {
      toast.error('Please select a ZIP file');
      return;
    }

    try {
      setValidating(true);
      toast.loading('Validating modpack...', { id: 'validation' });

      const result = await validationService.validateModpackZip(file);

      if (!result.success) {
        toast.error(result.error || 'Failed to validate modpack', { id: 'validation' });
        return;
      }

      toast.dismiss('validation');

      // Check if there are missing mods (mods without URL that are NOT in overrides)
      const missingMods = result.modsWithoutUrl.filter(
        mod => !result.modsInOverrides?.includes(mod.fileName)
      );

      // If there are mods without URL but they're all in overrides, proceed directly
      if (result.modsWithoutUrl && result.modsWithoutUrl.length > 0 && missingMods.length > 0) {
        // Some files are missing - show validation dialog
        setValidationData({
          modpackName: result.manifest?.name || file.name,
          modsWithoutUrl: result.modsWithoutUrl,
          modsInOverrides: result.modsInOverrides || [],
          file
        });
        setShowValidationDialog(true);
      } else {
        // No missing files (either no restricted files or all are in overrides), proceed directly
        await performImport(file);
      }
    } catch (error) {
      console.error('Error validating modpack:', error);
      toast.error('Failed to validate modpack', { id: 'validation' });
    } finally {
      setValidating(false);
    }
  };

  const performImport = async (file: File) => {
    try {
      // Use the context function which handles all state management
      await installModpackFromZip(file);

      toast.success('Modpack installed successfully!');

      // Reload the list to show the newly installed modpack
      await loadLocalModpacks();
    } catch (error) {
      console.error('Error installing modpack from ZIP:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to install modpack');
    }
  };

  const handleValidationContinue = async (uploadedFiles?: Map<string, File>) => {
    setShowValidationDialog(false);
    if (validationData) {
      if (uploadedFiles && uploadedFiles.size > 0) {
        // Ask user if they want to download an updated ZIP with the files in overrides
        setPendingUploadedFiles(uploadedFiles);
        setShowDownloadDialog(true);
      } else {
        // No files uploaded, just import
        await performImport(validationData.file);
      }
    }
  };

  const handleDownloadDialogConfirm = async () => {
    if (validationData && pendingUploadedFiles) {
        const uploadedFiles = pendingUploadedFiles;
          const loadingToast = toast.loading('Preparing files...');

          try {
            const { downloadDir } = await import('@tauri-apps/api/path');

            // Set up progress listener first
            const { listen } = await import('@tauri-apps/api/event');
            const unlisten = await listen<{current: number, total: number, stage: string, message: string}>('zip-progress', (event) => {
              const { current, total, stage, message } = event.payload;
              setZipProgress({ current, total, stage, message });

              const percentage = Math.round((current / total) * 100);

              if (stage === 'complete') {
                toast.dismiss(loadingToast);
              } else {
                toast.loading(`${message} (${percentage}%)`, { id: loadingToast });
              }
            });

            // Read original ZIP as bytes
            const originalZipBuffer = await validationData.file.arrayBuffer();
            const originalZipBytes = Array.from(new Uint8Array(originalZipBuffer));

            // Read uploaded files as bytes
            const uploadedFilesData: [string, number[]][] = [];
            for (const file of uploadedFiles.values()) {
              const buffer = await file.arrayBuffer();
              const bytes = Array.from(new Uint8Array(buffer));
              uploadedFilesData.push([file.name, bytes]);
            }

            // Create output ZIP path in Downloads folder
            const downloadsFolder = await downloadDir();
            const outputFileName = validationData.file.name.replace('.zip', '_updated.zip');
            const outputZipPath = `${downloadsFolder}/${outputFileName}`;

            toast.loading('Creating updated modpack ZIP...', { id: loadingToast });

            // Call Tauri command with bytes directly
            await invoke('create_modpack_with_overrides', {
              originalZipBytes: originalZipBytes,
              originalZipName: validationData.file.name,
              uploadedFiles: uploadedFilesData,
              outputZipPath: outputZipPath
            });

            unlisten();
            setZipProgress(null);
            toast.success(`Updated modpack saved to Downloads: ${outputFileName}`, { id: loadingToast, duration: 5000 });
          } catch (error) {
            console.error('Error creating modpack with overrides:', error);
            setZipProgress(null);
            toast.error('Failed to create updated modpack', { id: loadingToast });
          }

      // Now import the modpack (either original or with uploaded files in memory)
      await performImport(validationData.file);
      setPendingUploadedFiles(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* Validation Dialog */}
      {validationData && (
        <ModpackValidationDialog
          isOpen={showValidationDialog}
          onClose={() => setShowValidationDialog(false)}
          onContinue={handleValidationContinue}
          modpackName={validationData.modpackName}
          modsWithoutUrl={validationData.modsWithoutUrl}
          modsInOverrides={validationData.modsInOverrides}
        />
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('myModpacks.title')}
          </h1>
          <button
            onClick={handleImportModpack}
            disabled={validating}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5" />
            {validating ? t('myModpacks.validating') : t('myModpacks.import')}
          </button>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          {t('myModpacks.subtitle')}
        </p>
      </div>

      {/* Modpacks List */}
      {(() => {
        // Get importing modpacks from context (those with 'installing' status that aren't in localModpacks)
        const importingModpackIds = Object.entries(modpackStates)
          .filter(([id, state]) => state.status === 'installing' && !localModpacks.some(m => m.id === id))
          .map(([id]) => id);

        const hasImporting = importingModpackIds.length > 0;

        if (localModpacks.length === 0 && !hasImporting) {
          return (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-12 shadow-md text-center">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('myModpacks.empty.title')}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {t('myModpacks.empty.description')}
              </p>
              <button
                onClick={handleImportModpack}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors inline-block"
              >
                {t('myModpacks.empty.button')}
              </button>
            </div>
          );
        }

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Importing Modpacks */}
            {importingModpackIds.map((id, index) => {
              const state = modpackStates[id];
              // Create a temporary modpack object for display
              const tempModpack: Modpack = {
                id,
                name: id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                description: 'Importing modpack...',
                shortDescription: 'Imported from local ZIP file',
                version: '1.0.0',
                minecraftVersion: '1.20.1',
                modloader: 'forge',
                modloaderVersion: '47.0.0',
                logo: '',
                backgroundImage: '',
                urlModpackZip: '',
                category: 'community',
                isActive: false,
                isNew: false,
                isComingSoon: false,
                gamemode: undefined,
                ip: undefined
              };

              return (
                <ModpackCard
                  key={`importing-${id}`}
                  modpack={tempModpack}
                  state={state}
                  onSelect={() => {}}
                  index={index}
                />
              );
            })}

            {/* Installed Modpacks */}
            {localModpacks.map((localModpack, index) => {
              // Check if we have details from Supabase for this modpack
              const details = modpackDetails.get(localModpack.id);

              // Convert LocalModpack to Modpack format for ModpackCard
              const modpack: Modpack = details ? {
                // If we have details from Supabase, use them
                ...details,
                // But override version info with local installed version
                version: localModpack.version,
                minecraftVersion: localModpack.minecraftVersion,
                modloader: localModpack.modloader,
                modloaderVersion: localModpack.modloaderVersion,
              } : {
                // If no details (imported modpack), use local data only
                id: localModpack.id,
                name: localModpack.name,
                description: '',
                shortDescription: `${t('myModpacks.importedOn')} ${new Date(localModpack.createdAt).toLocaleDateString()}`,
                version: localModpack.version,
                minecraftVersion: localModpack.minecraftVersion,
                modloader: localModpack.modloader,
                modloaderVersion: localModpack.modloaderVersion,
                logo: localModpack.name.charAt(0).toUpperCase(), // Use first letter as logo
                backgroundImage: '', // Use default gradient background
                urlModpackZip: '', // Local modpacks don't need download URL
                category: 'community',
                isActive: true,
                isNew: false,
                isComingSoon: false,
              };

              // Get or create state for this modpack
              const state = modpackStates[localModpack.id] || {
                installed: true,
                downloading: false,
                progress: { percentage: 0 },
                status: 'installed' as const,
              };

              return (
                <ModpackCard
                  key={localModpack.id}
                  modpack={modpack}
                  state={state}
                  onSelect={() => onNavigate?.('explore', localModpack.id)}
                  index={index + importingModpackIds.length}
                  hideServerBadges={true}
                />
              );
            })}
          </div>
        );
      })()}

      {/* Download Updated ZIP Dialog */}
      <ConfirmDialog
        isOpen={showDownloadDialog}
        onClose={() => setShowDownloadDialog(false)}
        onConfirm={handleDownloadDialogConfirm}
        title="Download Updated Modpack?"
        message={`You've uploaded ${pendingUploadedFiles?.size || 0} file(s) that were missing from this modpack. Would you like to download an updated version of the ZIP file with these files included in the overrides folder? This way you can use the updated ZIP for publishing or sharing.`}
        confirmText="Download Updated ZIP"
        cancelText="Skip Download"
        variant="info"
      />

    </div>
  );
}

export default MyModpacksPage;
