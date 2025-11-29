import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import ModpackManagementService from '../../services/modpackManagementService';
import AuthService from '../../services/authService';
import { supabase } from '../../services/supabaseClient';

interface FormData {
  name: { en: string; es: string };
  shortDescription: { en: string; es: string };
  description: { en: string; es: string };
  version: string;
  minecraftVersion: string;
  modloader: string;
  modloaderVersion: string;
  gamemode: string;
  serverIp: string;
  primaryColor: string;
  isActive: boolean;
}

interface EditModpackFormProps {
  modpackId: string;
  onNavigate?: (_section: string) => void;
}

export function EditModpackForm({ modpackId, onNavigate }: EditModpackFormProps) {
  const service = ModpackManagementService.getInstance();
  const authService = AuthService.getInstance();

  const [formData, setFormData] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newVersion, setNewVersion] = useState('');
  const [changelog, setChangelog] = useState({ en: '', es: '' });
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    loadModpackData();
  }, [modpackId]);

  const loadModpackData = async () => {
    if (!modpackId) {
      toast.error('Modpack ID is required');
      onNavigate?.('my-modpacks');
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('modpacks')
        .select('*')
        .eq('id', modpackId)
        .single<{
          name_i18n: { en: string; es: string };
          short_description_i18n: { en: string; es: string };
          description_i18n: { en: string; es: string };
          version: string;
          minecraft_version: string;
          modloader: string;
          modloader_version: string;
          gamemode: string | null;
          server_ip: string | null;
          primary_color: string | null;
          is_active: boolean;
        }>();

      if (error || !data) {
        toast.error('Failed to load modpack');
        onNavigate?.('my-modpacks');
        return;
      }

      setFormData({
        name: data.name_i18n || { en: '', es: '' },
        shortDescription: data.short_description_i18n || { en: '', es: '' },
        description: data.description_i18n || { en: '', es: '' },
        version: data.version || '',
        minecraftVersion: data.minecraft_version || '',
        modloader: data.modloader || 'forge',
        modloaderVersion: data.modloader_version || '',
        gamemode: data.gamemode || '',
        serverIp: data.server_ip || '',
        primaryColor: data.primary_color || '#3b82f6',
        isActive: data.is_active || false
      });
    } catch (error) {
      console.error('Error loading modpack:', error);
      toast.error('Failed to load modpack');
    } finally {
      setLoading(false);
    }
  };

  const updateFormData = (field: string, value: any) => {
    if (!formData) return;
    setFormData(prev => prev ? ({ ...prev, [field]: value }) : null);
  };

  const updateI18nField = (field: 'name' | 'shortDescription' | 'description', lang: 'en' | 'es', value: string) => {
    if (!formData) return;
    setFormData(prev => prev ? ({
      ...prev,
      [field]: { ...prev[field], [lang]: value }
    }) : null);
  };

  const handleSaveMetadata = async () => {
    if (!formData || !modpackId) return;

    try {
      setIsUpdating(true);

      // CRITICAL: Sync roles before updating modpack to ensure fresh permissions
      const toastId = toast.loading('Verifying permissions...');

      try {
        await authService.syncDiscordRoles();
      } catch (syncError) {
        console.error('Failed to sync roles:', syncError);
        toast.error('Failed to verify permissions. Please try again.', { id: toastId });
        setIsUpdating(false);
        return;
      }

      toast.loading('Updating modpack...', { id: toastId });

      const { success, error } = await service.updateModpack(modpackId, {
        name: formData.name,
        shortDescription: formData.shortDescription,
        description: formData.description,
        version: formData.version,
        minecraftVersion: formData.minecraftVersion,
        modloaderVersion: formData.modloaderVersion,
        gamemode: formData.gamemode,
        serverIp: formData.serverIp,
        primaryColor: formData.primaryColor,
        isActive: formData.isActive
      });

      if (success) {
        toast.success('Modpack updated successfully', { id: toastId });
      } else {
        toast.error(`Error updating modpack: ${error}`, { id: toastId });
      }
    } catch (error) {
      console.error('Error updating modpack:', error);
      toast.error('Failed to update modpack');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUploadNewVersion = async () => {
    if (!modpackId || !zipFile || !newVersion) {
      toast.error('Version and ZIP file are required');
      return;
    }

    try {
      setIsUpdating(true);

      // CRITICAL: Sync roles before uploading new version to ensure fresh permissions
      const toastId = toast.loading('Verifying permissions...');

      try {
        await authService.syncDiscordRoles();
      } catch (syncError) {
        console.error('Failed to sync roles:', syncError);
        toast.error('Failed to verify permissions. Please try again.', { id: toastId });
        setIsUpdating(false);
        return;
      }

      toast.loading('Uploading new version...', { id: toastId });

      // 1. Upload new file
      const uploadResult = await service.uploadModpackFile(
        modpackId,
        zipFile,
        setUploadProgress
      );

      if (!uploadResult.success) {
        toast.error(`Error uploading file: ${uploadResult.error}`, { id: toastId });
        return;
      }

      // 2. Update version
      await service.updateModpack(modpackId, {
        version: newVersion
      });

      // 3. Create version entry in modpack_versions with changelog
      const { error } = await supabase
        .from('modpack_versions')
        .insert({
          modpack_id: modpackId,
          version: newVersion,
          changelog_i18n: changelog,
          file_url: uploadResult.fileUrl
        } as any);

      if (error) {
        console.error('Error creating version entry:', error);
      }

      toast.success('New version uploaded successfully', { id: toastId });
      setNewVersion('');
      setChangelog({ en: '', es: '' });
      setZipFile(null);
      loadModpackData();
    } catch (error) {
      console.error('Error uploading new version:', error);
      toast.error('Failed to upload new version');
    } finally {
      setIsUpdating(false);
      setUploadProgress(0);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!formData) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
        Edit Modpack
      </h1>

      {/* Metadata Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Metadata
        </h2>

        <div className="space-y-4">
          {/* Name EN */}
          <div>
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Name (English)
            </label>
            <input
              type="text"
              value={formData.name.en}
              onChange={(e) => updateI18nField('name', 'en', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Name ES */}
          <div>
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Nombre (Español)
            </label>
            <input
              type="text"
              value={formData.name.es}
              onChange={(e) => updateI18nField('name', 'es', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Short Description EN */}
          <div>
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Short Description (English)
            </label>
            <input
              type="text"
              value={formData.shortDescription.en}
              onChange={(e) => updateI18nField('shortDescription', 'en', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Short Description ES */}
          <div>
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Descripción Corta (Español)
            </label>
            <input
              type="text"
              value={formData.shortDescription.es}
              onChange={(e) => updateI18nField('shortDescription', 'es', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description EN */}
          <div>
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Description (English)
            </label>
            <textarea
              value={formData.description.en}
              onChange={(e) => updateI18nField('description', 'en', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[100px]"
            />
          </div>

          {/* Description ES */}
          <div>
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Descripción (Español)
            </label>
            <textarea
              value={formData.description.es}
              onChange={(e) => updateI18nField('description', 'es', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[100px]"
            />
          </div>

          {/* Active Status */}
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => updateFormData('isActive', e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              id="isActive"
            />
            <label htmlFor="isActive" className="ml-2 text-gray-700 dark:text-gray-300 font-medium">
              Active (visible to users)
            </label>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleSaveMetadata}
            disabled={isUpdating}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
          >
            {isUpdating ? 'Saving...' : 'Save Metadata'}
          </button>
        </div>
      </div>

      {/* New Version Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Upload New Version
        </h2>

        <div className="space-y-4">
          {/* Current Version */}
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Current Version: <span className="font-semibold text-gray-900 dark:text-white">{formData.version}</span>
            </p>
          </div>

          {/* New Version */}
          <div>
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              New Version
            </label>
            <input
              type="text"
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder="1.1.0"
            />
          </div>

          {/* Changelog EN */}
          <div>
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Changelog (English)
            </label>
            <textarea
              value={changelog.en}
              onChange={(e) => setChangelog(prev => ({ ...prev, en: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[100px]"
              placeholder="- Added new features&#10;- Fixed bugs&#10;- Improved performance"
            />
          </div>

          {/* Changelog ES */}
          <div>
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Changelog (Español)
            </label>
            <textarea
              value={changelog.es}
              onChange={(e) => setChangelog(prev => ({ ...prev, es: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[100px]"
              placeholder="- Nuevas características&#10;- Corrección de errores&#10;- Mejoras de rendimiento"
            />
          </div>

          {/* ZIP File */}
          <div>
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              New Modpack ZIP File
            </label>
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setZipFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
            />
            {zipFile && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Selected: {zipFile.name} ({(zipFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* Upload Progress */}
          {isUpdating && uploadProgress > 0 && (
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Uploading...
                </span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {Math.round(uploadProgress)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                <div
                  className="bg-blue-600 h-4 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleUploadNewVersion}
            disabled={isUpdating || !newVersion || !zipFile}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors"
          >
            {isUpdating ? 'Uploading...' : 'Upload New Version'}
          </button>
        </div>
      </div>

      {/* Back Button */}
      <div>
        <button
          onClick={() => onNavigate?.('my-modpacks')}
          className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors"
        >
          Back to My Modpacks
        </button>
      </div>
    </div>
  );
}

export default EditModpackForm;
