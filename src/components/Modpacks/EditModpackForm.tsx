import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Save, Upload, Plus, X, Trash2, Image as ImageIcon,
  FileText, Package, Settings, Layers, History,
  RefreshCw
} from 'lucide-react';
import ModpackManagementService from '../../services/modpackManagementService';
import R2UploadService from '../../services/r2UploadService';
import AuthService from '../../services/authService';
import { supabase } from '../../services/supabaseClient';
import { ConfirmDialog } from '../Common/ConfirmDialog';
import { useModpackValidation } from '../../hooks/useModpackValidation';
import { ModpackValidationDialog } from './ModpackValidationDialog';

interface Feature {
  id?: string;
  title: { en: string; es: string };
  description: { en: string; es: string };
  icon: string;
}

interface ModpackImage {
  id: string;
  image_url: string;
  sort_order: number;
}

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
  isComingSoon: boolean;
  logoUrl?: string;
  bannerUrl?: string;
}

interface EditModpackFormProps {
  modpackId: string;
  onNavigate?: (_section: string) => void;
}

export function EditModpackForm({ modpackId, onNavigate }: EditModpackFormProps) {
  const { t } = useTranslation();
  const service = ModpackManagementService.getInstance();
  const authService = AuthService.getInstance();

  // State
  const [activeTab, setActiveTab] = useState<'general' | 'media' | 'features' | 'versions' | 'settings'>('general');
  const [formData, setFormData] = useState<FormData | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [images, setImages] = useState<ModpackImage[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Version Upload State
  const [newVersion, setNewVersion] = useState('');
  const [changelog, setChangelog] = useState({ en: '', es: '' });
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [isDraggingBanner, setIsDraggingBanner] = useState(false);
  const [isDraggingScreenshots, setIsDraggingScreenshots] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isParsing,
    validationData,
    showValidationDialog,
    setShowValidationDialog,
    manifestParsed,
    validateAndParseManifest,
    resetValidation
  } = useModpackValidation({
    onManifestParsed: (data) => {
      if (data.version) setNewVersion(data.version);
      // We don't auto-fill other fields here to avoid overwriting existing modpack data accidentally
      // but we could if we wanted to allow updating modpack metadata from the new version ZIP
    }
  });

  // Dialog State
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    loadModpackData();
  }, [modpackId]);

  const loadModpackData = async () => {
    if (!modpackId) return;

    try {
      setLoading(true);

      // 1. Fetch Modpack Data
      const { data, error } = await supabase
        .from('modpacks')
        .select('*')
        .eq('id', modpackId)
        .single();

      const modpackData = data as any;

      if (error || !modpackData) throw new Error('Failed to load modpack');

      setFormData({
        name: modpackData.name_i18n || { en: '', es: '' },
        shortDescription: modpackData.short_description_i18n || { en: '', es: '' },
        description: modpackData.description_i18n || { en: '', es: '' },
        version: modpackData.version || '',
        minecraftVersion: modpackData.minecraft_version || '',
        modloader: modpackData.modloader || 'forge',
        modloaderVersion: modpackData.modloader_version || '',
        gamemode: modpackData.gamemode || '',
        serverIp: modpackData.server_ip || '',
        primaryColor: modpackData.primary_color || '#3b82f6',
        isActive: modpackData.is_active || false,
        isComingSoon: modpackData.is_coming_soon || false,
        logoUrl: modpackData.logo_url,
        bannerUrl: modpackData.banner_url
      });

      // 2. Fetch Features
      const featuresResult = await service.getModpackFeatures(modpackId);
      if (featuresResult.success && featuresResult.data) {
        setFeatures(featuresResult.data.map(f => ({
          id: f.id,
          title: f.title_i18n,
          description: f.description_i18n,
          icon: f.icon
        })));
      }

      // 3. Fetch Images
      const imagesResult = await service.getModpackImages(modpackId);
      if (imagesResult.success && imagesResult.data) {
        setImages(imagesResult.data);
      }

      // 4. Fetch Versions
      const versionsResult = await service.getModpackVersions(modpackId);
      if (versionsResult.success && versionsResult.data) {
        setVersions(versionsResult.data);
      }

    } catch (error) {
      console.error('Error loading modpack:', error);
      toast.error('Failed to load modpack data');
      onNavigate?.('my-modpacks');
    } finally {
      setLoading(false);
    }
  };

  // --- General Tab Handlers ---

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

  const handleSaveGeneral = async () => {
    if (!formData) return;
    setIsUpdating(true);
    try {
      await authService.syncDiscordRoles();
      const { success, error } = await service.updateModpack(modpackId, {
        name: formData.name,
        shortDescription: formData.shortDescription,
        description: formData.description,
        version: formData.version,
        minecraftVersion: formData.minecraftVersion,
        modloaderVersion: formData.modloaderVersion,
        gamemode: formData.gamemode,
        serverIp: formData.serverIp,
        primaryColor: formData.primaryColor
      });

      if (success) toast.success('General settings saved');
      else toast.error(`Error: ${error}`);
    } catch (error) {
      toast.error('Failed to save changes');
    } finally {
      setIsUpdating(false);
    }
  };

  // --- Media Tab Handlers ---

  const handleImageUpload = async (file: File, type: 'logo' | 'banner' | 'screenshot') => {
    setIsUpdating(true);
    const toastId = toast.loading('Uploading image...');
    try {
      if (type === 'screenshot') {
        await R2UploadService.uploadToR2(file, modpackId, 'screenshot');
        // Refresh images
        const result = await service.getModpackImages(modpackId);
        if (result.success && result.data) setImages(result.data);
      } else {
        const result = await R2UploadService.uploadToR2(file, modpackId, type);
        // The register-modpack-upload function has already updated the database
        // Fetch the updated modpack data to get the new image URL
        const { data: modpackData } = await supabase
          .from('modpacks')
          .select('logo, backgroundImage')
          .eq('id', modpackId)
          .single();

        if (modpackData) {
          const imageUrl = type === 'logo' ? modpackData.logo : modpackData.backgroundImage;
          setFormData(prev => prev ? ({ ...prev, [`${type}Url`]: imageUrl }) : null);
        }
      }
      toast.success('Image uploaded', { id: toastId });
    } catch (error) {
      console.error('❌ Image upload failed:', error);
      toast.error('Upload failed', { id: toastId });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteScreenshot = async (imageId: string) => {
    setIsUpdating(true);
    try {
      await service.deleteModpackImage(imageId);
      setImages(prev => prev.filter(img => img.id !== imageId));
      toast.success('Screenshot deleted');
    } catch (error) {
      toast.error('Failed to delete screenshot');
    } finally {
      setIsUpdating(false);
    }
  };

  // --- Features Tab Handlers ---

  const addFeature = () => {
    setFeatures(prev => [...prev, {
      title: { en: '', es: '' },
      description: { en: '', es: '' },
      icon: 'fa-star'
    }]);
  };

  const removeFeature = (index: number) => {
    setFeatures(prev => prev.filter((_, i) => i !== index));
  };

  const updateFeature = (index: number, field: keyof Feature, value: any) => {
    setFeatures(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  };

  const updateFeatureI18n = (index: number, field: 'title' | 'description', lang: 'en' | 'es', value: string) => {
    setFeatures(prev => prev.map((f, i) => i === index ? {
      ...f,
      [field]: { ...f[field], [lang]: value }
    } : f));
  };

  const handleSaveFeatures = async () => {
    setIsUpdating(true);
    const toastId = toast.loading('Saving features...');
    try {
      // 1. Delete existing features (simplest way to handle reordering/updates)
      // Get all current feature IDs from DB to delete them
      const { data: existingFeatures } = await supabase
        .from('modpack_features')
        .select('id')
        .eq('modpack_id', modpackId);

      if (existingFeatures) {
        for (const f of (existingFeatures as any[])) {
          await service.deleteModpackFeature(f.id);
        }
      }

      // 2. Create new features
      await service.createModpackFeatures(modpackId, features);

      // 3. Reload to get new IDs
      const result = await service.getModpackFeatures(modpackId);
      if (result.success && result.data) {
        setFeatures(result.data.map(f => ({
          id: f.id,
          title: f.title_i18n,
          description: f.description_i18n,
          icon: f.icon
        })));
      }

      toast.success('Features saved', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Failed to save features', { id: toastId });
    } finally {
      setIsUpdating(false);
    }
  };

  // --- Versions Tab Handlers ---

  const handleZipFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      toast.error('Please select a ZIP file');
      return;
    }
    setZipFile(file);
    resetValidation();
    await validateAndParseManifest(file);
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
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.zip')) {
      handleZipFile(file);
    } else {
      toast.error('Please upload a valid ZIP file');
    }
  };

  const handleUploadNewVersion = async () => {
    if (!zipFile || !newVersion) {
      toast.error('Version and ZIP file are required');
      return;
    }

    // Ensure manifest is parsed/validated if not already (though UI should enforce this)
    if (!manifestParsed) {
      const isValid = await validateAndParseManifest(zipFile);
      if (!isValid) return;
    }

    setIsUpdating(true);
    const toastId = toast.loading('Uploading new version...');
    try {
      await authService.syncDiscordRoles();

      // 1. Upload file using r2UploadService
      const uploadResult = await R2UploadService.uploadToR2(
        zipFile,
        modpackId,
        'modpack',
        (progress) => setUploadProgress(progress.percent)
      );

      // 2. Update modpack version
      await service.updateModpack(modpackId, { version: newVersion });

      // 3. Create version record (register-modpack-upload should have created/updated it, but ensure changelog is set)
      // Check if version already exists
      const { data: existingVersion } = await supabase
        .from('modpack_versions')
        .select('id')
        .eq('modpack_id', modpackId)
        .eq('version', newVersion)
        .single();

      if (!existingVersion) {
        await supabase.from('modpack_versions').insert({
          modpack_id: modpackId,
          version: newVersion,
          changelog_i18n: changelog,
          file_url: uploadResult.fileUrl
        } as any);
      } else {
        // Update existing version with changelog
        await supabase
          .from('modpack_versions')
          .update({ changelog_i18n: changelog })
          .eq('id', existingVersion.id);
      }

      toast.success('New version published!', { id: toastId });
      setNewVersion('');
      setChangelog({ en: '', es: '' });
      setZipFile(null);
      resetValidation();
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Update local state
      setFormData(prev => prev ? ({ ...prev, version: newVersion }) : null);

      // Refresh versions list
      const versionsResult = await service.getModpackVersions(modpackId);
      if (versionsResult.success && versionsResult.data) {
        setVersions(versionsResult.data);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to upload version', { id: toastId });
    } finally {
      setIsUpdating(false);
    }
  };

  // --- Settings Tab Handlers ---

  const handleToggleVisibility = async () => {
    if (!formData) return;
    const newStatus = !formData.isActive;
    setIsUpdating(true);
    try {
      await service.updateModpack(modpackId, { isActive: newStatus });
      setFormData(prev => prev ? ({ ...prev, isActive: newStatus }) : null);
      toast.success(newStatus ? 'Modpack is now visible' : 'Modpack is now hidden');
    } catch (error) {
      toast.error('Failed to update visibility');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleComingSoon = async () => {
    if (!formData) return;
    const newStatus = !formData.isComingSoon;
    setIsUpdating(true);
    try {
      await service.updateModpack(modpackId, { isComingSoon: newStatus });
      setFormData(prev => prev ? ({ ...prev, isComingSoon: newStatus }) : null);
      toast.success(newStatus ? 'Modpack marked as Coming Soon' : 'Coming Soon status removed');
    } catch (error) {
      toast.error('Failed to update Coming Soon status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteModpack = async () => {
    setIsUpdating(true);
    const toastId = toast.loading('Deleting modpack...');
    try {
      const result = await service.deleteModpack(modpackId);
      if (result.success) {
        toast.success('Modpack deleted', { id: toastId });
        onNavigate?.('my-modpacks');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast.error('Failed to delete modpack', { id: toastId });
      setIsUpdating(false);
    }
  };

  if (loading || !formData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const tabs = [
    { id: 'general', label: t('editModpack.tabs.general'), icon: FileText },
    { id: 'media', label: t('editModpack.tabs.media'), icon: ImageIcon },
    { id: 'features', label: t('editModpack.tabs.features'), icon: Layers },
    { id: 'versions', label: t('editModpack.tabs.versions'), icon: History },
    { id: 'settings', label: t('editModpack.tabs.settings'), icon: Settings },
  ];

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            {formData.name.en}
            <span className={`text-sm px-3 py-1 rounded-full border ${formData.isActive
              ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
              : 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800'
              }`}>
              {formData.isActive ? 'Published' : 'Hidden'}
            </span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">v{formData.version} • {formData.modloader} {formData.modloaderVersion}</p>
        </div>
        <button
          onClick={() => onNavigate?.('my-modpacks')}
          className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          {t('editModpack.backToList')}
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden sticky top-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-4 ${activeTab === tab.id
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
              >
                <tab.icon className="w-5 h-5" />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">{t('editModpack.general.basicInfo')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('editModpack.general.nameEnglish')}</label>
                    <input
                      type="text"
                      value={formData.name.en}
                      onChange={(e) => updateI18nField('name', 'en', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('editModpack.general.nameSpanish')}</label>
                    <input
                      type="text"
                      value={formData.name.es}
                      onChange={(e) => updateI18nField('name', 'es', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('editModpack.general.shortDescEnglish')}</label>
                    <input
                      type="text"
                      value={formData.shortDescription.en}
                      onChange={(e) => updateI18nField('shortDescription', 'en', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('editModpack.general.shortDescSpanish')}</label>
                    <input
                      type="text"
                      value={formData.shortDescription.es}
                      onChange={(e) => updateI18nField('shortDescription', 'es', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('editModpack.general.descriptionEnglish')}</label>
                    <textarea
                      value={formData.description.en}
                      onChange={(e) => updateI18nField('description', 'en', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white h-32"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('editModpack.general.descriptionSpanish')}</label>
                    <textarea
                      value={formData.description.es}
                      onChange={(e) => updateI18nField('description', 'es', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white h-32"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">{t('editModpack.general.technicalDetails')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('editModpack.general.minecraftVersion')}</label>
                    <input
                      type="text"
                      value={formData.minecraftVersion}
                      onChange={(e) => updateFormData('minecraftVersion', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('editModpack.general.modloaderVersion')}</label>
                    <input
                      type="text"
                      value={formData.modloaderVersion}
                      onChange={(e) => updateFormData('modloaderVersion', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('editModpack.general.primaryColor')}</label>
                    <div className="flex gap-3">
                      <input
                        type="color"
                        value={formData.primaryColor}
                        onChange={(e) => updateFormData('primaryColor', e.target.value)}
                        className="h-10 w-10 rounded cursor-pointer border-0"
                      />
                      <input
                        type="text"
                        value={formData.primaryColor}
                        onChange={(e) => updateFormData('primaryColor', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveGeneral}
                  disabled={isUpdating}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {t('editModpack.general.saveChanges')}
                </button>
              </div>
            </div>
          )}

          {/* Media Tab */}
          {activeTab === 'media' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">{t('editModpack.media.branding')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">{t('editModpack.media.logo')}</label>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingLogo(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setIsDraggingLogo(false); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingLogo(false);
                        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                        if (files.length > 0) {
                          handleImageUpload(files[0], 'logo');
                        }
                      }}
                      className={`border-2 border-dashed rounded-lg p-4 text-center relative group ${isDraggingLogo
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-300 dark:border-gray-600'
                        }`}
                    >
                      {formData.logoUrl ? (
                        <img src={formData.logoUrl} alt="Logo" className="w-32 h-32 object-contain mx-auto rounded-lg" />
                      ) : (
                        <div className="py-8 text-gray-400">{t('editModpack.media.noLogoUploaded')}</div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'logo')}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none">
                        <p className="text-white font-medium">{t('editModpack.media.clickToReplace')}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">{t('editModpack.media.banner')}</label>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingBanner(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setIsDraggingBanner(false); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingBanner(false);
                        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                        if (files.length > 0) {
                          handleImageUpload(files[0], 'banner');
                        }
                      }}
                      className={`border-2 border-dashed rounded-lg p-4 text-center relative group ${isDraggingBanner
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-300 dark:border-gray-600'
                        }`}
                    >
                      {formData.bannerUrl ? (
                        <img src={formData.bannerUrl} alt="Banner" className="w-full h-32 object-cover mx-auto rounded-lg" />
                      ) : (
                        <div className="py-8 text-gray-400">{t('editModpack.media.noBannerUploaded')}</div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'banner')}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none">
                        <p className="text-white font-medium">{t('editModpack.media.clickToReplace')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('editModpack.media.screenshots')}</h2>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingScreenshots(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDraggingScreenshots(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingScreenshots(false);
                      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                      if (files.length > 0) {
                        files.forEach(file => handleImageUpload(file, 'screenshot'));
                      }
                    }}
                    className={`relative overflow-hidden rounded-lg ${isDraggingScreenshots ? 'ring-2 ring-blue-500' : ''
                      }`}
                  >
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                      <Upload className="w-4 h-4" />
{t('editModpack.media.uploadScreenshot')}
                    </button>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        files.forEach(file => handleImageUpload(file, 'screenshot'));
                        e.target.value = '';
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                {images.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
{t('editModpack.media.noScreenshotsUploaded')}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {images.map((img) => (
                      <div key={img.id} className="relative group">
                        <img
                          src={img.image_url}
                          alt="Screenshot"
                          className="w-full h-48 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                        />
                        <button
                          onClick={() => handleDeleteScreenshot(img.id)}
                          className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Features Tab */}
          {activeTab === 'features' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('editModpack.features.title')}</h2>
                  <button
                    onClick={addFeature}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
{t('editModpack.features.addFeature')}
                  </button>
                </div>

                {features.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
{t('editModpack.features.noFeaturesAdded')}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {features.map((feature, index) => (
                      <div key={index} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/30 relative">
                        <button
                          onClick={() => removeFeature(index)}
                          className="absolute top-4 right-4 text-red-500 hover:text-red-700"
                        >
                          <X className="w-5 h-5" />
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium mb-1 text-gray-500">{t('editModpack.features.titleEn')}</label>
                            <input
                              type="text"
                              value={feature.title.en}
                              onChange={(e) => updateFeatureI18n(index, 'title', 'en', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1 text-gray-500">{t('editModpack.features.titleEs')}</label>
                            <input
                              type="text"
                              value={feature.title.es}
                              onChange={(e) => updateFeatureI18n(index, 'title', 'es', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium mb-1 text-gray-500">{t('editModpack.features.icon')}</label>
                            <input
                              type="text"
                              value={feature.icon}
                              onChange={(e) => updateFeature(index, 'icon', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium mb-1 text-gray-500">{t('editModpack.features.descriptionEn')}</label>
                            <textarea
                              value={feature.description.en}
                              onChange={(e) => updateFeatureI18n(index, 'description', 'en', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm h-16"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium mb-1 text-gray-500">{t('editModpack.features.descriptionEs')}</label>
                            <textarea
                              value={feature.description.es}
                              onChange={(e) => updateFeatureI18n(index, 'description', 'es', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm h-16"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end mt-6">
                  <button
                    onClick={handleSaveFeatures}
                    disabled={isUpdating}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
{t('editModpack.features.saveFeatures')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Versions Tab */}
          {activeTab === 'versions' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">{t('editModpack.versions.versionHistory')}</h2>
                {versions.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">{t('editModpack.versions.noVersionsUploaded')}</p>
                ) : (
                  <div className="space-y-4">
                    {versions.map((v) => (
                      <div key={v.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">v{v.version}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Released on {new Date(v.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                await invoke('open_url', { url: v.file_url });
                              } catch (error) {
                                console.error('Failed to open URL:', error);
                                toast.error('Failed to open download link');
                              }
                            }}
                            className="text-blue-600 hover:text-blue-700 text-sm font-medium hover:underline"
                          >
{t('editModpack.versions.downloadZip')}
                          </button>
                        </div>
                        {v.changelog_i18n && (
                          <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                            <p className="font-medium mb-1">Changelog:</p>
                            <p className="whitespace-pre-wrap">{v.changelog_i18n.en}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">{t('editModpack.versions.uploadNewVersion')}</h2>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('editModpack.versions.modpackZipFile')}</label>
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${isDragging
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600'
                        }`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <input
                        type="file"
                        accept=".zip"
                        onChange={(e) => e.target.files?.[0] && handleZipFile(e.target.files[0])}
                        className="hidden"
                        id="zip-upload"
                        ref={fileInputRef}
                      />
                      <label htmlFor="zip-upload" className="cursor-pointer flex flex-col items-center">
                        <Package className="w-12 h-12 text-gray-400 mb-2" />
                        <span className="text-blue-600 font-medium hover:underline">{t('editModpack.versions.clickToUploadZip')}</span>
                        {zipFile && (
                          <div className="mt-2 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full text-blue-700 dark:text-blue-300 text-sm">
                            {zipFile.name} ({(zipFile.size / 1024 / 1024).toFixed(2)} MB)
                          </div>
                        )}
                        {isParsing && <p className="text-sm text-gray-500 mt-2">{t('editModpack.versions.validating')}</p>}
                      </label>
                    </div>
                  </div>

                  {manifestParsed && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('editModpack.versions.newVersionNumber')}</label>
                        <input
                          type="text"
                          value={newVersion}
                          onChange={(e) => setNewVersion(e.target.value)}
                          placeholder={t('editModpack.versions.versionPlaceholder')}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('editModpack.versions.changelogEn')}</label>
                          <textarea
                            value={changelog.en}
                            onChange={(e) => setChangelog(prev => ({ ...prev, en: e.target.value }))}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white h-32"
                            placeholder="- Added new items..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('editModpack.versions.changelogEs')}</label>
                          <textarea
                            value={changelog.es}
                            onChange={(e) => setChangelog(prev => ({ ...prev, es: e.target.value }))}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white h-32"
                            placeholder="- Nuevos items..."
                          />
                        </div>
                      </div>

                      {isUpdating && uploadProgress > 0 && (
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                          <div className="bg-blue-600 h-2.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          onClick={handleUploadNewVersion}
                          disabled={isUpdating || !newVersion || !zipFile}
                          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                        >
                          {isUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
{t('editModpack.versions.publishVersion')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">{t('editModpack.settings.visibility')}</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">{t('editModpack.settings.modpackStatus')}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formData.isActive
                          ? t('editModpack.settings.visibleToAllUsers')
                          : t('editModpack.settings.hiddenFromUsers')}
                      </p>
                    </div>
                    <button
                      onClick={handleToggleVisibility}
                      disabled={isUpdating}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${formData.isActive
                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/50'
                        : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                        }`}
                    >
                      {formData.isActive ? t('editModpack.settings.hideModpack') : t('editModpack.settings.publishModpack')}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">{t('editModpack.settings.comingSoonStatus')}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formData.isComingSoon
                          ? t('editModpack.settings.comingSoonDescription')
                          : t('editModpack.settings.fullyAvailableDescription')}
                      </p>
                    </div>
                    <button
                      onClick={handleToggleComingSoon}
                      disabled={isUpdating}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${formData.isComingSoon
                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'
                        }`}
                    >
                      {formData.isComingSoon ? t('editModpack.settings.removeComingSoon') : t('editModpack.settings.markAsComingSoon')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-6 border border-red-200 dark:border-red-900/30">
                <h2 className="text-xl font-semibold mb-4 text-red-700 dark:text-red-400">{t('editModpack.settings.dangerZone')}</h2>
                <p className="text-red-600 dark:text-red-300 mb-6">
                  Deleting a modpack is permanent and cannot be undone. All versions, files, and images will be removed.
                </p>
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
{t('editModpack.settings.deleteModpack')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeleteModpack}
        title={t('editModpack.settings.deleteModpackTitle')}
        message={t('editModpack.settings.deleteModpackMessage', { name: formData.name.en })}
        confirmText={t('editModpack.settings.deleteForever')}
        variant="danger"
      />

      {validationData && (
        <ModpackValidationDialog
          isOpen={showValidationDialog}
          onClose={() => {
            setShowValidationDialog(false);
            setZipFile(null);
            resetValidation();
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}
          onContinue={() => {
            // For Edit form, we might want to handle overrides differently or just allow proceed
            // Currently ModpackValidationDialog returns uploadedFiles but we don't have logic to merge them in Edit form yet
            // So we might just close and let them proceed if they really want to (or block if strict)
            // For now, let's just close and allow the user to try again or we can implement the merge logic later
            setShowValidationDialog(false);
            toast.success('Validation warning acknowledged. You can proceed with upload.');
          }}
          modpackName={validationData.modpackName}
          modsWithoutUrl={validationData.modsWithoutUrl}
          modsInOverrides={validationData.modsInOverrides}
        />
      )}
    </div>
  );
}

export default EditModpackForm;
