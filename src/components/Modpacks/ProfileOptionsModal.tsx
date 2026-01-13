import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, HardDrive, AlertTriangle, Wrench, RefreshCcw, Shield, ShieldOff, ChevronDown, ChevronUp } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import toast from 'react-hot-toast';
import { useLauncher } from '../../contexts/LauncherContext';

interface ProfileOptionsModalProps {
  modpackId: string;
  modpackName: string;
  isOpen: boolean;
  onClose: () => void;
  isLocalModpack?: boolean; // True if imported locally, not from server
  onSaveComplete?: () => void; // Called after successful save to refresh parent data
  onModpackUpdated?: (updates: { name?: string; logo?: string; backgroundImage?: string }) => void; // Called to update parent state
  metadata?: {
    recommendedRam?: number;
    ramAllocation?: string;
    customRam?: number;
    allow_custom_mods?: boolean;
    allow_custom_resourcepacks?: boolean;
    allow_custom_configs?: boolean;
    category?: string;
  };
}

const ProfileOptionsModal: React.FC<ProfileOptionsModalProps> = ({
  modpackId,
  modpackName,
  isOpen,
  onClose,
  isLocalModpack = false,
  onSaveComplete,
  onModpackUpdated,
  metadata
}) => {
  const { t } = useTranslation();
  const { userSettings, repairModpack, reinstallModpack } = useLauncher();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const appDataDirRef = useRef<string | null>(null);

  const [displayName, setDisplayName] = useState(modpackName);
  const [ramMode, setRamMode] = useState<'recommended' | 'custom' | 'global'>(() => {
    const rawMode = metadata?.ramAllocation as 'recommended' | 'custom' | 'global';
    if (rawMode === 'recommended' && !metadata?.recommendedRam) return 'global';
    return rawMode || (metadata?.recommendedRam ? 'recommended' : 'global');
  });
  const [customRamValue, setCustomRamValue] = useState<number>(
    metadata?.customRam || userSettings.allocatedRam || 4096
  );
  const [isSaving, setIsSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [selectedBannerFile, setSelectedBannerFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const [systemRamMB, setSystemRamMB] = useState<number>(8192); // Default fallback
  const [maxAllocatableRam, setMaxAllocatableRam] = useState<number>(32768);

  // Repair and reinstall confirmation state
  const [showRepairConfirm, setShowRepairConfirm] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [showReinstallConfirm, setShowReinstallConfirm] = useState(false);
  const [isReinstalling, setIsReinstalling] = useState(false);

  // Protection Mode State
  const [allowCustomMods, setAllowCustomMods] = useState(metadata?.allow_custom_mods ?? true);
  const [allowCustomResourcepacks, setAllowCustomResourcepacks] = useState(metadata?.allow_custom_resourcepacks ?? true);
  const [allowCustomConfigs, setAllowCustomConfigs] = useState(metadata?.allow_custom_configs ?? true);
  const [showAdvancedProtection, setShowAdvancedProtection] = useState(false);

  // Derived state for protection mode
  const isProtected = !allowCustomMods && !allowCustomResourcepacks && !allowCustomConfigs;
  const isFullyOpen = allowCustomMods && allowCustomResourcepacks && allowCustomConfigs;
  const isCustomMode = !isProtected && !isFullyOpen;

  // Load system memory and cached images when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const initData = async () => {
      try {
        // Get system memory
        const totalBytes = await invoke<number>('get_system_memory');
        const totalMB = Math.floor(totalBytes / 1024 / 1024);
        setSystemRamMB(totalMB);
        setMaxAllocatableRam(totalMB); // Allow allocating up to total RAM (or maybe slightly less?)

        if (!appDataDirRef.current) {
          const appData = await appDataDir();
          appDataDirRef.current = appData.endsWith('/') ? appData.slice(0, -1) : appData;
        }

        if (isLocalModpack) {
          // Get cached modpack data to find correct image paths
          const cachedData = await invoke<string | null>('get_cached_modpack_data', { modpackId });
          if (cachedData) {
            const cache = JSON.parse(cachedData);

            // Load logo if path exists in cache
            if (cache.logo) {
              try {
                const fullLogoPath = `${appDataDirRef.current}/${cache.logo}`;
                const logo = await invoke<string>('get_file_as_data_url', { filePath: fullLogoPath });
                setLogoUrl(logo);
              } catch {
                setLogoUrl(null);
              }
            }

            // Load banner if path exists in cache
            if (cache.backgroundImage) {
              try {
                const fullBannerPath = `${appDataDirRef.current}/${cache.backgroundImage}`;
                const banner = await invoke<string>('get_file_as_data_url', { filePath: fullBannerPath });
                setBannerUrl(banner);
              } catch {
                setBannerUrl(null);
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to init modal data:', error);
      }
    };

    initData();
  }, [isOpen, isLocalModpack, modpackId]);

  useEffect(() => {
    setDisplayName(modpackName);
  }, [modpackName]);

  useEffect(() => {
    if (metadata) {
      const initialMode = (metadata.ramAllocation as 'recommended' | 'custom' | 'global') || (metadata.recommendedRam ? 'recommended' : 'global');
      setRamMode(initialMode === 'recommended' && !metadata.recommendedRam ? 'global' : initialMode);
      setCustomRamValue(metadata.customRam || userSettings.allocatedRam || 4096);

      setAllowCustomMods(metadata.allow_custom_mods ?? true);
      setAllowCustomResourcepacks(metadata.allow_custom_resourcepacks ?? true);
      setAllowCustomConfigs(metadata.allow_custom_configs ?? true);
    }
  }, [metadata, userSettings.allocatedRam]);

  // Force global if recommended is unsafe
  useEffect(() => {
    if (metadata?.recommendedRam && systemRamMB > 0) {
      const recommendedMB = metadata.recommendedRam;
      // Use real system RAM from Rust (MB)
      // Safety threshold: System RAM - 1.5GB (1536MB)
      const safeLimitMB = systemRamMB - 1536;

      if (recommendedMB > safeLimitMB && ramMode === 'recommended') {
        console.warn(`Recommended RAM (${recommendedMB}MB) unsafe for System (${systemRamMB}MB), forcing global`);
        setRamMode('global');
      }
    }
  }, [metadata, ramMode, systemRamMB]);

  // Constants for RAM settings (must be before any conditional returns)
  const MIN_RAM = 512; // 512MB minimum
  const SNAP_RANGE = 256; // Snap to common values if within this range

  // Generate snap points (powers of 2 starting from 1024: 1GB, 2GB, 4GB, 8GB, 16GB, 32GB...)
  const snapPoints = React.useMemo(() => {
    const points: number[] = [];
    let memory = 1024; // Start at 1 GB
    while (memory <= maxAllocatableRam) {
      points.push(memory);
      memory *= 2;
    }
    return points;
  }, [maxAllocatableRam]);

  // Find if value is close to a snap point
  const snapToNearestPoint = React.useCallback((value: number): number => {
    for (const point of snapPoints) {
      if (Math.abs(value - point) <= SNAP_RANGE) {
        return point;
      }
    }
    return value;
  }, [snapPoints]);

  const handleCustomRamSliderChange = React.useCallback((value: number) => {
    // Round to nearest 64 MB step
    const stepped = Math.round(value / 64) * 64;
    // Snap to common values if close
    const snapped = snapToNearestPoint(stepped);
    setCustomRamValue(Math.max(MIN_RAM, Math.min(maxAllocatableRam, snapped)));
  }, [snapToNearestPoint, maxAllocatableRam]);

  if (!isOpen) return null;

  // Generate random ID for image filenames
  const generateImageId = () => Math.random().toString(36).substring(2, 10);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Track what was updated
      const updates: { name?: string; logo?: string; backgroundImage?: string } = {};
      const cacheUpdates: { [key: string]: string } = {};

      // Update name if it changed (for local modpacks only)
      if (isLocalModpack && displayName !== modpackName) {
        // Get existing cache data to preserve logo/backgroundImage
        const cachedData = await invoke<string | null>('get_cached_modpack_data', { modpackId });
        const existingCache = cachedData ? JSON.parse(cachedData) : {};

        // Only save essential user-editable fields
        const essentialMetadata = {
          name: displayName,
          logo: existingCache.logo || '',
          backgroundImage: existingCache.backgroundImage || ''
        };

        await invoke('save_modpack_metadata_json', {
          modpackId,
          modpackJson: JSON.stringify(essentialMetadata)
        });
        updates.name = displayName;
        cacheUpdates.name = displayName;
      }

      // If logo was selected, save it with random ID
      if (isLocalModpack && selectedLogoFile) {
        const logoId = generateImageId();
        const arrayBuffer = await selectedLogoFile.arrayBuffer();
        const bytes = Array.from(new Uint8Array(arrayBuffer));

        await invoke('save_modpack_image', {
          modpackId,
          imageType: 'logo',
          imageData: bytes,
          fileName: `logo_${logoId}.png`
        });

        const logoPath = `meta/modpacks/${modpackId}/images/logo_${logoId}.png`;
        updates.logo = logoPath;
        cacheUpdates.logo = logoPath;
        setSelectedLogoFile(null);
        setLogoPreviewUrl(null);
      }

      // If banner was selected, save it with random ID
      if (isLocalModpack && selectedBannerFile) {
        const bannerId = generateImageId();
        const arrayBuffer = await selectedBannerFile.arrayBuffer();
        const bytes = Array.from(new Uint8Array(arrayBuffer));

        await invoke('save_modpack_image', {
          modpackId,
          imageType: 'banner',
          imageData: bytes,
          fileName: `banner_${bannerId}.jpeg`
        });

        const bannerPath = `meta/modpacks/${modpackId}/images/banner_${bannerId}.jpeg`;
        updates.backgroundImage = bannerPath;
        cacheUpdates.backgroundImage = bannerPath;
        setSelectedBannerFile(null);
        setBannerPreviewUrl(null);
      }

      // Update cache JSON if there are changes
      if (Object.keys(cacheUpdates).length > 0) {
        try {
          await invoke('update_modpack_cache_json', {
            modpackId,
            updates: cacheUpdates
          });
        } catch (error) {
          console.error('Warning: Failed to update cache JSON:', error);
          // Non-fatal error - continue anyway
        }
      }

      // Update RAM settings
      await invoke('update_instance_ram_settings', {
        modpackId,
        ramAllocation: ramMode,
        customRam: ramMode === 'custom' ? customRamValue : null,
        allowCustomMods,
        allowCustomResourcepacks,
        allowCustomConfigs
      });

      toast.success(t('settings.saved'));

      // Notify parent about updates
      if (onModpackUpdated && Object.keys(updates).length > 0) {
        onModpackUpdated(updates);
      }

      // Notify parent to refresh data
      if (onSaveComplete) {
        onSaveComplete();
      }

      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error(t('settings.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = (imageType: 'logo' | 'banner', file: File) => {
    // Create preview URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = e.target?.result as string;
      if (imageType === 'logo') {
        setSelectedLogoFile(file);
        setLogoPreviewUrl(preview);
      } else {
        setSelectedBannerFile(file);
        setBannerPreviewUrl(preview);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-8 overflow-hidden pointer-events-auto">
      <div className="bg-dark-800 rounded-lg p-6 max-w-2xl w-full border border-dark-600 max-h-[90vh] overflow-y-auto pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">{t('profileOptions.title')}</h2>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-white transition-colors"
            disabled={isSaving}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Name Section - Only for local modpacks */}
        {isLocalModpack && (
          <div className="mb-6">
            <label className="block text-dark-300 text-sm font-medium mb-2">
              {t('profileOptions.name')} {!editingName && <span className="text-xs text-lumina-400">(Click para editar)</span>}
            </label>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input-field w-full flex-1"
                  autoFocus
                />
                <button
                  onClick={() => setEditingName(false)}
                  className="px-3 py-2 bg-lumina-600 hover:bg-lumina-700 text-white rounded-lg text-sm transition-colors"
                >
                  {t('app.confirm')}
                </button>
              </div>
            ) : (
              <div
                onClick={() => setEditingName(true)}
                className="input-field w-full transition-colors cursor-pointer hover:border-lumina-400/50 bg-dark-700 hover:bg-dark-600 p-2"
              >
                <span className="text-white">{displayName}</span>
              </div>
            )}
          </div>
        )}

        {/* Image Settings for Local Modpacks */}
        {isLocalModpack && (
          <div className="mb-6">
            <label className="block text-dark-300 text-sm font-medium mb-3">
              {t('profileOptions.images', 'Imágenes personalizadas')}
            </label>
            <div className="flex items-center gap-4">
              {/* Logo */}
              <div
                className="relative w-16 h-16 rounded-lg bg-dark-700 flex-shrink-0 cursor-pointer overflow-hidden hover-group"
                onClick={() => logoInputRef.current?.click()}
              >
                {logoPreviewUrl ? (
                  <img src={logoPreviewUrl} alt="Logo Preview" className="w-full h-full object-cover" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs font-medium">Cambiar</span>
                </div>
              </div>

              {/* Banner */}
              <div
                className="relative flex-1 h-16 rounded-lg bg-dark-700 cursor-pointer overflow-hidden hover-group"
                onClick={() => bannerInputRef.current?.click()}
              >
                {bannerPreviewUrl ? (
                  <img src={bannerPreviewUrl} alt="Banner Preview" className="w-full h-full object-cover" />
                ) : bannerUrl ? (
                  <img src={bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-purple-500 to-pink-600"></div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs font-medium">Cambiar</span>
                </div>
              </div>

              {/* Hidden inputs */}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload('logo', file);
                }}
              />
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload('banner', file);
                }}
              />
            </div>
          </div>
        )}

        {/* Protection Mode Section (Official/Partner only) */}
        {!isLocalModpack && metadata?.category && (metadata.category === 'official' || metadata.category === 'partner' || metadata.category === 'community') && (
          <div className="mb-6">
            <div className="flex items-center space-x-3 mb-4">
              <Shield className="w-5 h-5 text-lumina-500" />
              <h3 className="text-white text-lg font-semibold">{t('profileOptions.stability.title')}</h3>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Protected (Recommended) */}
              <button
                type="button"
                onClick={() => {
                  setAllowCustomMods(false);
                  setAllowCustomResourcepacks(false);
                  setAllowCustomConfigs(false);
                }}
                className={`flex flex-col items-start p-4 rounded-lg border transition-all text-left group ${isProtected
                    ? 'border-lumina-500 bg-lumina-500/10'
                    : 'border-dark-600 hover:border-lumina-500/50 bg-dark-700/50'
                  }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Shield className={`w-4 h-4 ${isProtected ? 'text-lumina-400' : 'text-dark-400'}`} />
                  <span className={`font-semibold ${isProtected ? 'text-white' : 'text-dark-300'}`}>
                    {t('profileOptions.stability.protected')}
                  </span>
                </div>
                <p className="text-xs text-dark-400 leading-relaxed">
                  {t('profileOptions.stability.protectedDesc')}
                </p>
              </button>

              {/* Open */}
              <button
                type="button"
                onClick={() => {
                  setAllowCustomMods(true);
                  setAllowCustomResourcepacks(true);
                  setAllowCustomConfigs(true);
                }}
                className={`flex flex-col items-start p-4 rounded-lg border transition-all text-left group ${isFullyOpen
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-dark-600 hover:border-emerald-500/50 bg-dark-700/50'
                  }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <ShieldOff className={`w-4 h-4 ${isFullyOpen ? 'text-emerald-400' : 'text-dark-400'}`} />
                  <span className={`font-semibold ${isFullyOpen ? 'text-white' : 'text-dark-300'}`}>
                    {t('profileOptions.stability.open')}
                  </span>
                </div>
                <p className="text-xs text-dark-400 leading-relaxed">
                  {t('profileOptions.stability.openDesc')}
                </p>
              </button>
            </div>

            {/* Advanced Toggle */}
            <div className="border-t border-dark-600 pt-3">
              <button
                type="button"
                onClick={() => setShowAdvancedProtection(!showAdvancedProtection)}
                className="flex items-center justify-between w-full text-dark-400 hover:text-white transition-colors text-sm"
              >
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  {t('profileOptions.stability.advancedMode')}
                  {isCustomMode && <span className="text-lumina-400 text-[10px] uppercase font-bold px-1.5 py-0.5 bg-lumina-500/10 rounded ml-2">Custom</span>}
                </span>
                {showAdvancedProtection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showAdvancedProtection && (
                <div className="mt-4 space-y-3 bg-dark-900/40 p-4 rounded-lg border border-dark-700/50">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-dark-500 border-b border-dark-700">
                        <th className="text-left font-medium pb-2">{t('profileOptions.stability.foldersTable.folder')}</th>
                        <th className="text-right font-medium pb-2">{t('profileOptions.stability.foldersTable.status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-700/50">
                      <tr>
                        <td className="py-2.5 text-white">/mods</td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setAllowCustomMods(!allowCustomMods)}
                            className={`text-xs px-2 py-1 rounded transition-colors ${!allowCustomMods ? 'bg-lumina-500/20 text-lumina-400' : 'bg-dark-700 text-dark-400'
                              }`}
                          >
                            {!allowCustomMods ? t('profileOptions.stability.protected') : t('profileOptions.stability.foldersTable.unprotected')}
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-white">/resourcepacks</td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setAllowCustomResourcepacks(!allowCustomResourcepacks)}
                            className={`text-xs px-2 py-1 rounded transition-colors ${!allowCustomResourcepacks ? 'bg-lumina-500/20 text-lumina-400' : 'bg-dark-700 text-dark-400'
                              }`}
                          >
                            {!allowCustomResourcepacks ? t('profileOptions.stability.protected') : t('profileOptions.stability.foldersTable.unprotected')}
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-white">/config & /scripts</td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setAllowCustomConfigs(!allowCustomConfigs)}
                            className={`text-xs px-2 py-1 rounded transition-colors ${!allowCustomConfigs ? 'bg-lumina-500/20 text-lumina-400' : 'bg-dark-700 text-dark-400'
                              }`}
                          >
                            {!allowCustomConfigs ? t('profileOptions.stability.protected') : t('profileOptions.stability.foldersTable.unprotected')}
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-white">/shaderpacks & others</td>
                        <td className="py-2.5 text-right text-emerald-500/60 italic text-[11px]">
                          {t('profileOptions.stability.foldersTable.unprotected')}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-[10px] text-dark-500 mt-2 italic">
                    * Shaders, screenshots and aesthetic mods are never restricted.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Memory Settings */}
        <div className="mb-6">
          <div className="flex items-center space-x-3 mb-4">
            <HardDrive className="w-5 h-5 text-lumina-500" />
            <h3 className="text-white text-lg font-semibold">{t('profileOptions.memorySettings')}</h3>
          </div>

          <div className="space-y-3">
            {/* Recommended by Author Option - Only shown if author provided a recommendation */}
            {(() => {
              if (!metadata?.recommendedRam) return null;

              // Calculate safety using real system memory
              const recommendedMB = metadata.recommendedRam;
              const safeLimitMB = systemRamMB - 1536; // Buffer 1.5GB
              const isUnsafe = recommendedMB > safeLimitMB;

              return (
                <label className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors ${isUnsafe
                  ? 'border-red-900/50 bg-red-900/10 opacity-75 cursor-not-allowed'
                  : 'border-dark-600 hover:border-lumina-500/50 cursor-pointer'
                  }`}>
                  <input
                    type="radio"
                    name="ramMode"
                    value="recommended"
                    checked={ramMode === 'recommended'}
                    onChange={(e) => {
                      if (!isUnsafe) setRamMode(e.target.value as 'recommended');
                    }}
                    disabled={isUnsafe}
                    className="mt-1 w-4 h-4 text-lumina-600 bg-dark-700 border-dark-600 focus:ring-lumina-500 focus:ring-2 disabled:opacity-50"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isUnsafe ? 'text-red-400' : 'text-white'}`}>
                        {t('profileOptions.recommendedByAuthor')} - {recommendedMB}MB
                      </span>
                      {ramMode === 'recommended' && !isUnsafe && <span className="text-lumina-400 ml-2">{t('profileOptions.default')}</span>}
                    </div>

                    <div className="text-dark-300 text-sm mt-1">
                      {isUnsafe ? (
                        <span className="text-red-400 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" />
                          {t('profileOptions.unsafeRamWarning', 'Excede memoria segura. Se usará Global.')}
                        </span>
                      ) : (
                        t('profileOptions.recommendedDescription')
                      )}
                    </div>
                  </div>
                </label>
              );
            })()}

            {/* Global Settings Option */}
            <label className="flex items-start space-x-3 p-4 rounded-lg border border-dark-600 hover:border-lumina-500/50 transition-colors cursor-pointer">
              <input
                type="radio"
                name="ramMode"
                value="global"
                checked={ramMode === 'global'}
                onChange={(e) => setRamMode(e.target.value as 'global')}
                className="mt-1 w-4 h-4 text-lumina-600 bg-dark-700 border-dark-600 focus:ring-lumina-500 focus:ring-2"
              />
              <div className="flex-1">
                <div className="text-white font-medium">
                  {t('profileOptions.globalSettings')} - {userSettings.allocatedRam}MB
                </div>
                <div className="text-dark-300 text-sm">{t('profileOptions.globalDescription')}</div>
              </div>
            </label>

            {/* Custom RAM Allocation Option */}
            <div className="p-4 rounded-lg border border-dark-600 hover:border-lumina-500/50 transition-colors">
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="ramMode"
                  value="custom"
                  checked={ramMode === 'custom'}
                  onChange={(e) => setRamMode(e.target.value as 'custom')}
                  className="mt-1 w-4 h-4 text-lumina-600 bg-dark-700 border-dark-600 focus:ring-lumina-500 focus:ring-2"
                />
                <div className="flex-1">
                  <div className="text-white font-medium mb-3">{t('profileOptions.customAllocation')}</div>

                  {/* Custom RAM Slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-dark-300 text-sm">{t('profileOptions.memory')}:</span>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min={MIN_RAM}
                          max={maxAllocatableRam}
                          value={customRamValue}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            if (!isNaN(value)) {
                              setCustomRamValue(Math.max(MIN_RAM, Math.min(maxAllocatableRam, value)));
                            }
                          }}
                          disabled={ramMode !== 'custom'}
                          className="bg-dark-700 border border-dark-600 text-white text-sm rounded px-3 py-1 w-24 text-right disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <span className="text-white text-sm font-medium">MB</span>
                      </div>
                    </div>

                    {/* Snap point markers */}
                    <div className={`relative h-2 mb-1 ${ramMode !== 'custom' ? 'opacity-50' : ''}`}>
                      <div className="absolute inset-0" style={{ marginLeft: '4px', marginRight: '4px' }}>
                        {snapPoints.map((point) => (
                          <div
                            key={point}
                            className={`absolute w-1 h-2 rounded-sm transition-colors ${point <= customRamValue ? 'bg-blue-500' : 'bg-dark-500'
                              }`}
                            style={{
                              left: `${((point - MIN_RAM) / (maxAllocatableRam - MIN_RAM)) * 100}%`,
                              transform: 'translateX(-50%)'
                            }}
                            title={`${point} MB (${(point / 1024).toFixed(0)} GB)`}
                          />
                        ))}
                      </div>
                    </div>

                    <input
                      type="range"
                      min={MIN_RAM}
                      max={maxAllocatableRam}
                      step="64"
                      value={customRamValue}
                      onChange={(e) => handleCustomRamSliderChange(parseInt(e.target.value))}
                      disabled={ramMode !== 'custom'}
                      className="w-full h-2 bg-dark-600 rounded-lg appearance-none cursor-pointer slider disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: ramMode === 'custom'
                          ? `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((customRamValue - MIN_RAM) / (maxAllocatableRam - MIN_RAM)) * 100}%, #374151 ${((customRamValue - MIN_RAM) / (maxAllocatableRam - MIN_RAM)) * 100}%, #374151 100%)`
                          : '#374151'
                      }}
                    />
                    <div className="flex justify-between text-xs text-dark-400">
                      <span>{MIN_RAM} MB</span>
                      <span>{maxAllocatableRam} MB</span>
                    </div>
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Repair Section - Safe action (green) - Only reinstalls Minecraft deps */}
        <div className="mb-6">
          <div className="flex items-center space-x-3 mb-4">
            <Wrench className="w-5 h-5 text-green-500" />
            <h3 className="text-white text-lg font-semibold">{t('profileOptions.repair.title', 'Repair Instance')}</h3>
          </div>

          {!showRepairConfirm ? (
            <button
              onClick={() => setShowRepairConfirm(true)}
              className="w-full px-4 py-3 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30 rounded-lg transition-colors text-left"
              disabled={isRepairing || isSaving}
            >
              <div className="font-medium">{t('profileOptions.repair.button', 'Repair instance...')}</div>
              <div className="text-sm text-green-300/70 mt-1">
                {t('profileOptions.repair.hint', 'Reinstalls Minecraft dependencies and checks for corruption')}
              </div>
            </button>
          ) : (
            <div className="p-4 rounded-lg border border-green-600/50 bg-green-900/20">
              <div className="flex items-start gap-3 mb-4">
                <Wrench className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-white font-medium mb-2">
                    {t('profileOptions.repair.confirmTitle', 'Repair instance?')}
                  </h4>
                  <p className="text-dark-300 text-sm">
                    {t('profileOptions.repair.confirmDescription', 'Repairing reinstalls Minecraft dependencies and checks for corruption. This may resolve issues if your game is not launching due to launcher-related errors, but will not resolve issues or crashes related to installed mods.')}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    setIsRepairing(true);
                    setShowRepairConfirm(false);
                    onClose();
                    await repairModpack(modpackId);
                    setIsRepairing(false);
                  }}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
                  disabled={isRepairing}
                >
                  {isRepairing ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {t('profileOptions.repair.repairing', 'Repairing...')}
                    </div>
                  ) : (
                    t('profileOptions.repair.confirm', 'Repair')
                  )}
                </button>
                <button
                  onClick={() => setShowRepairConfirm(false)}
                  className="px-4 py-2 bg-dark-600 hover:bg-dark-500 text-white rounded-lg transition-colors"
                  disabled={isRepairing}
                >
                  {t('profileOptions.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Reinstall Section */}
        <div className="mb-6">
          <div className="flex items-center space-x-3 mb-4">
            <RefreshCcw className="w-5 h-5 text-red-500" />
            <h3 className="text-white text-lg font-semibold">{t('profileOptions.reinstall.title', 'Reinstall Modpack')}</h3>
          </div>

          {!showReinstallConfirm ? (
            <button
              onClick={() => setShowReinstallConfirm(true)}
              className="w-full px-4 py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 rounded-lg transition-colors text-left"
              disabled={isReinstalling || isSaving || isRepairing}
            >
              <div className="font-medium">{t('profileOptions.reinstall.button', 'Reinstall modpack...')}</div>
              <div className="text-sm text-red-300/70 mt-1">
                {t('profileOptions.reinstall.hint', 'Resets the instance to its original state, removing any mods you have added')}
              </div>
            </button>
          ) : (
            <div className="p-4 rounded-lg border border-red-600/50 bg-red-900/20">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-white font-medium mb-2">
                    {t('profileOptions.reinstall.confirmTitle', 'Are you sure you want to reinstall this instance?')}
                  </h4>
                  <p className="text-dark-300 text-sm">
                    {t('profileOptions.reinstall.confirmDescription', 'Reinstalling will reset all installed or modified content to what is provided by the modpack, removing any mods or content you have added on top of the original installation. This may fix unexpected behavior if changes have been made to the instance, but if your worlds now depend on additional installed content, it may break existing worlds.')}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    setIsReinstalling(true);
                    setShowReinstallConfirm(false);
                    onClose();
                    await reinstallModpack(modpackId);
                    setIsReinstalling(false);
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
                  disabled={isReinstalling}
                >
                  {isReinstalling ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {t('profileOptions.reinstall.reinstalling', 'Reinstalling...')}
                    </div>
                  ) : (
                    t('profileOptions.reinstall.confirm', 'Reinstall modpack')
                  )}
                </button>
                <button
                  onClick={() => setShowReinstallConfirm(false)}
                  className="px-4 py-2 bg-dark-600 hover:bg-dark-500 text-white rounded-lg transition-colors"
                  disabled={isReinstalling}
                >
                  {t('profileOptions.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="btn-secondary"
            disabled={isSaving}
          >
            {t('profileOptions.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="btn-primary inline-flex items-center"
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {t('profileOptions.saving')}
              </>
            ) : (
              t('profileOptions.done')
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileOptionsModal;
