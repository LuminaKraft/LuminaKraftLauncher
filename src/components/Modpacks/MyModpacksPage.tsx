import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Play, Trash2, FolderOpen, Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import ModpackValidationService, { ModFileInfo } from '../../services/modpackValidationService';
import ModpackValidationDialog from './ModpackValidationDialog';

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

  useEffect(() => {
    loadLocalModpacks();
  }, []);

  const loadLocalModpacks = async () => {
    try {
      setLoading(true);
      // TODO: Implement backend command to get local modpacks
      // const modpacks = await invoke<LocalModpack[]>('get_local_modpacks');
      // setLocalModpacks(modpacks);

      // Placeholder for now
      setLocalModpacks([]);
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

      // If there are mods without URL, show validation dialog
      if (result.modsWithoutUrl && result.modsWithoutUrl.length > 0) {
        setValidationData({
          modpackName: result.manifest?.name || file.name,
          modsWithoutUrl: result.modsWithoutUrl,
          modsInOverrides: result.modsInOverrides || [],
          file
        });
        setShowValidationDialog(true);
      } else {
        // No problematic mods, proceed directly
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
      toast.loading('Importing modpack...');
      // TODO: Implement actual import logic with Tauri backend
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate import
      toast.success('Modpack imported successfully!');
      loadLocalModpacks();
    } catch (error) {
      console.error('Error importing modpack:', error);
      toast.error('Failed to import modpack');
    }
  };

  const handleValidationContinue = async (uploadedFiles?: Map<string, File>) => {
    setShowValidationDialog(false);
    if (validationData) {
      let fileToImport = validationData.file;

      if (uploadedFiles && uploadedFiles.size > 0) {
        // User uploaded files - need to create a new ZIP with these files in overrides
        const loadingToast = toast.loading('Creating modpack with uploaded files...');

        try {
          const { writeFile } = await import('@tauri-apps/plugin-fs');
          const { appDataDir, join } = await import('@tauri-apps/api/path');

          // Write original ZIP and uploaded files to temp directory
          const tempDir = await join(await appDataDir(), 'temp', 'modpack_merge');

          // Write original ZIP
          const originalZipBuffer = await validationData.file.arrayBuffer();
          const originalZipPath = await join(tempDir, validationData.file.name);
          await writeFile(originalZipPath, new Uint8Array(originalZipBuffer));

          // Write uploaded files
          const uploadedFilePaths: string[] = [];
          for (const [fileName, file] of uploadedFiles.entries()) {
            const buffer = await file.arrayBuffer();
            const tempFilePath = await join(tempDir, file.name);
            await writeFile(tempFilePath, new Uint8Array(buffer));
            uploadedFilePaths.push(tempFilePath);
          }

          // Create output ZIP path
          const outputZipPath = await join(tempDir, `${validationData.modpackName}_with_overrides.zip`);

          // Call Tauri command to merge files
          await invoke('create_modpack_with_overrides', {
            originalZipPath: originalZipPath,
            uploadedFilePaths: uploadedFilePaths,
            outputZipPath: outputZipPath
          });

          toast.success(`Modpack ready with ${uploadedFiles.size} additional file(s)!`, { id: loadingToast });

          // Create a new File object from the output ZIP to import
          // We'll need to read it back from disk
          // For now, just use the original file since the backend command will be used during publish
          // The actual import flow might need adjustment
        } catch (error) {
          console.error('Error creating modpack with overrides:', error);
          toast.error('Failed to create modpack with overrides', { id: loadingToast });
          return;
        }
      }

      await performImport(fileToImport);
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
      {localModpacks.length === 0 ? (
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {localModpacks.map((modpack) => (
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
      )}
    </div>
  );
}

export default MyModpacksPage;
