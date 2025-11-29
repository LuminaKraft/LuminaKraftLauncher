import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Plus, X, Upload, FileArchive, AlertCircle, Settings, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import ModpackManagementService from '../../services/modpackManagementService';
import ModpackValidationService, { ModFileInfo } from '../../services/modpackValidationService';
import ModpackValidationDialog from './ModpackValidationDialog';
import { ConfirmDialog } from '../Common/ConfirmDialog';
import AuthService from '../../services/authService';
import type { DiscordAccount } from '../../types/launcher';

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
  onNavigate?: (_section: string) => void;
}

export function PublishModpackForm({ onNavigate }: PublishModpackFormProps) {
  const service = ModpackManagementService.getInstance();
  const validationService = ModpackValidationService.getInstance();
  const authService = AuthService.getInstance();

  const [discordAccount, setDiscordAccount] = useState<DiscordAccount | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isSyncingRoles, setIsSyncingRoles] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

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

  // Download confirmation state
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [pendingUploadedFiles, setPendingUploadedFiles] = useState<Map<string, File> | null>(null);

  // Check Discord access on mount
  useEffect(() => {
    checkDiscordAccess();
  }, []);

  const checkDiscordAccess = async () => {
    setIsCheckingAccess(true);
    const account = await authService.getDiscordAccount();
    setDiscordAccount(account);
    setIsCheckingAccess(false);
  };

  // Smart sync: Check if roles need syncing (>1 hour old) on mount
  useEffect(() => {
    const checkAndSyncIfNeeded = async () => {
      const account = await authService.getDiscordAccount();
      if (!account) return;

      // Check if roles are stale (>1 hour)
      const lastSync = account.lastSync ? new Date(account.lastSync) : null;
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const needsSync = !lastSync || lastSync < oneHourAgo;

      if (needsSync) {
        setIsSyncingRoles(true);
        try {
          await authService.syncDiscordRoles();
          // Reload Discord account after sync
          await checkDiscordAccess();
        } catch (error) {
          console.error('Failed to sync roles:', error);
          setSyncError('roles_sync_failed');
        } finally {
          setIsSyncingRoles(false);
        }
      }
    };

    checkAndSyncIfNeeded();
  }, []);

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

  const handleDownloadUpdatedZip = async () => {
    if (!pendingUploadedFiles || !zipFile) return;

    const loadingToast = toast.loading('Preparing files...');

    try {
      const { downloadDir } = await import('@tauri-apps/api/path');

      // Set up progress listener first
      const unlisten = await listen<{current: number, total: number, stage: string, message: string}>('zip-progress', (event) => {
        const { current, total, stage, message } = event.payload;
        const percentage = Math.round((current / total) * 100);

        if (stage === 'complete') {
          toast.dismiss(loadingToast);
        } else {
          toast.loading(`${message} (${percentage}%)`, { id: loadingToast });
        }
      });

      // Read original ZIP as bytes
      const originalZipBuffer = await zipFile.arrayBuffer();
      const originalZipBytes = Array.from(new Uint8Array(originalZipBuffer));

      // Read uploaded files as bytes
      const uploadedFilesData: [string, number[]][] = [];
      for (const file of pendingUploadedFiles.values()) {
        const buffer = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        uploadedFilesData.push([file.name, bytes]);
      }

      // Create output ZIP path in Downloads folder
      const downloadsFolder = await downloadDir();
      const outputFileName = zipFile.name.replace('.zip', '_updated.zip');
      const outputZipPath = `${downloadsFolder}/${outputFileName}`;

      toast.loading('Creating updated modpack ZIP...', { id: loadingToast });

      // Call Tauri command with bytes directly
      await invoke('create_modpack_with_overrides', {
        originalZipBytes: originalZipBytes,
        originalZipName: zipFile.name,
        uploadedFiles: uploadedFilesData,
        outputZipPath: outputZipPath
      });

      unlisten();
      toast.success(`Updated modpack saved to Downloads: ${outputFileName}`, { id: loadingToast, duration: 5000 });
    } catch (error) {
      console.error('Error creating modpack with overrides:', error);
      toast.error('Failed to create updated modpack', { id: loadingToast });
    } finally {
      setPendingUploadedFiles(null);
    }
  };

  const handleSkipDownload = () => {
    if (pendingUploadedFiles) {
      toast.success(`Modpack validated with ${pendingUploadedFiles.size} additional file(s)`);
      setPendingUploadedFiles(null);
    }
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
          toast.error(`Manifest parsed, but ${missingCount} mod(s) require manual download.`);
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

  // Check if user can publish
  const canPublish = discordAccount && discordAccount.isMember;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Discord Access Check */}
      {isCheckingAccess && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 shadow-md text-center mb-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Checking access permissions...</p>
        </div>
      )}

      {/* Access Denied - Discord Not Linked */}
      {!isCheckingAccess && !discordAccount && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 shadow-md mb-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                Discord Account Required
              </h3>
              <p className="text-yellow-700 dark:text-yellow-300 mb-4">
                You need to link your Discord account to publish modpacks. This helps us build a better community and prevent spam.
              </p>
              <button
                onClick={() => onNavigate?.('settings')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
              >
                <Settings className="w-4 h-4" />
                Go to Settings to Link Discord
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Access Denied - Not in Discord Server */}
      {!isCheckingAccess && discordAccount && !discordAccount.isMember && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 shadow-md mb-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                Join Our Discord Server
              </h3>
              <p className="text-yellow-700 dark:text-yellow-300 mb-4">
                Discord account linked: <strong>@{discordAccount.username}</strong>
              </p>
              <p className="text-yellow-700 dark:text-yellow-300 mb-4">
                You must be a member of the LuminaKraft Discord server to publish modpacks. Join our community to get access!
              </p>
              <div className="flex gap-3">
                <a
                  href="https://discord.gg/UJZRrcUFMj"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 71 55" fill="currentColor">
                    <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"/>
                  </svg>
                  Join Discord Server
                </a>
                <button
                  onClick={() => onNavigate?.('settings')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Role Sync Loading Indicator */}
      {isSyncingRoles && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              Refreshing Discord roles...
            </span>
          </div>
        </div>
      )}

      {/* Role Sync Error Indicator */}
      {syncError && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-yellow-700 dark:text-yellow-300">
              Discord roles may be outdated. Sync manually for latest permissions.
            </span>
            <button
              onClick={() => onNavigate?.('settings')}
              className="text-sm text-yellow-800 dark:text-yellow-200 underline hover:no-underline"
            >
              Go to Settings
            </button>
          </div>
        </div>
      )}

      {/* Validation Dialog */}
      {validationData && (
        <ModpackValidationDialog
          isOpen={showValidationDialog}
          onClose={() => setShowValidationDialog(false)}
          onContinue={async (uploadedFiles) => {
            setShowValidationDialog(false);
            if (uploadedFiles && uploadedFiles.size > 0) {
              // Ask user if they want to download an updated ZIP with the files in overrides
              setPendingUploadedFiles(uploadedFiles);
              setShowDownloadDialog(true);
            }
          }}
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

      <form onSubmit={handleSubmit} className={`space-y-6 ${!canPublish ? 'opacity-50 pointer-events-none' : ''}`}>
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

      {/* Download Updated Modpack Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDownloadDialog}
        onClose={() => {
          setShowDownloadDialog(false);
          handleSkipDownload();
        }}
        onConfirm={async () => {
          setShowDownloadDialog(false);
          await handleDownloadUpdatedZip();
        }}
        title="Download Updated Modpack?"
        message={`You've uploaded ${pendingUploadedFiles?.size || 0} file(s) that were missing from this modpack.\n\nWould you like to download an updated version of the ZIP file with these files included in the overrides folder?\n\nYou can then use this updated ZIP to publish your modpack.`}
        confirmText="Download Updated ZIP"
        cancelText="Skip Download"
        variant="info"
      />
    </div>
  );
}

export default PublishModpackForm;
