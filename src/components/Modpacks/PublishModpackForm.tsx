import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Plus, X, Upload, FileArchive } from 'lucide-react';
import ModpackManagementService from '../../services/modpackManagementService';
import ModpackValidationService, { ModFileInfo } from '../../services/modpackValidationService';
import ModpackValidationDialog from './ModpackValidationDialog';

interface Feature {
  title: { en: string; es: string };
  description: { en: string; es: string };
  icon: string;
}

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
  features: Feature[];
}

interface PublishModpackFormProps {
  onNavigate?: (section: string) => void;
}

export function PublishModpackForm({ onNavigate }: PublishModpackFormProps) {
  const { t } = useTranslation();
  const service = ModpackManagementService.getInstance();
  const validationService = ModpackValidationService.getInstance();

  const [formData, setFormData] = useState<FormData>({
    name: { en: '', es: '' },
    shortDescription: { en: '', es: '' },
    description: { en: '', es: '' },
    version: '1.0.0',
    minecraftVersion: '1.20.1',
    modloader: 'forge',
    modloaderVersion: '47.2.0',
    primaryColor: '#3b82f6',
    features: []
  });

  const [zipFile, setZipFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [manifestParsed, setManifestParsed] = useState(false);
  const [currentLang, setCurrentLang] = useState<'en' | 'es'>('en');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validation state
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationData, setValidationData] = useState<{
    modpackName: string;
    modsWithoutUrl: ModFileInfo[];
    modsInOverrides: string[];
  } | null>(null);

  const updateFormData = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateI18nField = (field: 'name' | 'shortDescription' | 'description', lang: 'en' | 'es', value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: { ...prev[field], [lang]: value }
    }));
  };

  const addFeature = () => {
    setFormData(prev => ({
      ...prev,
      features: [...prev.features, { title: { en: '', es: '' }, description: { en: '', es: '' }, icon: '' }]
    }));
  };

  const removeFeature = (index: number) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }));
  };

  const updateFeature = (index: number, field: 'title' | 'description', lang: 'en' | 'es', value: string) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.map((feature, i) =>
        i === index
          ? { ...feature, [field]: { ...feature[field], [lang]: value } }
          : feature
      )
    }));
  };

  const updateFeatureIcon = (index: number, icon: string) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.map((feature, i) =>
        i === index ? { ...feature, icon } : feature
      )
    }));
  };

  const handleZipFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      toast.error('Please select a ZIP file');
      return;
    }

    setZipFile(file);
    setManifestParsed(false);

    // Validate and parse manifest
    await validateAndParseManifest(file);
  };

  const validateAndParseManifest = async (file: File) => {
    setIsParsing(true);
    try {
      // First, validate the modpack
      const validationResult = await validationService.validateModpackZip(file);

      if (!validationResult.success) {
        toast.error(validationResult.error || 'Failed to validate modpack');
        return;
      }

      // Check if there are mods without URL
      if (validationResult.modsWithoutUrl && validationResult.modsWithoutUrl.length > 0) {
        setValidationData({
          modpackName: validationResult.manifest?.name || file.name,
          modsWithoutUrl: validationResult.modsWithoutUrl,
          modsInOverrides: validationResult.modsInOverrides || []
        });
        setShowValidationDialog(true);
      }

      // Parse manifest for form data (using existing service)
      const parseResult = await service.parseManifestFromZip(file);

      if (!parseResult.success || !parseResult.data) {
        toast.error(parseResult.error || 'Failed to parse manifest.json');
        return;
      }

      const data = parseResult.data;

      // Auto-fill form with parsed data
      setFormData(prev => ({
        ...prev,
        name: {
          en: data.name || prev.name.en,
          es: data.name || prev.name.es
        },
        version: data.version || prev.version,
        minecraftVersion: data.minecraftVersion || prev.minecraftVersion,
        modloader: data.modloader || prev.modloader,
        modloaderVersion: data.modloaderVersion || prev.modloaderVersion
      }));

      setManifestParsed(true);

      // Show different message based on validation
      if (validationResult.modsWithoutUrl && validationResult.modsWithoutUrl.length > 0) {
        const missingCount = validationResult.modsWithoutUrl.filter(
          mod => !validationResult.modsInOverrides?.includes(mod.fileName)
        ).length;

        if (missingCount > 0) {
          toast.warning(`Manifest parsed, but ${missingCount} mod(s) require manual download.`);
        } else {
          toast.success('Manifest parsed! All required mods are in overrides.');
        }
      } else {
        toast.success('Manifest parsed! Form auto-filled with modpack data.');
      }
    } catch (error) {
      console.error('Error validating manifest:', error);
      toast.error('Failed to validate modpack');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const zipFile = files.find(f => f.name.endsWith('.zip'));

    if (zipFile) {
      await handleZipFile(zipFile);
    } else {
      toast.error('Please drop a ZIP file');
    }
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

      // 2. Upload logo if provided
      if (logoFile) {
        setUploadProgress(10);
        const logoResult = await service.uploadModpackImage(modpackId, logoFile, 'logo');
        if (!logoResult.success) {
          console.warn('Failed to upload logo:', logoResult.error);
        }
      }

      // 3. Upload banner if provided
      if (bannerFile) {
        setUploadProgress(20);
        const bannerResult = await service.uploadModpackImage(modpackId, bannerFile, 'banner');
        if (!bannerResult.success) {
          console.warn('Failed to upload banner:', bannerResult.error);
        }
      }

      // 4. Upload screenshots if provided
      if (screenshotFiles.length > 0) {
        setUploadProgress(30);
        const screenshotsResult = await service.uploadModpackScreenshots(modpackId, screenshotFiles);
        if (!screenshotsResult.success) {
          console.warn('Failed to upload screenshots:', screenshotsResult.error);
        }
      }

      // 5. Create features if provided
      if (formData.features.length > 0) {
        setUploadProgress(40);
        const featuresResult = await service.createModpackFeatures(modpackId, formData.features);
        if (!featuresResult.success) {
          console.warn('Failed to create features:', featuresResult.error);
        }
      }

      // 6. Upload ZIP file
      if (zipFile) {
        setUploadProgress(50);
        const uploadResult = await service.uploadModpackFile(
          modpackId,
          zipFile,
          (progress) => setUploadProgress(50 + (progress / 2)) // 50-100%
        );

        if (!uploadResult.success) {
          toast.error(`Error uploading file: ${uploadResult.error}`);
          return;
        }

        // 7. Activate modpack
        await service.updateModpack(modpackId, { isActive: true });
      }

      toast.success('Modpack published successfully!');
      onNavigate?.('published-modpacks');
    } catch (error) {
      console.error('Error creating modpack:', error);
      toast.error('Failed to create modpack');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Validation Dialog */}
      {validationData && (
        <ModpackValidationDialog
          isOpen={showValidationDialog}
          onClose={() => setShowValidationDialog(false)}
          onContinue={() => setShowValidationDialog(false)}
          modpackName={validationData.modpackName}
          modsWithoutUrl={validationData.modsWithoutUrl}
          modsInOverrides={validationData.modsInOverrides}
        />
      )}

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Publish Modpack
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Share your modpack with the LuminaKraft community
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Upload ZIP File */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Step 1: Upload Modpack ZIP
          </h2>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
              ${isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleZipFile(file);
              }}
              className="hidden"
              required
            />

            <div className="flex flex-col items-center gap-4">
              {isParsing ? (
                <>
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  <p className="text-gray-600 dark:text-gray-400">Parsing manifest.json...</p>
                </>
              ) : zipFile ? (
                <>
                  <FileArchive className="w-12 h-12 text-green-600" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {zipFile.name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {(zipFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    {manifestParsed && (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                        ✓ Manifest parsed - form auto-filled
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZipFile(null);
                      setManifestParsed(false);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Remove file
                  </button>
                </>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-gray-400" />
                  <div>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                      Drop your CurseForge/Modrinth modpack ZIP here
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      or click to browse
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      The manifest.json will be automatically parsed
                    </p>
                  </div>
                </>
              )}
            </div>
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

        {/* Step 2: Basic Information with Language Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Step 2: Basic Information
          </h2>

          {/* Language Tabs */}
          <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setCurrentLang('en')}
              className={`px-4 py-2 font-medium transition-colors ${
                currentLang === 'en'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setCurrentLang('es')}
              className={`px-4 py-2 font-medium transition-colors ${
                currentLang === 'es'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Español
            </button>
          </div>

          {/* Name */}
          <div className="mb-4">
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Name *
            </label>
            <input
              type="text"
              value={formData.name[currentLang]}
              onChange={(e) => updateI18nField('name', currentLang, e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              required
              placeholder={currentLang === 'en' ? 'My Awesome Modpack' : 'Mi Increíble Modpack'}
            />
          </div>

          {/* Short Description */}
          <div className="mb-4">
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Short Description
            </label>
            <input
              type="text"
              value={formData.shortDescription[currentLang]}
              onChange={(e) => updateI18nField('shortDescription', currentLang, e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder={currentLang === 'en' ? 'A brief description...' : 'Una breve descripción...'}
            />
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Description
            </label>
            <textarea
              value={formData.description[currentLang]}
              onChange={(e) => updateI18nField('description', currentLang, e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[100px]"
              placeholder={currentLang === 'en' ? 'Full description...' : 'Descripción completa...'}
            />
          </div>
        </div>

        {/* Step 3: Images Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Step 3: Images (Optional)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Logo */}
            <div>
              <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                Logo (Optional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
              {logoFile && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {logoFile.name} ({(logoFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>

            {/* Banner */}
            <div>
              <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                Banner (Optional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
              {bannerFile && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {bannerFile.name} ({(bannerFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>
          </div>

          {/* Screenshots */}
          <div className="mt-4">
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Screenshots (Optional)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setScreenshotFiles(Array.from(e.target.files || []))}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
            />
            {screenshotFiles.length > 0 && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {screenshotFiles.length} screenshot(s) selected
              </p>
            )}
          </div>
        </div>

        {/* Step 4: Technical Details */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Step 4: Technical Details
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {manifestParsed ? '✓ Auto-filled from manifest.json' : 'These will be auto-filled when you upload a ZIP'}
          </p>

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

        {/* Step 5: Features Section (Optional) */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Step 5: Features (Optional)
            </h2>
            <button
              type="button"
              onClick={addFeature}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Feature
            </button>
          </div>

          {formData.features.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400 text-center py-4">
              No features added yet. Click "Add Feature" to add one.
            </p>
          ) : (
            <div className="space-y-4">
              {formData.features.map((feature, index) => (
                <div key={index} className="p-4 border border-gray-300 dark:border-gray-600 rounded-lg relative">
                  <button
                    type="button"
                    onClick={() => removeFeature(index)}
                    className="absolute top-2 right-2 p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded transition-colors"
                    title="Remove feature"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {/* Language Tabs for Feature */}
                  <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => setCurrentLang('en')}
                      className={`px-3 py-1 text-sm font-medium transition-colors ${
                        currentLang === 'en'
                          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      EN
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentLang('es')}
                      className={`px-3 py-1 text-sm font-medium transition-colors ${
                        currentLang === 'es'
                          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      ES
                    </button>
                  </div>

                  {/* Title */}
                  <div className="mb-4">
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300 text-sm">
                      Title
                    </label>
                    <input
                      type="text"
                      value={feature.title[currentLang]}
                      onChange={(e) => updateFeature(index, 'title', currentLang, e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder={currentLang === 'en' ? 'e.g., Custom Quests' : 'ej., Misiones Personalizadas'}
                    />
                  </div>

                  {/* Description */}
                  <div className="mb-4">
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300 text-sm">
                      Description
                    </label>
                    <textarea
                      value={feature.description[currentLang]}
                      onChange={(e) => updateFeature(index, 'description', currentLang, e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[60px]"
                      placeholder={currentLang === 'en' ? 'Brief description...' : 'Breve descripción...'}
                    />
                  </div>

                  {/* Icon */}
                  <div>
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300 text-sm">
                      Icon (Optional - Font Awesome class)
                    </label>
                    <input
                      type="text"
                      value={feature.icon}
                      onChange={(e) => updateFeatureIcon(index, e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., fa-sword, fa-shield, fa-star"
                    />
                  </div>
                </div>
              ))}
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
            {isUploading ? `Publishing... ${Math.round(uploadProgress)}%` : 'Publish Modpack'}
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('published-modpacks')}
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

export default PublishModpackForm;
