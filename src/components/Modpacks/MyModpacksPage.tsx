import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FolderOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { downloadDir } from '@tauri-apps/api/path';
import { listen } from '@tauri-apps/api/event';
import ModpackValidationService, { ModFileInfo } from '../../services/modpackValidationService';
import ModpackValidationDialog from './ModpackValidationDialog';
import ModpackCard from './ModpackCard';
import ModpackDetailsRefactored from './ModpackDetailsRefactored';
import { useLauncher } from '../../contexts/LauncherContext';
import { ConfirmDialog } from '../Common/ConfirmDialog';
import LauncherService from '../../services/launcherService';
import type { Modpack } from '../../types/launcher';

interface LocalInstance {
  id: string;
  name: string;
  version: string;
  minecraftVersion: string;
  modloader: string;
  modloaderVersion: string;
  installedAt: string;
}

export function MyModpacksPage() {
  const { t } = useTranslation();
  const validationService = ModpackValidationService.getInstance();
  const launcherService = LauncherService.getInstance();
  const { installModpackFromZip, modpackStates } = useLauncher();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastProcessedStateRef = useRef<string>('');

  // State management
  const [instances, setInstances] = useState<LocalInstance[]>([]);
  const [modpackDataMap, setModpackDataMap] = useState<Map<string, Modpack>>(new Map());
  const [selectedModpackId, setSelectedModpackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [validating, setValidating] = useState(false);

  // Import/validation state
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationData, setValidationData] = useState<{
    modpackName: string;
    modsWithoutUrl: ModFileInfo[];
    modsInOverrides: string[];
    file: File;
  } | null>(null);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [pendingUploadedFiles, setPendingUploadedFiles] = useState<Map<string, File> | null>(null);

  // Load instances on mount
  useEffect(() => {
    loadInstancesAndMetadata();
  }, []);

  // Listen for installation state changes and reload
  useEffect(() => {
    const handleStateChange = async () => {
      const installedIds = Object.entries(modpackStates)
        .filter(([_, state]) => state.status === 'installed')
        .map(([id]) => id);

      // Create a hash of current state to prevent duplicate processing
      const currentStateHash = JSON.stringify(installedIds.sort());

      // Only process if state has actually changed
      if (lastProcessedStateRef.current === currentStateHash) {
        return;
      }

      lastProcessedStateRef.current = currentStateHash;

      const installingIds = Object.entries(modpackStates)
        .filter(([_, state]) => state.status === 'installing')
        .map(([id]) => id);

      // If a modpack just finished installing, save correct metadata and reload
      if (installingIds.length === 0 && installedIds.length > 0) {
        const recentlyInstalled = installedIds.some(
          id => !instances.some(i => i.id === id)
        );

        if (recentlyInstalled) {
          // Save correct modpack metadata before reloading
          await saveInstallingModpackMetadata();
          // Small delay to ensure file is written to disk
          await new Promise(resolve => setTimeout(resolve, 100));
          loadInstancesAndMetadata();
          return;
        }
      }

      // Check if any modpack was removed (was in instances but no longer installed)
      const recentlyRemoved = instances.some(
        instance => !installedIds.includes(instance.id)
      );

      if (recentlyRemoved) {
        loadInstancesAndMetadata();
      }
    };

    handleStateChange();
  }, [modpackStates]);

  /**
   * Save complete modpack metadata from localStorage to override incomplete backend metadata
   */
  const saveInstallingModpackMetadata = async () => {
    const installedIds = Object.entries(modpackStates)
      .filter(([_, state]) => state.status === 'installed')
      .map(([id]) => id);

    for (const id of installedIds) {
      if (!instances.some(i => i.id === id)) {
        // This is a newly installed modpack
        try {
          const savedData = localStorage.getItem(`installing_modpack_${id}`);
          if (savedData) {
            const modpack = JSON.parse(savedData);
            console.log(`📝 Saving metadata for ${id}:`, {
              backgroundImage: modpack.backgroundImage,
              logo: modpack.logo,
              name: modpack.name
            });
            // Call Tauri to save the correct metadata file
            await invoke('save_modpack_metadata_json', {
              modpackId: id,
              modpackJson: JSON.stringify(modpack)
            });
            console.log(`✅ Saved metadata for ${id}`);
            // Clean up localStorage
            localStorage.removeItem(`installing_modpack_${id}`);
          }
        } catch (error) {
          console.error(`Failed to save metadata for ${id}:`, error);
        }
      }
    }
  };

  /**
   * Load instances and their metadata (cache-first approach)
   */
  const loadInstancesAndMetadata = async () => {
    try {
      setLoading(true);

      // Step 1: Load local instances
      const result = await invoke<string>('get_local_modpacks');
      const parsedInstances: LocalInstance[] = JSON.parse(result);
      setInstances(parsedInstances);

      // Step 2: Load metadata for each instance (cache-first)
      const dataMap = new Map<string, Modpack>();

      // Also load data for currently installing modpacks
      const installingIds = Object.entries(modpackStates)
        .filter(([_, state]) => state.status === 'installing')
        .map(([id]) => id);

      const allIdsToLoad = [...new Set([
        ...parsedInstances.map(i => i.id),
        ...installingIds
      ])];

      await Promise.all(
        allIdsToLoad.map(async (id) => {
          try {
            // Try cache first
            const cachedData = await invoke<string | null>('get_cached_modpack_data', {
              modpackId: id
            });

            if (cachedData) {
              // Cache hit - use cached data
              const modpack = JSON.parse(cachedData) as Modpack;
              console.log(`📦 Loaded from cache ${id}:`, {
                backgroundImage: modpack.backgroundImage,
                logo: modpack.logo,
                name: modpack.name
              });
              dataMap.set(id, modpack);
              return;
            }

            // Cache miss - try Supabase
            try {
              const modpack = await launcherService.fetchModpackDetails(id);
              if (modpack) {
                dataMap.set(id, modpack);
              }
            } catch (supabaseError) {
              // Supabase also failed - log but don't block
              console.log(`Could not fetch details for ${id} from cache or Supabase`);
            }
          } catch (error) {
            console.error(`Error loading metadata for ${id}:`, error);
          }
        })
      );

      setModpackDataMap(dataMap);
    } catch (error) {
      console.error('Error loading local modpacks:', error);
      toast.error('Failed to load local modpacks');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle modpack selection for details view
   */
  const handleModpackSelect = (modpackId: string) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setSelectedModpackId(modpackId);
      setTimeout(() => {
        setIsTransitioning(false);
      }, 100);
    }, 100);
  };

  /**
   * Handle back from details view
   */
  const handleBackToList = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setSelectedModpackId(null);
      setIsTransitioning(false);
    }, 100);
  };

  /**
   * Handle import button click
   */
  const handleImportModpack = () => {
    setValidating(false);
    fileInputRef.current?.click();
  };

  /**
   * Handle file selection for import
   */
  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input for reuse
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

      // Check for missing mods
      const missingMods = result.modsWithoutUrl.filter(
        mod => !result.modsInOverrides?.includes(mod.fileName)
      );

      if (result.modsWithoutUrl && result.modsWithoutUrl.length > 0 && missingMods.length > 0) {
        // Show validation dialog for missing files
        setValidationData({
          modpackName: result.manifest?.name || file.name,
          modsWithoutUrl: result.modsWithoutUrl,
          modsInOverrides: result.modsInOverrides || [],
          file
        });
        setShowValidationDialog(true);
      } else {
        // No missing files - proceed directly
        await performImport(file);
      }
    } catch (error) {
      console.error('Error validating modpack:', error);
      toast.error('Failed to validate modpack', { id: 'validation' });
    } finally {
      setValidating(false);
    }
  };

  /**
   * Perform the actual import
   */
  const performImport = async (file: File) => {
    try {
      await installModpackFromZip(file);
      toast.success('Modpack installed successfully!');

      // Reload instances
      await loadInstancesAndMetadata();
    } catch (error) {
      console.error('Error installing modpack from ZIP:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to install modpack');
    }
  };

  /**
   * Handle validation dialog continue
   */
  const handleValidationContinue = async (uploadedFiles?: Map<string, File>) => {
    setShowValidationDialog(false);
    if (validationData) {
      if (uploadedFiles && uploadedFiles.size > 0) {
        setPendingUploadedFiles(uploadedFiles);
        setShowDownloadDialog(true);
      } else {
        await performImport(validationData.file);
      }
    }
  };

  /**
   * Handle download dialog confirmation
   */
  const handleDownloadDialogConfirm = async () => {
    if (validationData && pendingUploadedFiles) {
      const loadingToast = toast.loading('Preparing files...');
      try {
        const unlisten = await listen<{
          current: number;
          total: number;
          stage: string;
          message: string;
        }>('zip-progress', (event) => {
          const { current, total, stage, message } = event.payload;
          const percentage = Math.round((current / total) * 100);

          if (stage === 'complete') {
            toast.dismiss(loadingToast);
          } else {
            toast.loading(`${message} (${percentage}%)`, { id: loadingToast });
          }
        });

        const originalZipBuffer = await validationData.file.arrayBuffer();
        const originalZipBytes = Array.from(new Uint8Array(originalZipBuffer));

        const uploadedFilesData: [string, number[]][] = [];
        for (const file of pendingUploadedFiles.values()) {
          const buffer = await file.arrayBuffer();
          const bytes = Array.from(new Uint8Array(buffer));
          uploadedFilesData.push([file.name, bytes]);
        }

        const downloadsFolder = await downloadDir();
        const outputFileName = validationData.file.name.replace('.zip', '_updated.zip');
        const outputZipPath = `${downloadsFolder}/${outputFileName}`;

        toast.loading('Creating updated modpack ZIP...', { id: loadingToast });

        await invoke('create_modpack_with_overrides', {
          originalZipBytes,
          originalZipName: validationData.file.name,
          uploadedFiles: uploadedFilesData,
          outputZipPath
        });

        unlisten();
        toast.success(`Updated modpack saved to Downloads: ${outputFileName}`, {
          id: loadingToast,
          duration: 5000
        });

        // Now import the original ZIP with the added overrides
        setShowDownloadDialog(false);
        toast.loading('Installing modpack with overrides...', { id: 'import-toast' });

        try {
          await performImport(validationData.file);
          toast.dismiss('import-toast');
        } catch (importError) {
          toast.error('Failed to install modpack', { id: 'import-toast' });
          console.error('Import failed:', importError);
        }

        setPendingUploadedFiles(null);
        setValidationData(null);
      } catch (error) {
        console.error('Error creating modpack with overrides:', error);
        toast.error('Failed to create updated modpack', { id: loadingToast });
        setShowDownloadDialog(false);
      }
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lumina-500"></div>
      </div>
    );
  }

  // Details view
  if (selectedModpackId) {
    const state = modpackStates[selectedModpackId];
    let modpack = modpackDataMap.get(selectedModpackId);

    // Create placeholder if no metadata found
    if (!modpack && state) {
      modpack = {
        id: selectedModpackId,
        name: t('myModpacks.importing.name'),
        description: t('myModpacks.importing.description'),
        shortDescription: t('myModpacks.importing.shortDescription'),
        version: '',
        minecraftVersion: '',
        modloader: '',
        modloaderVersion: '',
        logo: '',
        backgroundImage: '',
        banner_url: '',
        urlModpackZip: '',
        category: 'community',
        isActive: false,
        isNew: false,
        isComingSoon: false
      } as Modpack;
    }

    if (modpack && state) {
      return (
        <div
          className={`h-full w-full transition-opacity duration-200 ease-out ${
            isTransitioning ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <ModpackDetailsRefactored
            modpack={modpack}
            state={state}
            onBack={handleBackToList}
            isReadOnly={false}
          />
        </div>
      );
    }
  }

  // Main list view
  return (
    <div
      className={`max-w-7xl mx-auto p-6 transition-opacity duration-200 ease-out ${
        isTransitioning ? 'opacity-0' : 'opacity-100'
      }`}
    >
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
          <h1 className="text-3xl font-bold text-white">{t('myModpacks.title')}</h1>
          <button
            onClick={handleImportModpack}
            disabled={validating}
            className="flex items-center gap-2 px-6 py-3 bg-lumina-600 hover:bg-lumina-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5" />
            {validating ? t('myModpacks.validating') : t('myModpacks.import')}
          </button>
        </div>
        <p className="text-dark-400">{t('myModpacks.subtitle')}</p>
      </div>

      {/* Modpacks List */}
      {(() => {
        // Get installing modpacks
        const installingIds = Object.entries(modpackStates)
          .filter(([id, state]) => state.status === 'installing' && !instances.some(i => i.id === id))
          .map(([id]) => id);

        const hasContent = instances.length > 0 || installingIds.length > 0;

        if (!hasContent) {
          return (
            <div className="bg-dark-800 rounded-lg p-12 border border-dark-700 text-center">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 text-dark-400" />
              <h2 className="text-xl font-semibold text-white mb-2">
                {t('myModpacks.empty.title')}
              </h2>
              <p className="text-dark-400 mb-6">{t('myModpacks.empty.description')}</p>
              <button
                onClick={handleImportModpack}
                className="px-6 py-3 bg-lumina-600 hover:bg-lumina-700 text-white rounded-lg font-medium transition-colors"
              >
                {t('myModpacks.empty.button')}
              </button>
            </div>
          );
        }

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Installing modpacks */}
            {installingIds.map((id, index) => {
              const state = modpackStates[id];
              let modpackData = modpackDataMap.get(id);

              // Try to get from localStorage first (saved before install was called)
              if (!modpackData) {
                try {
                  const savedData = localStorage.getItem(`installing_modpack_${id}`);
                  if (savedData) {
                    modpackData = JSON.parse(savedData);
                    // Clean up localStorage after using it
                    localStorage.removeItem(`installing_modpack_${id}`);
                  }
                } catch (error) {
                  console.error('Failed to load modpack from localStorage:', error);
                }
              }

              // If we have data from cache/localStorage/Supabase (from Explore), use it
              // Only show "Importing" placeholder if NO data (local ZIP import)
              const modpack: Modpack = modpackData ? modpackData : {
                id,
                name: t('myModpacks.importing.name'),
                description: t('myModpacks.importing.description'),
                shortDescription: t('myModpacks.importing.shortDescription'),
                version: '',
                minecraftVersion: '',
                modloader: '',
                modloaderVersion: '',
                logo: '',
                backgroundImage: '',
                banner_url: '',
                urlModpackZip: '',
                category: 'community',
                isActive: false,
                isNew: false,
                isComingSoon: false
              } as Modpack;

              return (
                <ModpackCard
                  key={`installing-${id}`}
                  modpack={modpack}
                  state={state}
                  onSelect={() => handleModpackSelect(id)}
                  index={index}
                  hideServerBadges={true}
                />
              );
            })}

            {/* Installed modpacks */}
            {instances.map((instance, index) => {
              const cachedData = modpackDataMap.get(instance.id);
              const state = modpackStates[instance.id] || {
                installed: true,
                downloading: false,
                progress: { percentage: 0 },
                status: 'installed' as const
              };

              let modpack: Modpack;

              if (cachedData) {
                // Use cached data, but override versions
                modpack = {
                  ...cachedData,
                  version: instance.version,
                  minecraftVersion: instance.minecraftVersion,
                  modloader: instance.modloader,
                  modloaderVersion: instance.modloaderVersion
                };
              } else {
                // Use instance data only (local import)
                modpack = {
                  id: instance.id,
                  name: instance.name,
                  description: '',
                  shortDescription: `${t('myModpacks.importedOn')} ${new Date(
                    instance.installedAt
                  ).toLocaleDateString()}`,
                  version: instance.version,
                  minecraftVersion: instance.minecraftVersion,
                  modloader: instance.modloader,
                  modloaderVersion: instance.modloaderVersion,
                  logo: instance.name.charAt(0).toUpperCase(),
                  backgroundImage: '',
                  banner_url: '',
                  urlModpackZip: '',
                  category: 'community',
                  isActive: true,
                  isNew: false,
                  isComingSoon: false
                } as Modpack;
              }

              return (
                <ModpackCard
                  key={instance.id}
                  modpack={modpack}
                  state={state}
                  onSelect={() => handleModpackSelect(instance.id)}
                  index={index + installingIds.length}
                  hideServerBadges={true}
                />
              );
            })}
          </div>
        );
      })()}

      {/* Download Dialog */}
      <ConfirmDialog
        isOpen={showDownloadDialog}
        onClose={() => setShowDownloadDialog(false)}
        onConfirm={handleDownloadDialogConfirm}
        title="Download Updated Modpack?"
        message={`You've uploaded ${
          pendingUploadedFiles?.size || 0
        } file(s) that were missing from this modpack. Would you like to download an updated version of the ZIP file with these files included in the overrides folder?`}
        confirmText="Download Updated ZIP"
        cancelText="Skip Download"
        variant="info"
      />
    </div>
  );
}

export default MyModpacksPage;
