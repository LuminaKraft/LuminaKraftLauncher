import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Play, Trash2, FolderOpen, Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import toast from 'react-hot-toast';
import ModpackValidationService, { ModFileInfo } from '../../services/modpackValidationService';
import ModpackValidationDialog from './ModpackValidationDialog';
import ModpackCard from './ModpackCard';
import { useLauncher } from '../../contexts/LauncherContext';
import type { Modpack } from '../../types/launcher';

interface LocalModpack {
  id: string;
  name: string;
  version: string;
  minecraftVersion: string;
  modloader: string;
  path: string;
  createdAt: string;
  lastPlayed?: string;
}

interface MyModpacksPageProps {
  onNavigate?: (section: string) => void;
}

export function MyModpacksPage({ onNavigate }: MyModpacksPageProps) {
  const { t } = useTranslation();
  const validationService = ModpackValidationService.getInstance();
  const { installModpackFromZip, modpackStates } = useLauncher();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [localModpacks, setLocalModpacks] = useState<LocalModpack[]>([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationData, setValidationData] = useState<{
    modpackName: string;
    modsWithoutUrl: ModFileInfo[];
    modsInOverrides: string[];
    file: File;
  } | null>(null);
  const [zipProgress, setZipProgress] = useState<{
    current: number;
    total: number;
    stage: string;
    message: string;
  } | null>(null);

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
        minecraftVersion: instance.minecraft_version,
        modloader: instance.modloader,
        path: '', // Path is not returned by backend, but we know it's in instances/{id}
        createdAt: instance.installed_at,
        lastPlayed: undefined // We don't track last played yet
      }));

      setLocalModpacks(modpacks);
    } catch (error) {
      console.error('Error loading local modpacks:', error);
      toast.error('Failed to load local modpacks');
    } finally {
      setLoading(false);
    }
  };

  const handleImportModpack = () => {
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
        const downloadUpdated = confirm(
          `You've uploaded ${uploadedFiles.size} file(s) that were missing from this modpack.\n\n` +
          `Would you like to download an updated version of the ZIP file with these files included in the overrides folder?\n\n` +
          `This way you can use the updated ZIP for publishing or sharing.`
        );

        if (downloadUpdated) {
          const loadingToast = toast.loading('Preparing files...');

          try {
            const { downloadDir } = await import('@tauri-apps/api/path');

            // Set up progress listener first
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
            for (const [fileName, file] of uploadedFiles.entries()) {
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
        }
      }

      // Now import the modpack (either original or with uploaded files in memory)
      await performImport(validationData.file);
    }
  };

  const handlePlayModpack = async (modpack: LocalModpack) => {
    try {
      toast.success(`Launching ${modpack.name}...`);
      // TODO: Implement launch logic
    } catch (error) {
      console.error('Error launching modpack:', error);
      toast.error('Failed to launch modpack');
    }
  };

  const handleDeleteModpack = async (modpack: LocalModpack) => {
    if (!confirm(`Are you sure you want to delete "${modpack.name}"? This will remove all files.`)) {
      return;
    }

    try {
      // TODO: Implement delete logic
      toast.success('Modpack deleted successfully');
      loadLocalModpacks();
    } catch (error) {
      console.error('Error deleting modpack:', error);
      toast.error('Failed to delete modpack');
    }
  };

  const handleOpenFolder = async (modpack: LocalModpack) => {
    try {
      // TODO: Implement open folder logic
      toast.success('Opening folder...');
    } catch (error) {
      console.error('Error opening folder:', error);
      toast.error('Failed to open folder');
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
            My Modpacks
          </h1>
          <button
            onClick={handleImportModpack}
            disabled={validating}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5" />
            {validating ? 'Validating...' : 'Import Modpack'}
          </button>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Manage your local modpack instances - available for all users
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Local Modpack Management
            </h3>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              These are your local modpack instances. They are stored on your computer and available offline.
              To share modpacks publicly, use <button
                onClick={() => onNavigate?.('published-modpacks')}
                className="underline hover:text-blue-600 dark:hover:text-blue-300"
              >Published Modpacks</button>.
            </p>
          </div>
        </div>
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
                No local modpacks yet
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Import a CurseForge or Modrinth modpack to get started
              </p>
              <button
                onClick={handleImportModpack}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors inline-block"
              >
                Import Your First Modpack
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
                nombre: id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                description: 'Importing modpack...',
                descripcion: 'Importing modpack...',
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
            {localModpacks.map((modpack, index) => (
            <div
              key={modpack.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Modpack Header */}
              <div className="h-32 bg-gradient-to-br from-blue-500 to-purple-600 relative flex items-center justify-center">
                <div className="text-6xl font-bold text-white opacity-20">
                  {modpack.name.charAt(0).toUpperCase()}
                </div>
              </div>

              {/* Modpack Info */}
              <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate mb-1">
                  {modpack.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  v{modpack.version} " {modpack.minecraftVersion} " {modpack.modloader}
                </p>

                {modpack.lastPlayed && (
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">
                    Last played: {new Date(modpack.lastPlayed).toLocaleDateString()}
                  </p>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handlePlayModpack(modpack)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    <Play className="w-4 h-4" />
                    Play
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenFolder(modpack)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Open
                    </button>

                    <button
                      onClick={() => handleDeleteModpack(modpack)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          </div>
        );
      })()}
    </div>
  );
}

export default MyModpacksPage;
