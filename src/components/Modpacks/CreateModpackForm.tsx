import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import ModpackManagementService from '../../services/modpackManagementService';

interface FormData {
  name: { en: string; es: string };
  shortDescription: { en: string; es: string };
  description: { en: string; es: string };
  version: string;
  minecraftVersion: string;
  modloader: 'forge' | 'fabric' | 'neoforge' | 'quilt';
  modloaderVersion: string;
  gamemode?: string;
  serverIp?: string;
  primaryColor: string;
}

interface CreateModpackFormProps {
  onNavigate?: (section: string) => void;
}

export function CreateModpackForm({ onNavigate }: CreateModpackFormProps) {
  const { t } = useTranslation();
  const service = ModpackManagementService.getInstance();

  const [formData, setFormData] = useState<FormData>({
    name: { en: '', es: '' },
    shortDescription: { en: '', es: '' },
    description: { en: '', es: '' },
    version: '1.0.0',
    minecraftVersion: '1.20.1',
    modloader: 'forge',
    modloaderVersion: '47.2.0',
    primaryColor: '#3b82f6'
  });

  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const updateFormData = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateI18nField = (field: 'name' | 'shortDescription' | 'description', lang: 'en' | 'es', value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: { ...prev[field], [lang]: value }
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.name.en || !formData.name.es) {
      toast.error('Name is required in both languages');
      return false;
    }
    if (!formData.version) {
      toast.error('Version is required');
      return false;
    }
    if (!formData.minecraftVersion) {
      toast.error('Minecraft version is required');
      return false;
    }
    if (!formData.modloaderVersion) {
      toast.error('Modloader version is required');
      return false;
    }
    if (!zipFile) {
      toast.error('Modpack ZIP file is required');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsUploading(true);

    try {
      // 1. Create modpack in database
      const { success, modpackId, error } = await service.createModpack({
        slug: formData.name.en.toLowerCase().replace(/\s+/g, '-'),
        category: 'community', // Auto-detected by role in service
        name: formData.name,
        shortDescription: formData.shortDescription,
        description: formData.description,
        version: formData.version,
        minecraftVersion: formData.minecraftVersion,
        modloader: formData.modloader,
        modloaderVersion: formData.modloaderVersion,
        gamemode: formData.gamemode,
        serverIp: formData.serverIp,
        primaryColor: formData.primaryColor
      });

      if (!success || !modpackId) {
        toast.error(`Error creating modpack: ${error}`);
        return;
      }

      // 2. Upload ZIP file
      if (zipFile) {
        const uploadResult = await service.uploadModpackFile(
          modpackId,
          zipFile,
          setUploadProgress
        );

        if (!uploadResult.success) {
          toast.error(`Error uploading file: ${uploadResult.error}`);
          return;
        }

        // 3. Activate modpack
        await service.updateModpack(modpackId, { isActive: true });
      }

      toast.success('Modpack created successfully!');
      onNavigate?.('my-modpacks');
    } catch (error) {
      console.error('Error creating modpack:', error);
      toast.error('Failed to create modpack');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
        Create Modpack
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Basic Information
          </h2>

          {/* Name EN */}
          <div className="mb-4">
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Name (English) *
            </label>
            <input
              type="text"
              value={formData.name.en}
              onChange={(e) => updateI18nField('name', 'en', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              required
              placeholder="My Awesome Modpack"
            />
          </div>

          {/* Name ES */}
          <div className="mb-4">
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Nombre (Español) *
            </label>
            <input
              type="text"
              value={formData.name.es}
              onChange={(e) => updateI18nField('name', 'es', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              required
              placeholder="Mi Increíble Modpack"
            />
          </div>

          {/* Short Description EN */}
          <div className="mb-4">
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Short Description (English)
            </label>
            <input
              type="text"
              value={formData.shortDescription.en}
              onChange={(e) => updateI18nField('shortDescription', 'en', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder="A brief description of your modpack"
            />
          </div>

          {/* Short Description ES */}
          <div className="mb-4">
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Descripción Corta (Español)
            </label>
            <input
              type="text"
              value={formData.shortDescription.es}
              onChange={(e) => updateI18nField('shortDescription', 'es', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder="Una breve descripción de tu modpack"
            />
          </div>

          {/* Description EN */}
          <div className="mb-4">
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Description (English)
            </label>
            <textarea
              value={formData.description.en}
              onChange={(e) => updateI18nField('description', 'en', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[100px]"
              placeholder="Full description of your modpack..."
            />
          </div>

          {/* Description ES */}
          <div className="mb-4">
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Descripción (Español)
            </label>
            <textarea
              value={formData.description.es}
              onChange={(e) => updateI18nField('description', 'es', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[100px]"
              placeholder="Descripción completa de tu modpack..."
            />
          </div>
        </div>

        {/* Technical Details */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Technical Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Version */}
            <div>
              <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                Version *
              </label>
              <input
                type="text"
                value={formData.version}
                onChange={(e) => updateFormData('version', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                required
                placeholder="1.0.0"
              />
            </div>

            {/* Minecraft Version */}
            <div>
              <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                Minecraft Version *
              </label>
              <input
                type="text"
                value={formData.minecraftVersion}
                onChange={(e) => updateFormData('minecraftVersion', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                required
                placeholder="1.20.1"
              />
            </div>

            {/* Modloader */}
            <div>
              <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                Modloader *
              </label>
              <select
                value={formData.modloader}
                onChange={(e) => updateFormData('modloader', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="forge">Forge</option>
                <option value="fabric">Fabric</option>
                <option value="neoforge">NeoForge</option>
                <option value="quilt">Quilt</option>
              </select>
            </div>

            {/* Modloader Version */}
            <div>
              <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                Modloader Version *
              </label>
              <input
                type="text"
                value={formData.modloaderVersion}
                onChange={(e) => updateFormData('modloaderVersion', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                required
                placeholder="47.2.0"
              />
            </div>

            {/* Gamemode */}
            <div>
              <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                Gamemode (Optional)
              </label>
              <input
                type="text"
                value={formData.gamemode || ''}
                onChange={(e) => updateFormData('gamemode', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                placeholder="survival, creative, pvp, rpg, etc."
              />
            </div>

            {/* Server IP */}
            <div>
              <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                Server IP (Optional)
              </label>
              <input
                type="text"
                value={formData.serverIp || ''}
                onChange={(e) => updateFormData('serverIp', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                placeholder="play.example.com"
              />
            </div>

            {/* Primary Color */}
            <div>
              <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                Primary Color
              </label>
              <input
                type="color"
                value={formData.primaryColor}
                onChange={(e) => updateFormData('primaryColor', e.target.value)}
                className="w-full h-12 px-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* File Upload */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Modpack File
          </h2>

          <div>
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Modpack ZIP File *
            </label>
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setZipFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              required
            />
            {zipFile && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Selected: {zipFile.name} ({(zipFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="mt-4">
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
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={isUploading}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {isUploading ? `Uploading... ${Math.round(uploadProgress)}%` : 'Create Modpack'}
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('my-modpacks')}
            disabled={isUploading}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateModpackForm;
