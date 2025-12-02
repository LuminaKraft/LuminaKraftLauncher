import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Plus, X, Upload, FileArchive, AlertCircle, RefreshCw, Check, ChevronRight, ChevronLeft, Info, Image as ImageIcon, FileText, Package, Layers } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import ModpackManagementService from '../../services/modpackManagementService';
import { useModpackValidation } from '../../hooks/useModpackValidation';
import { ModpackValidationDialog } from './ModpackValidationDialog';
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
  category?: 'official' | 'partner' | 'community';
  isComingSoon?: boolean;
}

interface PublishModpackFormProps {
  onNavigate?: (_section: string) => void;
}

export function PublishModpackForm({ onNavigate }: PublishModpackFormProps) {
  const service = ModpackManagementService.getInstance();
  const authService = AuthService.getInstance();

  const [discordAccount, setDiscordAccount] = useState<DiscordAccount | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isLinkingDiscord, setIsLinkingDiscord] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'partner' | 'user' | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    name: { en: '', es: '' },
    shortDescription: { en: '', es: '' },
    description: { en: '', es: '' },
    version: '1.0.0',
    minecraftVersion: '1.20.1',
    modloader: 'forge',
    modloaderVersion: '47.2.0',
    primaryColor: '#3b82f6',
    features: [],
    isComingSoon: false
  });

  const [zipFile, setZipFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentLang, setCurrentLang] = useState<'en' | 'es'>('en');
  const [currentStep, setCurrentStep] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const steps = [
    { id: 1, title: 'Upload', icon: Upload, description: 'Upload modpack ZIP' },
    { id: 2, title: 'Basic Info', icon: Package, description: 'Name & Version' },
    { id: 3, title: 'Details', icon: FileText, description: 'Description & Features' },
    { id: 4, title: 'Media', icon: ImageIcon, description: 'Logo & Screenshots' },
    { id: 5, title: 'Review', icon: Check, description: 'Review & Publish' }
  ];

  // Insert Category step if user is partner or admin
  const effectiveSteps = (userRole === 'admin' || userRole === 'partner')
    ? [
      steps[0],
      { id: 1.5, title: 'Category', icon: Layers, description: 'Select Category' },
      ...steps.slice(1)
    ].map((s, i) => ({ ...s, id: i + 1 }))
    : steps;

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
    }
  });

  // Download confirmation state
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [pendingUploadedFiles, setPendingUploadedFiles] = useState<Map<string, File> | null>(null);

  const checkDiscordAccess = async () => {
    setIsCheckingAccess(true);
    const account = await authService.getDiscordAccount();
    setDiscordAccount(account);
    setIsCheckingAccess(false);
    setIsCheckingAccess(false);

    // Check permissions and role
    const { role, partnerName } = await service.canManageModpacks();
    setUserRole(role);
    setPartnerName(partnerName || null);

    return account;
  };

  const handleLinkDiscord = async () => {
    setIsLinkingDiscord(true);
    try {
      await authService.linkDiscordAccount();
      setTimeout(async () => {
        await checkDiscordAccess();
        setIsLinkingDiscord(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to link Discord:', error);
      toast.error('Failed to link Discord account');
      setIsLinkingDiscord(false);
    }
  };

  useEffect(() => {
    const initializeAndSync = async () => {
      const account = await checkDiscordAccess();
      if (!account) return;

      const lastSync = account.lastSync ? new Date(account.lastSync) : null;
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const needsSync = !lastSync || lastSync < oneHourAgo;

      if (needsSync) {
        try {
          await authService.syncDiscordRoles();
          const updatedAccount = await authService.getDiscordAccount();
          setDiscordAccount(updatedAccount);
        } catch (error) {
          console.error('Failed to sync roles:', error);
        }
      }
    };
    initializeAndSync();
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
    resetValidation();
    await validateAndParseManifest(file);
  };

  const handleDownloadUpdatedZip = async () => {
    if (!pendingUploadedFiles || !zipFile) return;
    const loadingToast = toast.loading('Preparing files...');
    try {
      const { downloadDir } = await import('@tauri-apps/api/path');
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<{ current: number, total: number, stage: string, message: string }>('zip-progress', (event) => {
        const { current, total, stage, message } = event.payload;
        const percentage = Math.round((current / total) * 100);
        if (stage === 'complete') {
          toast.dismiss(loadingToast);
        } else {
          toast.loading(`${message} (${percentage}%)`, { id: loadingToast });
        }
      });

      const originalZipBuffer = await zipFile.arrayBuffer();
      const originalZipBytes = Array.from(new Uint8Array(originalZipBuffer));
      const uploadedFilesData: [string, number[]][] = [];
      for (const file of pendingUploadedFiles.values()) {
        const buffer = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        uploadedFilesData.push([file.name, bytes]);
      }

      const downloadsFolder = await downloadDir();
      const outputFileName = zipFile.name.replace('.zip', '_updated.zip');
      const outputZipPath = `${downloadsFolder}/${outputFileName}`;

      toast.loading('Creating updated modpack ZIP...', { id: loadingToast });
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
    if (!formData.isComingSoon && !zipFile) {
      toast.error('Modpack ZIP file is required for active modpacks');
      return false;
    }
    if (!logoFile) {
      toast.error('Logo is required for all modpacks');
      return false;
    }
    if (!bannerFile) {
      toast.error('Banner is required for all modpacks');
      return false;
    }
    if ((userRole === 'admin' || userRole === 'partner') && !formData.category) {
      toast.error('Please select a category for the modpack');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep !== effectiveSteps.length) return; // Prevent submission if not on the final step
    if (!validateForm()) return;

    try {
      await authService.syncDiscordRoles();
      const freshAccount = await checkDiscordAccess();
      if (!freshAccount || !freshAccount.isMember) {
        toast.error('You must be a Discord server member to publish modpacks');
        return;
      }
    } catch (error) {
      console.error('Failed to sync roles before publishing:', error);
      toast.error('Failed to verify permissions. Please try again.');
      return;
    }

    setIsUploading(true);
    try {
      const { success, modpackId, error } = await service.createModpack({
        slug: formData.name.en.toLowerCase().replace(/\s+/g, '-'),
        category: formData.category!, // Category is required (admin or partner only)
        name: formData.name,
        shortDescription: formData.shortDescription,
        description: formData.description,
        version: formData.version,
        minecraftVersion: formData.minecraftVersion,
        modloader: formData.modloader,
        modloaderVersion: formData.modloaderVersion,
        gamemode: formData.gamemode,
        serverIp: formData.serverIp,
        primaryColor: formData.primaryColor,
        isComingSoon: formData.isComingSoon
      });

      if (!success || !modpackId) {
        toast.error(`Error creating modpack: ${error}`);
        return;
      }

      if (logoFile) {
        setUploadProgress(10);
        await service.uploadModpackImage(modpackId, logoFile, 'logo');
      }
      if (bannerFile) {
        setUploadProgress(20);
        await service.uploadModpackImage(modpackId, bannerFile, 'banner');
      }
      if (screenshotFiles.length > 0) {
        setUploadProgress(30);
        await service.uploadModpackScreenshots(modpackId, screenshotFiles);
      }
      if (formData.features.length > 0) {
        setUploadProgress(40);
        await service.createModpackFeatures(modpackId, formData.features);
      }
      if (zipFile) {
        setUploadProgress(50);
        const uploadResult = await service.uploadModpackFile(
          modpackId,
          zipFile,
          (progress) => setUploadProgress(50 + (progress / 2))
        );
        if (!uploadResult.success) {
          toast.error(`Error uploading file: ${uploadResult.error}`);
          return;
        }
        await service.updateModpack(modpackId, { isActive: false });
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

  const nextStep = () => {
    if (currentStep < effectiveSteps.length) {
      // Validation for current step before moving to next
      const currentEffectiveStep = effectiveSteps.find(s => s.id === currentStep);
      if (currentEffectiveStep?.title === 'Upload' && !formData.isComingSoon && !zipFile) {
        toast.error('Please upload a modpack ZIP file (optional for Coming Soon modpacks)');
        return;
      }
      if (currentEffectiveStep?.title === 'Category' && !formData.category) {
        toast.error('Please select a category for the modpack');
        return;
      }
      if (currentEffectiveStep?.title === 'Basic Info') {
        if (!formData.name.en || !formData.name.es) {
          toast.error('Name is required in both languages');
          return;
        }
        if (!formData.version || !formData.minecraftVersion || !formData.modloaderVersion) {
          toast.error('All version fields are required');
          return;
        }
      }
      if (currentEffectiveStep?.title === 'Media') {
        if (!logoFile) {
          toast.error('Logo is required for all modpacks');
          return;
        }
        if (!bannerFile) {
          toast.error('Banner is required for all modpacks');
          return;
        }
      }
      setCurrentStep(prev => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      window.scrollTo(0, 0);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Publish Modpack
        </h1>
        <div className="relative flex justify-between items-center w-full mb-8">
          <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 dark:bg-gray-700 -z-10 rounded-full"></div>
          <div
            className="absolute top-1/2 left-0 h-1 bg-blue-600 -z-10 rounded-full transition-all duration-500 ease-in-out"
            style={{ width: `${((currentStep - 1) / (effectiveSteps.length - 1)) * 100}%` }}
          ></div>
          <div className="flex items-center justify-between relative z-10 w-full">
            {effectiveSteps.map((step) => {
              const isCompleted = currentStep > step.id;
              const isCurrent = currentStep === step.id;
              return (
                <div key={step.id} className="flex flex-col items-center gap-2 bg-gray-50 dark:bg-gray-900 px-2">
                  <div
                    className={`
                  w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                  ${isCurrent
                        ? 'border-blue-600 bg-blue-600 text-white scale-110 shadow-lg shadow-blue-500/30'
                        : isCompleted
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-400'
                      }
                `}
                  >
                    {isCompleted ? <Check className="w-6 h-6" /> : <step.icon className="w-5 h-5" />}
                  </div>
                  <span className={`text-xs font-medium ${isCurrent ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'}`}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isCheckingAccess && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 shadow-md text-center mb-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Checking access permissions...</p>
        </div>
      )}

      {!isCheckingAccess && !discordAccount && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 shadow-md mb-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                Discord Account Required
              </h3>
              <p className="text-yellow-700 dark:text-yellow-300 mb-4">
                You need to link your Discord account to publish modpacks.
              </p>
              <button
                onClick={handleLinkDiscord}
                disabled={isLinkingDiscord}
                className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {isLinkingDiscord ? 'Linking Discord...' : 'Link Discord Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isCheckingAccess && discordAccount && !discordAccount.isMember && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 shadow-md mb-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                Join Our Discord Server
              </h3>
              <p className="text-yellow-700 dark:text-yellow-300 mb-4">
                You must be a member of the LuminaKraft Discord server to publish modpacks.
              </p>
              <div className="flex gap-3">
                <a
                  href="https://discord.gg/UJZRrcUFMj"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                  Join Discord Server
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <form className="space-y-8">
        {/* Step 1: Upload ZIP File */}
        {currentStep === 1 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md animate-fade-in">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Step 1: Upload Modpack ZIP {formData.isComingSoon && <span className="text-sm text-gray-500 dark:text-gray-400 font-normal">(Optional for Coming Soon)</span>}
            </h2>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
              relative border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all duration-300
              ${isDragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
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
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
                    <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">Parsing manifest.json...</p>
                  </>
                ) : zipFile ? (
                  <>
                    <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-2">
                      <FileArchive className="w-10 h-10 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                        {zipFile.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {(zipFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      {manifestParsed && (
                        <div className="flex items-center justify-center gap-2 mt-3 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full text-sm font-medium">
                          <Check className="w-4 h-4" />
                          <span>Manifest parsed successfully</span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setZipFile(null);
                        resetValidation();
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="mt-4 px-4 py-2 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      Remove file
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Upload className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                        Drop your modpack ZIP here
                      </p>
                      <p className="text-gray-500 dark:text-gray-400">
                        Supports CurseForge and Modrinth formats
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
            {isUploading && (
              <div className="mt-6">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Uploading...
                  </span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {Math.round(uploadProgress)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 1.5: Category Selection (Partner/Admin only) */}
        {currentStep === 2 && (userRole === 'admin' || userRole === 'partner') && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">Select Category</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {userRole === 'admin' && (
                  <div
                    onClick={() => updateFormData('category', 'official')}
                    className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${formData.category === 'official'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                      }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg text-blue-600 dark:text-blue-400">
                        <Package className="w-6 h-6" />
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">Official Modpack</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Official LuminaKraft modpacks managed by the team.
                    </p>
                  </div>
                )}

                {userRole === 'partner' && (
                  <div
                    onClick={() => updateFormData('category', 'partner')}
                    className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${formData.category === 'partner'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
                      }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg text-purple-600 dark:text-purple-400">
                        <Layers className="w-6 h-6" />
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">Partner Modpack</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Exclusive modpacks from verified partners.
                      {partnerName && (
                        <span className="block mt-1 font-medium text-purple-600 dark:text-purple-400">
                          Partner: {partnerName}
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Community publishing disabled notice */}
              <div className="mt-6 bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Community modpack publishing</span> is temporarily disabled.
                  Only admins and verified partners can publish modpacks at this time.
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm mt-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Coming Soon Status</h3>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="isComingSoon"
                  checked={formData.isComingSoon || false}
                  onChange={(e) => updateFormData('isComingSoon', e.target.checked)}
                  className="mt-1 w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="isComingSoon" className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium text-gray-900 dark:text-white">Mark as Coming Soon</span>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    Coming Soon modpacks appear on the homepage but cannot be downloaded yet. The modpack ZIP file is optional for Coming Soon status.
                  </p>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Basic Information */}
        {((userRole !== 'admin' && userRole !== 'partner' && currentStep === 2) ||
          ((userRole === 'admin' || userRole === 'partner') && currentStep === 3)) && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                  Step {effectiveSteps.find(s => s.title === 'Basic Info')?.id}: Basic Information
                </h2>
                <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setCurrentLang('en')}
                    className={`px-4 py-2 font-medium transition-colors relative ${currentLang === 'en'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                  >
                    English
                    {currentLang === 'en' && (
                      <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full"></span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentLang('es')}
                    className={`px-4 py-2 font-medium transition-colors relative ${currentLang === 'es'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                  >
                    Español
                    {currentLang === 'es' && (
                      <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full"></span>
                    )}
                  </button>
                </div>
                <div className="mb-4">
                  <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name[currentLang]}
                    onChange={(e) => updateI18nField('name', currentLang, e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow"
                    required
                    placeholder={currentLang === 'en' ? 'My Awesome Modpack' : 'Mi Increíble Modpack'}
                  />
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                  Technical Details
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  {manifestParsed ? 'Auto-filled from manifest.json' : 'These will be auto-filled when you upload a ZIP'}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Version <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.version}
                      onChange={(e) => updateFormData('version', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow"
                      required
                      placeholder="1.0.0"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Minecraft Version <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.minecraftVersion}
                      onChange={(e) => updateFormData('minecraftVersion', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow"
                      required
                      placeholder="1.20.1"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Modloader <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.modloader}
                      onChange={(e) => updateFormData('modloader', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow"
                    >
                      <option value="forge">Forge</option>
                      <option value="fabric">Fabric</option>
                      <option value="neoforge">NeoForge</option>
                      <option value="quilt">Quilt</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Modloader Version <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.modloaderVersion}
                      onChange={(e) => updateFormData('modloaderVersion', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow"
                      required
                      placeholder="47.2.0"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Gamemode (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.gamemode || ''}
                      onChange={(e) => updateFormData('gamemode', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow"
                      placeholder="survival, creative, pvp, rpg, etc."
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Server IP (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.serverIp || ''}
                      onChange={(e) => updateFormData('serverIp', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow"
                      placeholder="play.example.com"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Primary Color
                    </label>
                    <div className="flex gap-4 items-center">
                      <input
                        type="color"
                        value={formData.primaryColor}
                        onChange={(e) => updateFormData('primaryColor', e.target.value)}
                        className="w-12 h-12 p-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 cursor-pointer"
                      />
                      <span className="text-gray-600 dark:text-gray-400 font-mono">{formData.primaryColor}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* Step 3: Details (Descriptions & Features) */}
        {((userRole !== 'admin' && userRole !== 'partner' && currentStep === 3) ||
          ((userRole === 'admin' || userRole === 'partner') && currentStep === 4)) && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                  Step {effectiveSteps.find(s => s.title === 'Details')?.id}: Details
                </h2>
                <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setCurrentLang('en')}
                    className={`px-4 py-2 font-medium transition-colors relative ${currentLang === 'en'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                  >
                    English
                    {currentLang === 'en' && (
                      <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full"></span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentLang('es')}
                    className={`px-4 py-2 font-medium transition-colors relative ${currentLang === 'es'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                  >
                    Español
                    {currentLang === 'es' && (
                      <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full"></span>
                    )}
                  </button>
                </div>
                <div className="mb-4">
                  <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Short Description
                  </label>
                  <input
                    type="text"
                    value={formData.shortDescription[currentLang]}
                    onChange={(e) => updateI18nField('shortDescription', currentLang, e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow"
                    placeholder={currentLang === 'en' ? 'A brief description...' : 'Una breve descripción...'}
                  />
                  <p className="text-xs text-gray-500 mt-1">Shown in modpack cards</p>
                </div>
                <div className="mb-4">
                  <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Full Description
                  </label>
                  <textarea
                    value={formData.description[currentLang]}
                    onChange={(e) => updateI18nField('description', currentLang, e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[150px] transition-shadow"
                    placeholder={currentLang === 'en' ? 'Full description...' : 'Descripción completa...'}
                  />
                  <p className="text-xs text-gray-500 mt-1">Markdown supported</p>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Features (Optional)
                  </h2>
                  <div className="flex gap-2">
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mr-4">
                      <button
                        type="button"
                        onClick={() => setCurrentLang('en')}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${currentLang === 'en'
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                          }`}
                      >
                        EN
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentLang('es')}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${currentLang === 'es'
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                          }`}
                      >
                        ES
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={addFeature}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Add Feature
                    </button>
                  </div>
                </div>
                {formData.features.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                    <p className="text-gray-500 dark:text-gray-400">
                      No features added yet. Add features to highlight what makes your modpack unique.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {formData.features.map((feature, index) => (
                      <div key={index} className="p-4 border border-gray-300 dark:border-gray-600 rounded-lg relative bg-gray-50 dark:bg-gray-700/50">
                        <button
                          type="button"
                          onClick={() => removeFeature(index)}
                          className="absolute top-2 right-2 p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded transition-colors"
                          title="Remove feature"
                        >
                          <X className="w-5 h-5" />
                        </button>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Title ({currentLang.toUpperCase()})</label>
                            <input
                              type="text"
                              value={feature.title[currentLang]}
                              onChange={(e) => updateFeature(index, 'title', currentLang, e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                              placeholder="Feature Title"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Icon (FontAwesome)</label>
                            <input
                              type="text"
                              value={feature.icon}
                              onChange={(e) => updateFeatureIcon(index, e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                              placeholder="e.g. fa-star"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Description ({currentLang.toUpperCase()})</label>
                            <textarea
                              value={feature.description[currentLang]}
                              onChange={(e) => updateFeature(index, 'description', currentLang, e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-20"
                              placeholder="Feature Description"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        {/* Step 4: Media */}
        {((userRole !== 'admin' && userRole !== 'partner' && currentStep === 4) ||
          ((userRole === 'admin' || userRole === 'partner') && currentStep === 5)) && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
                <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">
                  Step {effectiveSteps.find(s => s.title === 'Media')?.id}: Media
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Logo <span className="text-red-500">*</span>
                    </label>
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer relative group h-48 flex flex-col items-center justify-center">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      {logoFile ? (
                        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
                          <img
                            src={URL.createObjectURL(logoFile)}
                            alt="Logo preview"
                            className="w-24 h-24 object-contain mb-2 rounded-lg"
                          />
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-full px-2">{logoFile.name}</p>
                          <p className="text-xs text-gray-500">{(logoFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      ) : (
                        <div className="py-2">
                          <ImageIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-600 dark:text-gray-400">Click to upload logo</p>
                          <p className="text-xs text-gray-500 mt-1">Recommended: 512x512px</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Banner <span className="text-red-500">*</span>
                    </label>
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer relative group h-48 flex flex-col items-center justify-center">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      {bannerFile ? (
                        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
                          <img
                            src={URL.createObjectURL(bannerFile)}
                            alt="Banner preview"
                            className="w-full h-24 object-cover mb-2 rounded-lg"
                          />
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-full px-2">{bannerFile.name}</p>
                          <p className="text-xs text-gray-500">{(bannerFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      ) : (
                        <div className="py-2">
                          <ImageIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-600 dark:text-gray-400">Click to upload banner</p>
                          <p className="text-xs text-gray-500 mt-1">Recommended: 1920x1080px</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Screenshots (Optional) - Max 5
                  </label>
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer relative">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const newFiles = Array.from(e.target.files || []);
                        if (screenshotFiles.length + newFiles.length > 5) {
                          toast.error('You can only upload a maximum of 5 screenshots');
                        }
                        setScreenshotFiles(prev => [...prev, ...newFiles].slice(0, 5));
                        // Reset input value to allow selecting the same file again if needed
                        e.target.value = '';
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={screenshotFiles.length >= 5}
                    />
                    <div className="py-4">
                      <ImageIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {screenshotFiles.length >= 5 ? 'Maximum screenshots reached' : 'Click to upload screenshots'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Select multiple files (Max 5)</p>
                    </div>
                  </div>
                  {screenshotFiles.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                      {screenshotFiles.map((file, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={URL.createObjectURL(file)}
                            alt={`Screenshot ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                          />
                          <button
                            type="button"
                            onClick={() => setScreenshotFiles(prev => prev.filter((_, i) => i !== index))}
                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        }

        {/* Step 5: Review */}
        {
          ((userRole !== 'admin' && userRole !== 'partner' && currentStep === 5) ||
            ((userRole === 'admin' || userRole === 'partner') && currentStep === 6)) && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md animate-fade-in">
              <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">
                Step 5: Review & Publish
              </h2>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Basic Info</h3>
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
                      <p><span className="font-medium">Name:</span> {formData.name.en}</p>
                      <p><span className="font-medium">Version:</span> {formData.version}</p>
                      <p><span className="font-medium">Minecraft:</span> {formData.minecraftVersion}</p>
                      <p><span className="font-medium">Modloader:</span> {formData.modloader} {formData.modloaderVersion}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Files</h3>
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
                      <p className="flex items-center gap-2">
                        <FileArchive className="w-4 h-4" />
                        {zipFile?.name || 'No ZIP selected'}
                      </p>
                      <p className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        Logo: {logoFile ? 'Uploaded' : 'None'}
                      </p>
                      <p className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        Banner: {bannerFile ? 'Uploaded' : 'None'}
                      </p>
                      <p className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        Screenshots: {screenshotFiles.length}
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Description</h3>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <p className="line-clamp-3 text-gray-600 dark:text-gray-300">{formData.description.en || 'No description provided.'}</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Features</h3>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    {formData.features.length > 0 ? (
                      <ul className="list-disc list-inside">
                        {formData.features.map((f, i) => (
                          <li key={i}>
                            <span className="font-medium">{f.title.en}</span>
                            {f.title.es && <span className="text-gray-500 text-sm ml-2">({f.title.es})</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-500 italic">No features added.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        }

        <div className="flex justify-between pt-6 border-t border-gray-200 dark:border-gray-700 mt-8">
          <button
            type="button"
            onClick={currentStep === 1 ? () => onNavigate?.('published-modpacks') : prevStep}
            className="px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors flex items-center gap-2"
            disabled={isUploading}
          >
            {currentStep === 1 ? 'Cancel' : (
              <>
                <ChevronLeft className="w-4 h-4" />
                Back
              </>
            )}
          </button>
          {currentStep < effectiveSteps.length ? (
            <button
              type="button"
              onClick={nextStep}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center gap-2"
            >
              Next Step
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isUploading}
              className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-2 shadow-lg shadow-green-500/30"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Publishing... {Math.round(uploadProgress)}%
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Publish Modpack
                </>
              )}
            </button>
          )}
        </div>
      </form >

      {/* Validation Dialog */}
      {
        validationData && (
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
            onContinue={(uploadedFiles) => {
              setShowValidationDialog(false);
              if (uploadedFiles) {
                setPendingUploadedFiles(uploadedFiles);
              }
            }}
            modpackName={validationData.modpackName}
            modsWithoutUrl={validationData.modsWithoutUrl}
            modsInOverrides={validationData.modsInOverrides}
          />
        )
      }

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

    </div >
  );
}

export default PublishModpackForm;
