import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { Plus, X, Upload, FileArchive, RefreshCw, Check, ChevronRight, ChevronLeft, Info, Image as ImageIcon, FileText, Package, Layers, ChevronDown, ChevronUp, UserCog, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import JSZip from 'jszip';
import { supabase } from '../../services/supabaseClient';
import ModpackManagementService from '../../services/modpackManagementService';
import R2UploadService from '../../services/r2UploadService';
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
  recommendedRam?: number;
  gamemode?: string;
  serverIp?: string;
  primaryColor: string;
  features: Feature[];
  category?: 'official' | 'partner' | 'community';
  isComingSoon?: boolean;
  allowCustomMods?: boolean;
  allowCustomResourcepacks?: boolean;
  allowCustomConfigs?: boolean;
}

interface PublishModpackFormProps {
  onNavigate?: (_section: string) => void;
}

export function PublishModpackForm({ onNavigate }: PublishModpackFormProps) {
  const { t } = useTranslation();
  const service = ModpackManagementService.getInstance();
  const authService = AuthService.getInstance();

  const [discordAccount, setDiscordAccount] = useState<DiscordAccount | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isLinkingDiscord, setIsLinkingDiscord] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'partner' | 'user' | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);

  // Load saved form data from localStorage
  const getSavedFormData = (): FormData => {
    try {
      const saved = localStorage.getItem('publishModpackFormData');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load saved form data:', e);
    }
    return {
      name: { en: '', es: '' },
      shortDescription: { en: '', es: '' },
      description: { en: '', es: '' },
      version: '1.0.0',
      minecraftVersion: '1.20.1',
      modloader: 'forge',
      modloaderVersion: '47.2.0',
      primaryColor: '#3b82f6',
      features: [],
      isComingSoon: false,
      allowCustomMods: true,
      allowCustomResourcepacks: true,
      allowCustomConfigs: true
    };
  };

  const getSavedStep = (): number => {
    try {
      const saved = localStorage.getItem('publishModpackFormStep');
      if (saved) {
        return parseInt(saved, 10) || 1;
      }
    } catch (e) {
      console.warn('Failed to load saved step:', e);
    }
    return 1;
  };

  // Get user's current i18n language as the default
  const getUserLang = (): 'en' | 'es' => {
    const lang = i18n.language;
    return lang === 'es' ? 'es' : 'en';
  };

  const [formData, setFormData] = useState<FormData>(getSavedFormData);

  const [zipFile, setZipFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [isDraggingBanner, setIsDraggingBanner] = useState(false);
  const [isDraggingScreenshots, setIsDraggingScreenshots] = useState(false);
  const [currentLang, setCurrentLang] = useState<'en' | 'es'>(getUserLang);
  const [currentStep, setCurrentStep] = useState(getSavedStep);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [showAdvancedProtection, setShowAdvancedProtection] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('publishModpackFormData', JSON.stringify(formData));
    } catch (e) {
      console.warn('Failed to save form data:', e);
    }
  }, [formData]);

  // Save current step to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('publishModpackFormStep', currentStep.toString());
    } catch (e) {
      console.warn('Failed to save step:', e);
    }
  }, [currentStep]);

  // Reset language to user's language when step changes
  useEffect(() => {
    setCurrentLang(getUserLang());
  }, [currentStep]);

  const getSteps = () => [
    { id: 1, title: t('publishModpack.steps.upload'), icon: Upload, description: t('publishModpack.steps.uploadDesc') },
    { id: 2, title: t('publishModpack.steps.basicInfo'), icon: Package, description: t('publishModpack.steps.basicInfoDesc') },
    { id: 3, title: t('publishModpack.steps.details'), icon: FileText, description: t('publishModpack.steps.detailsDesc') },
    { id: 4, title: t('publishModpack.steps.media'), icon: ImageIcon, description: t('publishModpack.steps.mediaDesc') },
    { id: 5, title: t('publishModpack.steps.review'), icon: Check, description: t('publishModpack.steps.reviewDesc') }
  ];

  // Helper to render language tabs with user's language first
  const userLang = getUserLang();
  const languageOrder: Array<'en' | 'es'> = userLang === 'es' ? ['es', 'en'] : ['en', 'es'];
  const langLabels = {
    en: t('publishModpack.language.english'),
    es: t('publishModpack.language.spanish')
  };

  const renderLanguageTabs = () => (
    <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
      {languageOrder.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setCurrentLang(lang)}
          className={`px-4 py-2 font-medium transition-colors relative ${currentLang === lang
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
        >
          {langLabels[lang]}
          {currentLang === lang && (
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full"></span>
          )}
        </button>
      ))}
    </div>
  );

  const renderSmallLanguageTabs = () => (
    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mr-4">
      {languageOrder.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setCurrentLang(lang)}
          className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${currentLang === lang
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );

  const steps = getSteps();

  // Insert Category step if user is partner or admin
  const effectiveSteps = (userRole === 'admin' || userRole === 'partner')
    ? [
      steps[0],
      { id: 1.5, title: t('publishModpack.steps.category'), icon: Layers, description: t('publishModpack.steps.categoryDesc') },
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
        modloaderVersion: data.modloaderVersion || prev.modloaderVersion,
        recommendedRam: data.recommendedRam
      }));
    }
  });

  // Download confirmation state
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [pendingUploadedFiles, setPendingUploadedFiles] = useState<Map<string, File> | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

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
      toast.error(t('auth.discordLinkFailed'));
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

  useEffect(() => {
    // Set default category and protection based on user role
    if (userRole === 'admin' && !formData.category) {
      setFormData(prev => ({
        ...prev,
        category: 'official',
        allowCustomMods: false,
        allowCustomResourcepacks: false,
        allowCustomConfigs: false
      }));
    } else if (userRole === 'partner' && !formData.category) {
      setFormData(prev => ({
        ...prev,
        category: 'partner',
        allowCustomMods: false,
        allowCustomResourcepacks: false,
        allowCustomConfigs: false
      }));
    } else if (userRole === 'user' && !formData.category) {
      setFormData(prev => ({
        ...prev,
        category: 'community',
        allowCustomMods: true,
        allowCustomResourcepacks: true,
        allowCustomConfigs: true
      }));
    }
  }, [userRole]);

  // Validate modpack name/slug doesn't already exist
  useEffect(() => {
    const validateName = async () => {
      const name = formData.name.en.trim();
      if (!name || name.length < 3) {
        setNameError(null);
        return;
      }

      setIsCheckingName(true);
      try {
        const slug = name.toLowerCase().replace(/\s+/g, '-');

        const { data, error } = await supabase
          .from('modpacks')
          .select('id')
          .eq('slug', slug)
          .limit(1);

        if (error) {
          console.error('Error checking modpack name:', error);
          setNameError(null);
          return;
        }

        if (data && data.length > 0) {
          setNameError(t('publishModpack.validation.nameAlreadyExists'));
        } else {
          setNameError(null);
        }
      } catch (error) {
        console.error('Failed to validate name:', error);
      } finally {
        setIsCheckingName(false);
      }
    };

    // Debounce validation (only check after user stops typing for 500ms)
    const timeoutId = setTimeout(validateName, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.name.en, t]);

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
    if (!file.name.endsWith('.zip') && !file.name.endsWith('.mrpack')) {
      toast.error(t('publishModpack.validation.zipRequired'));
      return;
    }
    setZipFile(file);
    resetValidation();
    await validateAndParseManifest(file);
  };

  const handleDownloadUpdatedZip = async () => {
    if (!pendingUploadedFiles || !zipFile) return;

    setIsDownloadingZip(true);
    setDownloadProgress(0);

    try {
      const originalZipBuffer = await zipFile.arrayBuffer();
      const originalZipBytes = Array.from(new Uint8Array(originalZipBuffer));

      const unlisten = await listen<{ current: number, total: number, stage: string, message: string }>('zip-progress', (event) => {
        const { current, total } = event.payload;
        const percentage = Math.round((current / total) * 100);
        setDownloadProgress(percentage);
      });

      const uploadedFilesData: [string, number[]][] = [];
      for (const file of pendingUploadedFiles.values()) {
        const buffer = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        uploadedFilesData.push([file.name, bytes]);
      }

      const outputFileName = zipFile.name.endsWith('.mrpack')
        ? zipFile.name.replace('.mrpack', '_updated.mrpack')
        : zipFile.name.replace('.zip', '_updated.zip');

      const outputZipPath = await save({
        defaultPath: outputFileName,
        filters: [{
          name: 'Modpack File',
          extensions: ['zip', 'mrpack']
        }]
      });

      if (!outputZipPath) {
        setIsDownloadingZip(false);
        return;
      }

      setDownloadProgress(10);

      await invoke('create_modpack_with_overrides', {
        originalZipBytes: originalZipBytes,
        originalZipName: zipFile.name,
        uploadedFiles: uploadedFilesData,
        outputZipPath: outputZipPath
      });

      unlisten();
      setDownloadProgress(100);
    } catch (error) {
      console.error('Error creating modpack with overrides:', error);
      toast.error(t('publishModpack.messages.uploadError', { error: String(error) }));
    } finally {
      setIsDownloadingZip(false);
      setTimeout(() => setDownloadProgress(0), 500);
    }
    // Note: Don't clear pendingUploadedFiles here - they're still needed for publishing
  };

  const handleSkipDownload = () => {
    // Silently skip - don't show success toast for this background operation
  };

  // Calculate updated ZIP size with overrides
  const getUpdatedZipSize = (): number => {
    if (!zipFile || !pendingUploadedFiles || pendingUploadedFiles.size === 0) {
      return zipFile?.size || 0;
    }
    const uploadedFilesSize = Array.from(pendingUploadedFiles.values()).reduce((sum, file) => sum + file.size, 0);
    return zipFile.size + uploadedFilesSize;
  };

  // Prepare ZIP with overrides if needed
  const prepareZipForUpload = async (): Promise<File> => {
    // If no pending files, return original ZIP
    if (!pendingUploadedFiles || pendingUploadedFiles.size === 0 || !zipFile) {
      return zipFile!;
    }

    // Create updated ZIP with overrides using JSZip
    try {
      // Read original ZIP
      const originalZipBuffer = await zipFile.arrayBuffer();
      const originalZip = new JSZip();
      await originalZip.loadAsync(originalZipBuffer);

      // Add uploaded files to appropriate overrides folder based on file type
      for (const file of pendingUploadedFiles.values()) {
        const fileBuffer = await file.arrayBuffer();

        // Determine target folder based on file extension
        let filePath: string;
        if (file.name.endsWith('.jar')) {
          filePath = `overrides/mods/${file.name}`;
        } else if (file.name.endsWith('.zip')) {
          filePath = `overrides/resourcepacks/${file.name}`;
        } else {
          console.warn(`[ZIP] Unknown file extension, skipping: ${file.name}`);
          continue;
        }

        originalZip.file(filePath, fileBuffer);
        console.log(`[ZIP] Added to ZIP: ${filePath}`);
      }

      // Generate new ZIP
      const updatedZipBlob = await originalZip.generateAsync({ type: 'blob' });
      const updatedFile = new File([updatedZipBlob], zipFile.name, { type: 'application/zip' });

      console.log(`[ZIP] Created updated ZIP with ${pendingUploadedFiles.size} file(s)`);
      return updatedFile;
    } catch (error) {
      console.error('[ZIP] Failed to create updated ZIP, using original:', error);
      toast.error('Could not create updated ZIP with overrides, using original file');
      return zipFile!;
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
      toast.error(t('publishModpack.validation.dropZip'));
    }
  };

  const validateForm = (): boolean => {
    if (!formData.name.en || !formData.name.es) {
      toast.error(t('publishModpack.validation.nameRequired'));
      return false;
    }
    if (nameError) {
      toast.error(nameError);
      return false;
    }
    if (!formData.shortDescription.en || !formData.shortDescription.es) {
      toast.error(t('publishModpack.validation.shortDescRequired'));
      return false;
    }
    if (!formData.description.en || !formData.description.es) {
      toast.error(t('publishModpack.validation.fullDescRequired'));
      return false;
    }
    if (!formData.version) {
      toast.error(t('publishModpack.validation.versionRequired'));
      return false;
    }
    if (!formData.minecraftVersion) {
      toast.error(t('publishModpack.validation.minecraftVersionRequired'));
      return false;
    }
    if (!formData.modloaderVersion) {
      toast.error(t('publishModpack.validation.modloaderVersionRequired'));
      return false;
    }
    if (!formData.isComingSoon && !zipFile) {
      toast.error(t('publishModpack.validation.zipFileRequired'));
      return false;
    }
    if (!logoFile) {
      toast.error(t('publishModpack.validation.logoRequired'));
      return false;
    }
    if (!bannerFile) {
      toast.error(t('publishModpack.validation.bannerRequired'));
      return false;
    }
    if ((userRole === 'admin' || userRole === 'partner') && !formData.category) {
      toast.error(t('publishModpack.validation.categoryRequired'));
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
        toast.error(t('publishModpack.validation.discordMemberRequired'));
        return;
      }
    } catch (error) {
      console.error('Failed to sync roles before publishing:', error);
      toast.error(t('publishModpack.validation.permissionError'));
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
        recommendedRam: formData.recommendedRam,
        gamemode: formData.gamemode,
        serverIp: formData.serverIp,
        primaryColor: formData.primaryColor,
        isComingSoon: formData.isComingSoon,
        allowCustomMods: formData.allowCustomMods,
        allowCustomResourcepacks: formData.allowCustomResourcepacks,
        allowCustomConfigs: formData.allowCustomConfigs
      });

      if (!success || !modpackId) {
        // Handle specific database constraint errors
        if (error && typeof error === 'string' && error.includes('modpacks_slug_key')) {
          toast.error(t('publishModpack.messages.createError', { error: 'A modpack with this name already exists. Please choose a different name.' }));
        } else if (error && typeof error === 'string' && error.includes('duplicate key')) {
          toast.error(t('publishModpack.messages.createError', { error: 'This modpack name is already taken.' }));
        } else {
          toast.error(t('publishModpack.messages.createError', { error: error || 'Unknown error' }));
        }
        return;
      }

      if (logoFile) {
        try {
          setUploadProgress(10);
          await R2UploadService.uploadToR2(logoFile, modpackId, 'logo', (progress) => {
            setUploadProgress(10 + (progress.percent * 0.1));
          });
        } catch (error) {
          console.error('[Logo] Upload failed:', error);
          toast.error(t('publishModpack.messages.uploadError', { error: String(error) }));
          return;
        }
      }
      if (bannerFile) {
        try {
          setUploadProgress(20);
          await R2UploadService.uploadToR2(bannerFile, modpackId, 'banner', (progress) => {
            setUploadProgress(20 + (progress.percent * 0.1));
          });
        } catch (error) {
          console.error('[Banner] Upload failed:', error);
          toast.error(t('publishModpack.messages.uploadError', { error: String(error) }));
          return;
        }
      }
      if (screenshotFiles.length > 0) {
        try {
          setUploadProgress(30);
          for (let i = 0; i < screenshotFiles.length; i++) {
            const startProgress = 30 + (i * (10 / screenshotFiles.length));
            await R2UploadService.uploadToR2(screenshotFiles[i], modpackId, 'screenshot', (progress) => {
              setUploadProgress(startProgress + (progress.percent * (10 / screenshotFiles.length) / 100));
            }, i); // Pass sort order (index)
          }
        } catch (error) {
          console.error('[Screenshot] Upload failed:', error);
          toast.error(t('publishModpack.messages.uploadError', { error: String(error) }));
          return;
        }
      }
      if (formData.features.length > 0) {
        setUploadProgress(40);
        await service.createModpackFeatures(modpackId, formData.features);
      }
      if (zipFile) {
        try {
          setUploadProgress(50);

          // Prepare ZIP with overrides if needed
          let zipToUpload = zipFile;
          if (pendingUploadedFiles && pendingUploadedFiles.size > 0) {
            setUploadProgress(60);
            zipToUpload = await prepareZipForUpload();
          }

          setUploadProgress(65);
          const uploadResult = await R2UploadService.uploadToR2(
            zipToUpload,
            modpackId,
            'modpack',
            (progress) => setUploadProgress(65 + (progress.percent * 0.35))
          );

          // Force update the version with the file URL to ensure it's saved
          // This fixes the issue where modpacks with server IP were missing the ZIP URL
          if (uploadResult.fileUrl) {
            await (supabase as any)
              .from('modpack_versions')
              .update({
                file_url: uploadResult.fileUrl,
                file_size: uploadResult.fileSize
              })
              .eq('modpack_id', modpackId)
              .eq('version', formData.version);
          }

          // uploadResult already contains fileUrl and fileSize
          // The register-modpack-upload function has already been called by r2UploadService
          // but we still need to create version entry for coming soon modpacks
          setUploadProgress(75);

          const { data: versions } = await supabase
            .from('modpack_versions')
            .select('id')
            .eq('modpack_id', modpackId)
            .limit(1);

          if (!versions || versions.length === 0) {
            setUploadProgress(80);
            await supabase.from('modpack_versions').insert({
              modpack_id: modpackId,
              version: formData.version,
              changelog_i18n: { en: 'Initial release', es: 'Lanzamiento inicial' },
              file_path: uploadResult.fileUrl,
              file_url: uploadResult.fileUrl
            } as any);
          }

          setUploadProgress(90);
          await service.updateModpack(modpackId, { isActive: false });
          setUploadProgress(95);
        } catch (error) {
          console.error('[Modpack ZIP] Upload failed:', error);
          toast.error(t('publishModpack.messages.uploadError', { error: String(error) }));
          return;
        }
      }

      setUploadProgress(100);
      toast.success(t('publishModpack.messages.published'));
      // Reset state after a short delay
      setTimeout(() => {
        setUploadProgress(0);
        setPendingUploadedFiles(null); // Clean up uploaded files
        // Clear saved form data from localStorage
        localStorage.removeItem('publishModpackFormData');
        localStorage.removeItem('publishModpackFormStep');
        localStorage.removeItem('publishModpackFormLang');
        onNavigate?.('published-modpacks');
      }, 500);
    } catch (error) {
      console.error('Error creating modpack:', error);

      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('modpacks_slug_key')) {
          toast.error('A modpack with this name already exists. Please choose a different name.');
        } else if (error.message.includes('duplicate key')) {
          toast.error('This modpack name is already taken.');
        } else {
          toast.error(t('publishModpack.messages.createError', { error: error.message }));
        }
      } else {
        toast.error(t('publishModpack.messages.createError', { error: String(error) }));
      }
    } finally {
      setIsUploading(false);
    }
  };

  const nextStep = () => {
    if (currentStep < effectiveSteps.length) {
      // Validation for current step before moving to next
      const currentEffectiveStep = effectiveSteps.find(s => s.id === currentStep);
      if (currentEffectiveStep?.title === t('publishModpack.steps.upload') && !formData.isComingSoon && !zipFile) {
        toast.error(t('publishModpack.validation.zipFileOptionalMessage'));
        return;
      }
      if (currentEffectiveStep?.title === t('publishModpack.steps.category') && !formData.category) {
        toast.error(t('publishModpack.validation.categoryRequired'));
        return;
      }
      if (currentEffectiveStep?.title === t('publishModpack.steps.basicInfo')) {
        if (!formData.name.en || !formData.name.es) {
          toast.error(t('publishModpack.validation.nameRequired'));
          return;
        }
        if (nameError) {
          toast.error(nameError);
          return;
        }
        if (!formData.version || !formData.minecraftVersion || !formData.modloaderVersion) {
          toast.error(t('publishModpack.validation.allVersionsRequired'));
          return;
        }
      }
      if (currentEffectiveStep?.title === t('publishModpack.steps.details')) {
        if (!formData.shortDescription.en || !formData.shortDescription.es) {
          toast.error(t('publishModpack.validation.shortDescRequired'));
          return;
        }
        if (!formData.description.en || !formData.description.es) {
          toast.error(t('publishModpack.validation.fullDescRequired'));
          return;
        }
      }
      if (currentEffectiveStep?.title === t('publishModpack.steps.media')) {
        if (!logoFile) {
          toast.error(t('publishModpack.validation.logoRequired'));
          return;
        }
        if (!bannerFile) {
          toast.error(t('publishModpack.validation.bannerRequired'));
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

  const handleClose = () => {
    try {
      localStorage.removeItem('publishModpackFormData');
      localStorage.removeItem('publishModpackFormStep');
      localStorage.removeItem('publishModpackFormLang');
    } catch (e) {
      console.warn('Failed to clear form state:', e);
    }
    onNavigate?.('published-modpacks');
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('publishModpack.title')}
          </h1>
          <button
            onClick={handleClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
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
                  w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-200
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
          <p className="text-gray-600 dark:text-gray-400">{t('publishModpack.checkingAccess')}</p>
        </div>
      )}

      {/* No Discord Account Linked */}
      {!isCheckingAccess && !discordAccount && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 shadow-md mb-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                {t('publishModpack.alerts.discordRequired')}
              </h3>
              <p className="text-yellow-700 dark:text-yellow-300 mb-4">
                {t('publishModpack.alerts.discordRequiredDesc')}
              </p>
              <button
                onClick={handleLinkDiscord}
                disabled={isLinkingDiscord}
                className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {isLinkingDiscord ? t('publishModpack.buttons.linking') : t('publishModpack.buttons.linkDiscord')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Has Discord but Not Member of Server */}
      {!isCheckingAccess && discordAccount && !discordAccount.isMember && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 shadow-md mb-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                {t('publishModpack.alerts.joinServer')}
              </h3>
              <p className="text-yellow-700 dark:text-yellow-300 mb-4">
                {t('publishModpack.alerts.joinServerDesc')}
              </p>
              <a
                href="https://discord.gg/UJZRrcUFMj"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                {t('publishModpack.buttons.joinDiscord')}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Is Member but Not Partner/Admin (Regular User) */}
      {!isCheckingAccess && discordAccount && discordAccount.isMember && (userRole === 'user' || userRole === null) && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 shadow-md mb-6">
          <div className="flex items-start space-x-3">
            <Info className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">
                {t('publishModpack.alerts.comingSoonTitle')}
              </h3>
              <p className="text-blue-700 dark:text-blue-300 mb-2">
                {t('publishModpack.alerts.comingSoonDesc')}
              </p>
              <p className="text-blue-700 dark:text-blue-300">
                {t('publishModpack.alerts.comingSoonNote')}
              </p>
            </div>
          </div>
        </div>
      )}

      <form className="space-y-8">
        {/* Step 1: Upload ZIP File */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-fade-in">
            {/* Coming Soon Status Checkbox */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{t('publishModpack.status.title')}</h3>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="isComingSoon"
                  checked={formData.isComingSoon || false}
                  onChange={(e) => updateFormData('isComingSoon', e.target.checked)}
                  className="mt-1 w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="isComingSoon" className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium text-gray-900 dark:text-white">{t('publishModpack.status.comingSoon')}</span>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    {t('publishModpack.status.comingSoonDesc')}
                  </p>
                </label>
              </div>
            </div>

            {/* Upload ZIP Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-md">
              <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                {t('publishModpack.steps.uploadDesc')} {formData.isComingSoon && <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">{t('publishModpack.upload.optional')}</span>}
              </h2>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
              relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200 min-h-0
              ${isDragging
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }
            `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.mrpack"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleZipFile(file);
                  }}
                  className="hidden"
                  required
                />
                <div className="flex flex-col items-center gap-2">
                  {isParsing ? (
                    <>
                      <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600"></div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{t('publishModpack.upload.parsing')}</p>
                    </>
                  ) : zipFile ? (
                    <div className="flex items-center justify-between w-full gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileArchive className="w-6 h-6 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="text-left min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-full px-2">{zipFile.name}</p>
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {(getUpdatedZipSize() / 1024 / 1024).toFixed(2)} MB
                            </p>
                            {pendingUploadedFiles && pendingUploadedFiles.size > 0 && (
                              <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium">
                                +{pendingUploadedFiles.size}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setZipFile(null);
                          resetValidation();
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                        title={t('publishModpack.upload.remove')}
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-1" />
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {t('publishModpack.upload.dragDropAlt')}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {t('publishModpack.upload.formatInfo')}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {isUploading && (
              <div className="mt-6">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('publishModpack.upload.uploading')}
                  </span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {Math.round(uploadProgress)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 1.5: Category Selection (Partner/Admin only) */}
        {currentStep === 2 && (userRole === 'admin' || userRole === 'partner') && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">{t('publishModpack.steps.categoryDesc')}</h2>
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
                      <h3 className="font-semibold text-gray-900 dark:text-white">{t('publishModpack.category.official')}</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('publishModpack.category.officialDesc')}
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
                      <h3 className="font-semibold text-gray-900 dark:text-white">{t('publishModpack.category.partner')}</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('publishModpack.category.partnerDesc')}
                      {partnerName && (
                        <span className="block mt-1 font-medium text-purple-600 dark:text-purple-400">
                          {t('publishModpack.category.partnerInfo', { name: partnerName })}
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Community publishing disabled notice */}
              <div className="mt-6 bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                  {t('publishModpack.category.note')}
                </p>
              </div>

              {/* User Modifications Section - Enhanced */}
              <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                        <UserCog className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                        {t('publishModpack.userModifications.title')}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-7">
                        {t('publishModpack.userModifications.description')}
                      </p>
                    </div>

                    {/* Main Toggle */}
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-medium ${(formData.allowCustomMods !== false || formData.allowCustomResourcepacks !== false || formData.allowCustomConfigs !== false)
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-amber-600 dark:text-amber-400'
                        }`}>
                        {(formData.allowCustomMods !== false || formData.allowCustomResourcepacks !== false || formData.allowCustomConfigs !== false)
                          ? t('publishModpack.userModifications.allowed')
                          : t('publishModpack.userModifications.restricted')
                        }
                      </span>

                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={formData.allowCustomMods !== false || formData.allowCustomResourcepacks !== false || formData.allowCustomConfigs !== false}
                          onChange={(e) => {
                            const allowed = e.target.checked;
                            setFormData(prev => ({
                              ...prev,
                              allowCustomMods: allowed,
                              allowCustomResourcepacks: allowed,
                              allowCustomConfigs: allowed
                            }));
                            if (allowed) {
                              setShowAdvancedProtection(true);
                            }
                          }}
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Advanced Options Toggle */}
                <div className="border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedProtection(!showAdvancedProtection)}
                    className="w-full px-5 py-3 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <span className="font-medium">{t('publishModpack.userModifications.advancedOptions')}</span>
                    {showAdvancedProtection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showAdvancedProtection && (
                    <div className="p-5 bg-gray-50 dark:bg-gray-800/50 space-y-4 animate-fade-in border-t border-gray-100 dark:border-gray-700">
                      <div className="space-y-4">
                        {/* Allow Custom Mods */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${formData.allowCustomMods !== false ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}>
                              <Package className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {t('publishModpack.userModifications.allowMods')}
                            </span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={formData.allowCustomMods !== false}
                              onChange={(e) => updateFormData('allowCustomMods', e.target.checked)}
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        {/* Allow Custom Resourcepacks */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${formData.allowCustomResourcepacks !== false ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}>
                              <Layers className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {t('publishModpack.userModifications.allowResourcepacks')}
                            </span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={formData.allowCustomResourcepacks !== false}
                              onChange={(e) => updateFormData('allowCustomResourcepacks', e.target.checked)}
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        {/* Allow Custom Configs */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${formData.allowCustomConfigs !== false ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}>
                              <FileText className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {t('publishModpack.userModifications.allowConfigs')}
                            </span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={formData.allowCustomConfigs !== false}
                              onChange={(e) => updateFormData('allowCustomConfigs', e.target.checked)}
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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
                  {t('publishModpack.steps.basicInfo')}
                </h2>
                {renderLanguageTabs()}
                <div className="mb-4">
                  <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                    {t('publishModpack.basicInfo.name')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.name[currentLang]}
                      onChange={(e) => updateI18nField('name', currentLang, e.target.value)}
                      className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow ${nameError
                        ? 'border-red-500 dark:border-red-500'
                        : 'border-gray-300 dark:border-gray-600'
                        }`}
                      required
                      placeholder={currentLang === 'en' ? 'My Awesome Modpack' : 'Mi Increíble Modpack'}
                    />
                    {isCheckingName && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                      </div>
                    )}
                  </div>
                  {
                    nameError && (
                      <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {nameError}
                      </p>
                    )
                  }
                </div >
              </div >
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                  {t('publishModpack.basicInfo.title')}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  {manifestParsed ? t('publishModpack.basicInfo.autoFilled') : t('publishModpack.basicInfo.autoFilledOnUpload')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                      {t('publishModpack.basicInfo.version')} <span className="text-red-500">*</span>
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
                      {t('publishModpack.basicInfo.minecraftVersion')} <span className="text-red-500">*</span>
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
                      {t('publishModpack.basicInfo.modloader')} <span className="text-red-500">*</span>
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
                      {t('publishModpack.basicInfo.modloaderVersion')} <span className="text-red-500">*</span>
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
                      {t('publishModpack.basicInfo.gamemode')} {t('publishModpack.basicInfo.gamemodeOptional')}
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
                      {t('publishModpack.basicInfo.serverIp')} {t('publishModpack.basicInfo.serverIpOptional')}
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
                      {t('publishModpack.basicInfo.primaryColor')}
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
        {
          ((userRole !== 'admin' && userRole !== 'partner' && currentStep === 3) ||
            ((userRole === 'admin' || userRole === 'partner') && currentStep === 4)) && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                  {t('publishModpack.steps.details')}
                </h2>
                {renderLanguageTabs()}
                <div className="mb-4">
                  <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                    {t('publishModpack.details.shortDescription')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={50}
                    value={formData.shortDescription[currentLang]}
                    onChange={(e) => updateI18nField('shortDescription', currentLang, e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow"
                    placeholder={currentLang === 'en' ? 'A brief description...' : 'Una breve descripción...'}
                  />
                  <p className="text-xs text-gray-500 mt-1">{formData.shortDescription[currentLang].length}/50 - {t('publishModpack.details.shortDescriptionHelper')}</p>
                </div>
                <div className="mb-4">
                  <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                    {t('publishModpack.details.fullDescription')} <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    maxLength={380}
                    value={formData.description[currentLang]}
                    onChange={(e) => updateI18nField('description', currentLang, e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[150px] transition-shadow"
                    placeholder={currentLang === 'en' ? 'Full description...' : 'Descripción completa...'}
                  />
                  <p className="text-xs text-gray-500 mt-1">{formData.description[currentLang].length}/380 - {t('publishModpack.details.fullDescriptionHelper')}</p>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {t('publishModpack.details.features')}
                  </h2>
                  <div className="flex gap-2">
                    {renderSmallLanguageTabs()}
                    <button
                      type="button"
                      onClick={addFeature}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      {t('publishModpack.details.addFeature')}
                    </button>
                  </div>
                </div>
                {formData.features.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                    <p className="text-gray-500 dark:text-gray-400">
                      {t('publishModpack.details.noFeatures')}
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
                          title={t('publishModpack.upload.remove')}
                        >
                          <X className="w-5 h-5" />
                        </button>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('publishModpack.details.featureTitle')} ({currentLang.toUpperCase()})</label>
                            <input
                              type="text"
                              value={feature.title[currentLang]}
                              onChange={(e) => updateFeature(index, 'title', currentLang, e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                              placeholder={currentLang === 'en' ? 'Feature title' : 'Título de la característica'}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('publishModpack.details.featureIcon')}</label>
                            <input
                              type="text"
                              value={feature.icon}
                              onChange={(e) => updateFeatureIcon(index, e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                              placeholder="e.g. fa-star"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('publishModpack.details.featureDescription')} ({currentLang.toUpperCase()})</label>
                            <textarea
                              value={feature.description[currentLang]}
                              onChange={(e) => updateFeature(index, 'description', currentLang, e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-20"
                              placeholder={currentLang === 'en' ? 'Feature description' : 'Descripción de la característica'}
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
        {
          ((userRole !== 'admin' && userRole !== 'partner' && currentStep === 4) ||
            ((userRole === 'admin' || userRole === 'partner') && currentStep === 5)) && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
                <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">
                  {t('publishModpack.steps.media')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                      {t('publishModpack.media.logo')} <span className="text-red-500">*</span>
                    </label>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingLogo(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setIsDraggingLogo(false); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingLogo(false);
                        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                        if (files.length > 0) {
                          setLogoFile(files[0]);
                        }
                      }}
                      className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer relative group h-48 flex flex-col items-center justify-center ${isDraggingLogo
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                    >
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
                            alt={t('publishModpack.media.logoPreview')}
                            className="w-24 h-24 object-contain mb-2 rounded-lg"
                          />
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-full px-2">{logoFile.name}</p>
                          <p className="text-xs text-gray-500">{(logoFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      ) : (
                        <div className="py-2">
                          <ImageIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-600 dark:text-gray-400">{t('publishModpack.media.logoUpload')}</p>
                          <p className="text-xs text-gray-500 mt-1">{t('publishModpack.media.logoSize')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                      {t('publishModpack.media.banner')} <span className="text-red-500">*</span>
                    </label>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingBanner(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setIsDraggingBanner(false); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingBanner(false);
                        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                        if (files.length > 0) {
                          setBannerFile(files[0]);
                        }
                      }}
                      className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer relative group h-48 flex flex-col items-center justify-center ${isDraggingBanner
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                    >
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
                            alt={t('publishModpack.media.bannerPreview')}
                            className="w-full h-24 object-cover mb-2 rounded-lg"
                          />
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-full px-2">{bannerFile.name}</p>
                          <p className="text-xs text-gray-500">{(bannerFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      ) : (
                        <div className="py-2">
                          <ImageIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-600 dark:text-gray-400">{t('publishModpack.media.bannerUpload')}</p>
                          <p className="text-xs text-gray-500 mt-1">{t('publishModpack.media.bannerSize')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                    {t('publishModpack.media.screenshots')} {t('publishModpack.media.screenshotsOptional')}
                  </label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingScreenshots(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDraggingScreenshots(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingScreenshots(false);
                      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                      if (files.length > 0) {
                        setScreenshotFiles(prev => [...prev, ...files].slice(0, 6));
                      }
                    }}
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer relative ${isDraggingScreenshots
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const newFiles = Array.from(e.target.files || []);
                        setScreenshotFiles(prev => [...prev, ...newFiles].slice(0, 6));
                        e.target.value = '';
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={screenshotFiles.length >= 6}
                    />
                    <div className="py-4">
                      <ImageIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {screenshotFiles.length >= 6 ? t('publishModpack.media.screenshotMax') : t('publishModpack.media.screenshotUpload')}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{t('publishModpack.media.screenshotHelper')}</p>
                    </div>
                  </div>
                  {screenshotFiles.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                      {screenshotFiles.map((file, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={URL.createObjectURL(file)}
                            alt={t('modpacks.screenshots') + ` ${index + 1}`}
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
          )}

        {/* Step 5: Review */}
        {
          ((userRole !== 'admin' && userRole !== 'partner' && currentStep === 5) ||
            ((userRole === 'admin' || userRole === 'partner') && currentStep === 6)) && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md animate-fade-in">
              <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">
                {t('publishModpack.steps.review')}
              </h2>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('publishModpack.review.basicInfo')}</h3>
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
                      <p><span className="font-medium">{t('publishModpack.review.labels.name')}</span> {formData.name[currentLang]}</p>
                      <p><span className="font-medium">{t('publishModpack.review.labels.version')}</span> {formData.version}</p>
                      <p><span className="font-medium">{t('publishModpack.review.labels.minecraft')}</span> {formData.minecraftVersion}</p>
                      <p><span className="font-medium">{t('publishModpack.review.labels.modloader')}</span> {formData.modloader} {formData.modloaderVersion}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('publishModpack.review.files')}</h3>
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
                      <p className="flex items-center gap-2">
                        <FileArchive className="w-4 h-4" />
                        {zipFile?.name || t('publishModpack.review.noZip')}
                      </p>
                      <p className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        {t('publishModpack.review.labels.logo')} {logoFile ? t('publishModpack.review.values.uploaded') : t('publishModpack.review.values.none')}
                      </p>
                      <p className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        {t('publishModpack.review.labels.banner')} {bannerFile ? t('publishModpack.review.values.uploaded') : t('publishModpack.review.values.none')}
                      </p>
                      <p className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        {t('publishModpack.review.labels.screenshots')} {screenshotFiles.length}
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('publishModpack.review.description')}</h3>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <p className="line-clamp-3 text-gray-600 dark:text-gray-300">{formData.description[currentLang] || t('publishModpack.review.noDescription')}</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('publishModpack.review.features')}</h3>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    {formData.features.length > 0 ? (
                      <ul className="list-disc list-inside">
                        {formData.features.map((f, i) => (
                          <li key={i}>
                            <span className="font-medium">{f.title[currentLang]}</span>
                            {f.title[currentLang !== 'en' ? 'en' : 'es'] && <span className="text-gray-500 text-sm ml-2">({f.title[currentLang !== 'en' ? 'en' : 'es']})</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-500 italic">{t('publishModpack.review.noFeatures')}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        <div className="flex justify-between pt-6 border-t border-gray-200 dark:border-gray-700 mt-8">
          <button
            type="button"
            onClick={currentStep === 1 ? handleClose : prevStep}
            className="px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors flex items-center gap-2"
            disabled={isUploading}
          >
            {currentStep === 1 ? t('publishModpack.buttons.cancel') : (
              <>
                <ChevronLeft className="w-4 h-4" />
                {t('publishModpack.buttons.back')}
              </>
            )}
          </button>
          {currentStep < effectiveSteps.length ? (
            <button
              type="button"
              onClick={nextStep}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center gap-2"
            >
              {t('publishModpack.buttons.nextStep')}
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
                  {t('publishModpack.buttons.publishProgress', { progress: Math.round(uploadProgress) })}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {t('publishModpack.buttons.publish')}
                </>
              )}
            </button>
          )}
        </div>
      </form>

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
              if (uploadedFiles && uploadedFiles.size > 0) {
                setPendingUploadedFiles(uploadedFiles);
                setShowDownloadDialog(true);
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
        isOpen={showDownloadDialog && !isDownloadingZip}
        onClose={() => {
          setShowDownloadDialog(false);
          handleSkipDownload();
        }}
        onConfirm={() => {
          setShowDownloadDialog(false);
          handleSkipDownload();
        }}
        onCancel={async () => {
          setShowDownloadDialog(false);
          await handleDownloadUpdatedZip();
        }}
        title={t('publishModpack.dialogs.downloadTitle')}
        message={t('publishModpack.dialogs.downloadMessage', { count: pendingUploadedFiles?.size || 0 })}
        confirmText={t('publishModpack.dialogs.skipButton')}
        cancelText={t('publishModpack.dialogs.downloadButton')}
        variant="info"
      />

      {/* Downloading ZIP Modal - Blocking */}
      {
        isDownloadingZip && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-8 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent"></div>
                <h2 className="text-xl font-semibold text-white">
                  {t('publishModpack.dialogs.downloadingTitle')}
                </h2>
                <p className="text-gray-400 text-sm">
                  {t('publishModpack.dialogs.downloadingMessage')}
                </p>

                {/* Progress Bar */}
                <div className="w-full mt-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-medium text-gray-300">{downloadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>

                <p className="text-xs text-gray-500 mt-3">
                  {t('publishModpack.dialogs.downloadingNote')}
                </p>
              </div>
            </div>
          </div>,
          document.body
        )
      }

    </div>
  );
}

export default PublishModpackForm;
