import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Download, FolderOpen, Loader } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { appDataDir, tempDir } from '@tauri-apps/api/path';
import { remove, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import JSZip from 'jszip';
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

interface MyModpacksPageProps {
  initialModpackId?: string;
  onNavigate?: (_section: string, _modpackId?: string) => void;
}

export function MyModpacksPage({ initialModpackId, onNavigate: _onNavigate }: MyModpacksPageProps) {
  const { t } = useTranslation();
  const validationService = ModpackValidationService.getInstance();
  const launcherService = LauncherService.getInstance();
  const { installModpackFromZip, modpackStates, refreshData } = useLauncher();
  const lastProcessedStateRef = useRef<string>('');
  const launcherDataDirRef = useRef<string | null>(null);

  // State management
  const [instances, setInstances] = useState<LocalInstance[]>([]);
  const [modpackDataMap, setModpackDataMap] = useState<Map<string, Modpack>>(new Map());
  const [selectedModpackId, setSelectedModpackId] = useState<string | null>(initialModpackId || null);
  const [loading, setLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [validating, setValidating] = useState(false);
  const [showValidationProgress, setShowValidationProgress] = useState(false);
  const [_validationProgressMessage, setValidationProgressMessage] = useState('');
  const [importingModpackId, setImportingModpackId] = useState<string | null>(null);
  const [tempZipPath, setTempZipPath] = useState<string | null>(null); // Track temp ZIP for cleanup

  /**
   * Resolve relative image paths to data URLs via Tauri
   */
  const resolveImagePaths = async (modpack: Modpack): Promise<Modpack> => {
    if (!launcherDataDirRef.current) {
      try {
        const appData = await appDataDir();
        // appDataDir() already returns the full app data directory including app name
        // It returns /Users/.../Library/Application Support/LKLauncher
        launcherDataDirRef.current = appData.endsWith('/') ? appData.slice(0, -1) : appData;
      } catch (error) {
        console.error('Failed to get app data directory:', error);
        return modpack;
      }
    }

    const resolved = { ...modpack };

    // Resolve logo if it's a relative path (handle both old caches/ and new meta/ paths)
    if (resolved.logo && (resolved.logo.startsWith('meta/') || resolved.logo.startsWith('caches/'))) {
      const fullPath = `${launcherDataDirRef.current}/${resolved.logo}`;
      try {
        resolved.logo = await invoke<string>('get_file_as_data_url', { filePath: fullPath });
        console.log('🖼️ Logo converted to data URL');
      } catch (error) {
        console.error('Failed to load logo:', error);
        // Set to empty string so placeholder is shown
        resolved.logo = '';
      }
    }

    // Resolve backgroundImage if it's a relative path (handle both old caches/ and new meta/ paths)
    if (resolved.backgroundImage && (resolved.backgroundImage.startsWith('meta/') || resolved.backgroundImage.startsWith('caches/'))) {
      const fullPath = `${launcherDataDirRef.current}/${resolved.backgroundImage}`;
      try {
        resolved.backgroundImage = await invoke<string>('get_file_as_data_url', { filePath: fullPath });
        console.log('🖼️ Background converted to data URL');
      } catch (error) {
        console.error('Failed to load background:', error);
        // Set to empty string so placeholder is shown
        resolved.backgroundImage = '';
      }
    }

    return resolved;
  };

  // Import/validation state
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationData, setValidationData] = useState<{
    modpackName: string;
    modsWithoutUrl: ModFileInfo[];
    modsInOverrides: string[];
    filePath: string;
  } | null>(null);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [pendingUploadedFiles, setPendingUploadedFiles] = useState<Map<string, File> | null>(null);

  /**
   * Clean up old temp ZIP files (older than 1 hour)
   */
  const cleanupOldTempFiles = async () => {
    try {
      // Future enhancement: implement cleanup of files older than 1 hour
      // For now, we rely on cleanup in performImport which is more efficient
      console.log('[Cleanup] Ready to clean up old temp files on demand');
    } catch (error) {
      console.warn('[Cleanup] Failed to clean old temp files:', error);
    }
  };

  // Sync selectedModpackId with initialModpackId prop
  useEffect(() => {
    setSelectedModpackId(initialModpackId || null);
  }, [initialModpackId]);

  // Load instances on mount and clean up old temp files
  useEffect(() => {
    cleanupOldTempFiles();
    loadInstancesAndMetadata();
  }, []);

  // Listen for installation state changes and reload
  useEffect(() => {
    const handleStateChange = async () => {
      const installingIds = Object.entries(modpackStates)
        .filter(([_, state]) => state.status === 'installing')
        .map(([id]) => id);

      const installedIds = Object.entries(modpackStates)
        .filter(([_, state]) => state.status === 'installed')
        .map(([id]) => id);

      // Track modpacks in initial installation phase (not yet downloading)
      const initialPhaseIds = installingIds.filter(id => {
        const state = modpackStates[id];
        return state.status === 'installing' && !state.downloading;
      });

      // Update importing modpack ID if there's one in initial phase
      if (initialPhaseIds.length > 0) {
        setImportingModpackId(initialPhaseIds[0]);
      } else if (importingModpackId && !installingIds.includes(importingModpackId)) {
        // Clear the ID when installation completes
        setImportingModpackId(null);
      }

      // Create a hash of current installing state to detect when installations complete
      const currentInstallingHash = JSON.stringify(installingIds.sort());

      // Only process if state has actually changed
      if (lastProcessedStateRef.current === currentInstallingHash) {
        return;
      }

      lastProcessedStateRef.current = currentInstallingHash;

      // If we just transitioned from installing to not installing, reload
      // This handles all installation types (Supabase, local ZIP, etc.)
      if (installingIds.length === 0 && installedIds.length > 0) {
        // Save correct modpack metadata before reloading
        await saveInstallingModpackMetadata();
        // Small delay to ensure file is written to disk
        await new Promise(resolve => setTimeout(resolve, 100));
        loadInstancesAndMetadata();
        return;
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
   * Save essential modpack metadata from localStorage
   * Saves: name, logo, backgroundImage (user-editable) + urlModpackZip (for updates)
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
            // Save essential fields: user-editable + descriptions + urlModpackZip for updates
            const essentialMetadata = {
              name: modpack.name || '',
              logo: modpack.logo || '',
              backgroundImage: modpack.backgroundImage || '',
              shortDescription: modpack.shortDescription || '',
              description: modpack.description || '',
              urlModpackZip: modpack.urlModpackZip || '' // Needed for update functionality
            };
            console.log(`📝 Saving essential metadata for ${id}:`, essentialMetadata);
            // Call Tauri to save the metadata file
            await invoke('save_modpack_metadata_json', {
              modpackId: id,
              modpackJson: JSON.stringify(essentialMetadata)
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
              let modpack = JSON.parse(cachedData) as Modpack;
              console.log(`📦 Loaded from cache ${id}:`, {
                backgroundImage: modpack.backgroundImage,
                logo: modpack.logo,
                name: modpack.name,
                shortDescription: modpack.shortDescription,
                description: modpack.description
              });

              // Required fields that should be in cache
              const requiredFields = ['name', 'logo', 'backgroundImage', 'shortDescription', 'description', 'urlModpackZip'];
              const missingFields = requiredFields.filter(
                field => !modpack[field as keyof typeof modpack]
              );
              const isCacheIncomplete = missingFields.length > 0;

              // Check if this is a server modpack (has urlModpackZip) - these need protection flags from server
              const isServerModpack = !!modpack.urlModpackZip;

              // For server modpacks, ALWAYS fetch protection flags from server
              // For local modpacks with incomplete cache, also try to fetch
              if (isServerModpack || isCacheIncomplete) {
                // Try to enrich from server
                if (isCacheIncomplete) {
                  console.log(`🔄 Cache incomplete for ${id} (missing: ${missingFields.join(', ')}), fetching from server...`);
                } else {
                  console.log(`🔒 Fetching protection flags from server for ${id}...`);
                }
                try {
                  const serverData = await launcherService.fetchModpackDetails(id);
                  if (serverData) {
                    // Merge: cache has priority for user-editable fields (name, logo, backgroundImage)
                    // Server fills all other gaps, especially protection flags
                    const enrichedModpack = {
                      ...serverData,
                      ...modpack,
                      // For these specific fields, prefer cache if set, otherwise use server
                      name: modpack.name || serverData.name || '',
                      shortDescription: modpack.shortDescription || serverData.shortDescription || '',
                      description: modpack.description || serverData.description || '',
                      urlModpackZip: modpack.urlModpackZip || serverData.urlModpackZip || '',
                      // Protection flags ALWAYS from server (modpack creator controls these)
                      allowCustomMods: serverData.allowCustomMods,
                      allowCustomResourcepacks: serverData.allowCustomResourcepacks,
                      category: serverData.category,
                    };

                    // Only update cache file if UI fields were missing
                    if (isCacheIncomplete) {
                      await invoke('save_modpack_metadata_json', {
                        modpackId: id,
                        modpackJson: JSON.stringify({
                          name: enrichedModpack.name || '',
                          logo: modpack.logo || serverData.logo || '', // Keep original (may be local path)
                          backgroundImage: modpack.backgroundImage || serverData.backgroundImage || '', // Keep original
                          shortDescription: enrichedModpack.shortDescription,
                          description: enrichedModpack.description,
                          urlModpackZip: enrichedModpack.urlModpackZip
                        })
                      });
                      console.log(`✅ Cache updated for ${id}`);
                    }
                    modpack = enrichedModpack;
                  }
                } catch (enrichError) {
                  console.log(`Could not enrich/fetch protection flags for ${id}:`, enrichError);
                }
              }

              // Resolve relative image paths to file:// URLs
              modpack = await resolveImagePaths(modpack);
              dataMap.set(id, modpack);
              return;
            }

            // Cache miss - try Supabase
            try {
              const modpack = await launcherService.fetchModpackDetails(id);
              if (modpack) {
                // Save to cache for future use
                console.log(`🔄 Cache miss for ${id}, saving server data to cache...`);
                try {
                  await invoke('save_modpack_metadata_json', {
                    modpackId: id,
                    modpackJson: JSON.stringify({
                      name: modpack.name || '',
                      logo: modpack.logo || '',
                      backgroundImage: modpack.backgroundImage || '',
                      shortDescription: modpack.shortDescription || '',
                      description: modpack.description || '',
                      urlModpackZip: modpack.urlModpackZip || ''
                    })
                  });
                  console.log(`✅ Cache created for ${id}`);
                } catch (saveError) {
                  console.log(`Could not save cache for ${id}:`, saveError);
                }
                dataMap.set(id, modpack);
              }
            } catch {
              // Supabase also failed - check if it's a local community modpack
              console.log(`Could not fetch details for ${id} from cache or Supabase`);

              const localInstance = parsedInstances.find(i => i.id === id);
              if (localInstance) {
                console.log(`ℹ️ Using local instance info for ${id}`);
                const modpack: Modpack = {
                  id: localInstance.id,
                  name: localInstance.name,
                  version: localInstance.version,
                  minecraftVersion: localInstance.minecraftVersion,
                  modloader: localInstance.modloader,
                  modloaderVersion: localInstance.modloaderVersion,
                  category: 'community',
                  logo: '',
                  backgroundImage: '',
                  description: '', // Descripciones no disponibles localmente si no están en cache
                  shortDescription: '',
                  urlModpackZip: ''
                };
                dataMap.set(id, modpack);
              }
            }
          } catch (error) {
            console.error(`Error loading metadata for ${id}:`, error);
          }
        })
      );

      setModpackDataMap(dataMap);
    } catch (error) {
      console.error('Error loading local modpacks:', error);
      toast.error(t('errors.failedLoadModpacks'));
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
      }, 50);
    }, 50);
  };

  /**
   * Handle back from details view
   */
  const handleBackToList = () => {
    if (_onNavigate) {
      _onNavigate('my-modpacks');
    } else {
      setIsTransitioning(true);
      setTimeout(() => {
        setSelectedModpackId(null);
        setIsTransitioning(false);
      }, 50);
    }
  };

  /**
   * Update modpack in cache when edited
   */
  const handleModpackUpdated = async (modpackId: string, updates: { name?: string; logo?: string; backgroundImage?: string }) => {
    try {
      // Get current modpack from map
      const currentModpack = modpackDataMap.get(modpackId);
      if (!currentModpack) return;

      // Create updated modpack with new values
      const updated: Modpack = {
        ...currentModpack,
        ...updates
      };

      // If paths were updated, load the images as data URLs
      if (updates.logo || updates.backgroundImage) {
        const resolved = await resolveImagePaths(updated);
        setModpackDataMap(prev => new Map(prev).set(modpackId, resolved));
      } else {
        // Just update the name
        setModpackDataMap(prev => new Map(prev).set(modpackId, updated));
      }
    } catch (error) {
      console.error('Failed to update modpack:', error);
    }
  };

  /**
   * Handle import button click - open native file dialog
   */
  const handleImportModpack = async () => {
    setValidating(false);

    try {
      const filePath = await open({
        multiple: false,
        filters: [
          {
            name: 'Modpack Files',
            extensions: ['zip', 'mrpack']
          }
        ],
        title: 'Select Modpack File'
      });

      if (!filePath) return; // User cancelled

      console.log('[Import] Selected file:', filePath);

      // Process the selected file
      await handleFileSelected(filePath as string);
    } catch (error) {
      console.error('[Import] Failed to open file dialog:', error);
      toast.error('Failed to open file dialog');
    }
  };

  /**
   * Handle file selection from path
   */
  const handleFileSelected = async (filePath: string) => {
    if (!filePath.endsWith('.zip') && !filePath.endsWith('.mrpack')) {
      toast.error(t('validation.selectZipFile'));
      return;
    }

    try {
      setValidating(true);
      setShowValidationProgress(true);
      setValidationProgressMessage(t('myModpacks.validating'));

      // Validate the modpack from the file path
      const result = await validationService.validateModpackZipFromPath(filePath);

      if (!result.success) {
        setShowValidationProgress(false);
        toast.error(result.error || t('errors.failedValidateModpack'));
        return;
      }

      setShowValidationProgress(false);

      // Check for missing mods
      const missingMods = result.modsWithoutUrl.filter(
        (mod: typeof result.modsWithoutUrl[number]) => !result.modsInOverrides?.includes(mod.fileName)
      );

      if (result.modsWithoutUrl && result.modsWithoutUrl.length > 0 && missingMods.length > 0) {
        // Show validation dialog for missing files
        setValidationData({
          modpackName: result.manifest?.name || filePath.split('/').pop() || 'Modpack',
          modsWithoutUrl: result.modsWithoutUrl,
          modsInOverrides: result.modsInOverrides || [],
          filePath
        });
        setShowValidationDialog(true);
      } else {
        // No missing files - proceed directly
        await performImport(filePath);
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
  const performImport = async (filePath: string) => {
    try {
      console.log('[Import] Starting import from path:', filePath);
      await installModpackFromZip(filePath);

      // Reload instances
      await loadInstancesAndMetadata();

      // Refresh launcher data to update modpack states from backend
      await refreshData();
    } catch (error) {
      console.error('[Import] Error installing modpack from ZIP:', error);
      toast.error(error instanceof Error ? error.message : t('errors.failedInstallModpack'));
    } finally {
      // Clean up temp ZIP file if it was created
      if (tempZipPath) {
        try {
          // const { remove } = await import('@tauri-apps/plugin-fs');
          await remove(tempZipPath);
          console.log(`[Cleanup] Deleted temp ZIP: ${tempZipPath}`);
        } catch (cleanupError) {
          console.warn(`[Cleanup] Failed to delete temp ZIP ${tempZipPath}:`, cleanupError);
          // Don't throw - cleanup failure shouldn't block the import success
        }
        setTempZipPath(null);
      }
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
        await performImport(validationData.filePath);
      }
    }
  };

  /**
   * Handle skip download - import WITH uploaded files included (but don't download the updated ZIP to disk)
   * This creates a temp ZIP with overrides and imports it, then cleans up
   */
  const handleSkipDownload = async () => {
    if (validationData) {
      try {
        // If there are pending uploaded files, prepare the ZIP with overrides
        let zipToImport = validationData.filePath;
        if (pendingUploadedFiles && pendingUploadedFiles.size > 0) {
          console.log(`[Import] Preparing ZIP with ${pendingUploadedFiles.size} uploaded file(s)...`);
          zipToImport = await prepareZipWithOverrides(validationData.filePath, pendingUploadedFiles);
        }

        await performImport(zipToImport);
        setPendingUploadedFiles(null);
        setValidationData(null);
      } catch (error) {
        console.error('Error importing modpack:', error);
        toast.error(error instanceof Error ? error.message : t('errors.failedInstallModpack'));
      }
    }
  };

  /**
   * Prepare ZIP with uploaded mods/resourcepacks in correct folders
   * Saves the updated ZIP to a temp directory and returns the path
   */
  const prepareZipWithOverrides = async (filePath: string, uploadedFiles: Map<string, File>): Promise<string> => {
    try {
      // Read original ZIP from path
      // const { readFile, writeFile } = await import('@tauri-apps/plugin-fs');
      const originalZipBuffer = await readFile(filePath);
      const originalZip = new JSZip();
      await originalZip.loadAsync(originalZipBuffer);

      // Add uploaded files to appropriate overrides folder based on file type
      for (const file of uploadedFiles.values()) {
        const fileBuffer = await file.arrayBuffer();

        // Determine target folder based on file extension
        let targetPath: string;
        if (file.name.endsWith('.jar')) {
          targetPath = `overrides/mods/${file.name}`;
        } else if (file.name.endsWith('.zip')) {
          targetPath = `overrides/resourcepacks/${file.name}`;
        } else {
          console.warn(`[ZIP] Unknown file extension, skipping: ${file.name}`);
          continue;
        }

        originalZip.file(targetPath, fileBuffer);
        console.log(`[ZIP] Added to ZIP: ${targetPath}`);
      }

      // Generate new ZIP blob
      const updatedZipBlob = await originalZip.generateAsync({ type: 'blob' });
      const updatedZipBuffer = await updatedZipBlob.arrayBuffer();

      // Save to temp directory
      const tempDirPath = await tempDir();
      const timestamp = Date.now();
      const fileName = filePath.split('/').pop() || 'modpack.zip';
      const outputPath = `${tempDirPath}/luminakraft-modpack-${timestamp}-${fileName}`;

      // Write the updated ZIP to temp directory
      await writeFile(outputPath, new Uint8Array(updatedZipBuffer));

      console.log(`[ZIP] Created updated ZIP with ${uploadedFiles.size} file(s) at: ${outputPath}`);

      // Track temp ZIP for cleanup
      setTempZipPath(outputPath);

      return outputPath;
    } catch (error) {
      console.error('[ZIP] Failed to create updated ZIP, using original:', error);
      toast.error(t('errors.failedCreateZip'));
      // Return original path as fallback
      return filePath;
    }
  };

  /**
   * Handle download dialog confirmation
   */
  const handleDownloadDialogConfirm = async () => {
    if (validationData && pendingUploadedFiles) {
      try {
        setShowDownloadDialog(false);

        // Prepare ZIP in memory with overrides (silently)
        const updatedZip = await prepareZipWithOverrides(validationData.filePath, pendingUploadedFiles);

        // Import the updated ZIP
        await performImport(updatedZip);

        setPendingUploadedFiles(null);
        setValidationData(null);
      } catch (error) {
        console.error('Error preparing modpack with overrides:', error);
        toast.error(t('myModpacks.failedPrepareModpack'));
        setShowDownloadDialog(false);
      }
    }
  };

  // Note: No loading state shown for MyModpacksPage since local data loads instantly
  // Showing skeleton would cause an unpleasant flash

  // Details view
  if (selectedModpackId) {
    let state = modpackStates[selectedModpackId];
    const cachedData = modpackDataMap.get(selectedModpackId);
    const instance = instances.find(i => i.id === selectedModpackId);

    // Merge cached UI data (name, logo, backgroundImage) with instance technical data
    let modpack: Modpack;
    if (instance) {
      modpack = {
        id: instance.id,
        name: cachedData?.name || instance.name,
        description: cachedData?.description || '',
        shortDescription: cachedData?.shortDescription || `${t('myModpacks.importedOn')} ${new Date(instance.installedAt).toLocaleDateString()}`,
        version: instance.version,
        minecraftVersion: instance.minecraftVersion,
        modloader: instance.modloader,
        modloaderVersion: instance.modloaderVersion,
        logo: cachedData?.logo || '',
        backgroundImage: cachedData?.backgroundImage || '',
        urlModpackZip: cachedData?.urlModpackZip || '', // From cache for update functionality
        category: cachedData?.category || 'community',
        // Protection flags from server data (cached)
        allowCustomMods: cachedData?.allowCustomMods,
        allowCustomResourcepacks: cachedData?.allowCustomResourcepacks,
        isActive: true,
        isNew: false,
        isComingSoon: false
      } as Modpack;
    } else if (cachedData) {
      // Installing modpack - use cached data
      modpack = cachedData;
    } else {
      // Placeholder for unknown modpack
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

    // Create default state if not found
    if (!state) {
      state = {
        status: 'installed' as const,
        installed: true,
        downloading: false,
        progress: { percentage: 0 }
      };
    }

    if (modpack && state) {
      return (
        <div
          className={`h-full w-full transition-opacity duration-75 ease-out ${isTransitioning ? 'opacity-0' : 'opacity-100'
            }`}
        >
          <ModpackDetailsRefactored
            modpack={modpack}
            state={state}
            onBack={handleBackToList}
            isReadOnly={false}
            onModpackUpdated={(updates) => handleModpackUpdated(selectedModpackId!, updates)}
            onNavigate={(section, modpackId) => {
              if (section === 'my-modpacks' && !modpackId) {
                handleBackToList();
                return;
              }
              if (_onNavigate) {
                _onNavigate(section, modpackId);
              }
            }}
            isLoadingDetails={loading}
          />
        </div>
      );
    }
  }

  // Main list view
  return (
    <div
      className={`max-w-7xl mx-auto p-6 transition-opacity duration-75 ease-out ${isTransitioning ? 'opacity-0' : 'opacity-100'
        }`}
    >
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
                    // Don't remove here - keep for re-renders while installing
                    // Will be cleaned up after install completes
                  }
                } catch (error) {
                  console.error('Failed to load modpack from localStorage:', error);
                }
              }

              // If we have data from cache/localStorage/Supabase (from Explore), use it
              // Only show "Importing" placeholder if NO data (local ZIP import)
              const modpack: Modpack = modpackData ? {
                ...modpackData,
                id // Ensure id is always set from the loop variable
              } : {
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
                  onModpackUpdated={(updates) => handleModpackUpdated(id, updates)}
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
                // Use cached data, but override with instance data (versions + id)
                modpack = {
                  ...cachedData,
                  id: instance.id, // Ensure id is always set from instance
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
                  onModpackUpdated={(updates) => handleModpackUpdated(instance.id, updates)}
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
        onCancel={handleSkipDownload}
        title={t('myModpacks.downloadDialog.title')}
        message={t('myModpacks.downloadDialog.message', { count: pendingUploadedFiles?.size || 0 })}
        confirmText={t('myModpacks.downloadDialog.downloadButton')}
        cancelText={t('myModpacks.downloadDialog.skipButton')}
        variant="info"
      />

      {/* Validation Progress Modal - only show during validation, not during import */}
      {showValidationProgress && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9998]">
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg shadow-2xl p-8 flex flex-col items-center gap-4 w-full max-w-sm">
            <Loader className="w-12 h-12 text-blue-400 animate-spin" />
            <h2 className="text-xl font-semibold text-white text-center">
              {t('myModpacks.validating')}
            </h2>
            <p className="text-sm text-gray-400 text-center">
              {t('myModpacks.validatingDescription')}
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default MyModpacksPage;
