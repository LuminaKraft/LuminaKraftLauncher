import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, HardDrive, Image as ImageIcon } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { useLauncher } from '../../contexts/LauncherContext';

interface ProfileOptionsModalProps {
  modpackId: string;
  modpackName: string;
  isOpen: boolean;
  onClose: () => void;
  isLocalModpack?: boolean; // True if imported locally, not from server
  metadata?: {
    recommendedRam?: number;
    ramAllocation?: string;
    customRam?: number;
  };
}

const ProfileOptionsModal: React.FC<ProfileOptionsModalProps> = ({
  modpackId,
  modpackName,
  isOpen,
  onClose,
  isLocalModpack = false,
  metadata
}) => {
  const { t } = useTranslation();
  const { userSettings } = useLauncher();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(modpackName);
  const [ramMode, setRamMode] = useState<'recommended' | 'custom' | 'global'>(
    (metadata?.ramAllocation as 'recommended' | 'custom' | 'global') || 'recommended'
  );
  const [customRamValue, setCustomRamValue] = useState<number>(
    metadata?.customRam || metadata?.recommendedRam || userSettings.allocatedRam * 1024 || 4096
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [editingName, setEditingName] = useState(false);

  useEffect(() => {
    setDisplayName(modpackName);
  }, [modpackName]);

  useEffect(() => {
    if (metadata) {
      setRamMode((metadata.ramAllocation as 'recommended' | 'custom' | 'global') || 'recommended');
      setCustomRamValue(metadata.customRam || metadata.recommendedRam || userSettings.allocatedRam * 1024 || 4096);
    }
  }, [metadata, userSettings.allocatedRam]);

  if (!isOpen) return null;

  // RAM values based on mode
  const getEffectiveRam = (): number => {
    switch (ramMode) {
      case 'recommended':
        return metadata?.recommendedRam || userSettings.allocatedRam * 1024 || 4096;
      case 'custom':
        return customRamValue;
      case 'global':
        return userSettings.allocatedRam * 1024;
      default:
        return 4096;
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await invoke('update_instance_ram_settings', {
        modpackId,
        ramAllocation: ramMode,
        customRam: ramMode === 'custom' ? customRamValue : null
      });

      toast.success(t('settings.saved'));
      onClose();
    } catch (error) {
      console.error('Failed to update RAM settings:', error);
      toast.error(t('settings.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = async (imageType: 'logo' | 'banner', file: File) => {
    setIsUploadingImage(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));

      await invoke('save_modpack_image', {
        modpackId,
        imageType,
        imageData: bytes,
        fileName: file.name
      });

      const key = imageType === 'logo' ? 'logoUpdated' : 'bannerUpdated';
      toast.success(t(`settings.${key}`));
    } catch (error) {
      console.error(`Failed to upload ${imageType}:`, error);
      const key = imageType === 'logo' ? 'logoUpdateFailed' : 'bannerUpdateFailed';
      toast.error(t(`settings.${key}`));
    } finally {
      setIsUploadingImage(false);
    }
  };

  const MIN_RAM = 512; // 512MB minimum
  const MAX_RAM = 32768; // 32GB maximum

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-8 overflow-y-auto">
      <div className="bg-dark-800 rounded-lg p-6 max-w-2xl w-full my-auto border border-dark-600">
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

        {/* Name Section */}
        <div className="mb-6">
          <label className="block text-dark-300 text-sm font-medium mb-2">
            {t('profileOptions.name')} {isLocalModpack && !editingName && <span className="text-xs text-lumina-400">(Click para editar)</span>}
          </label>
          {editingName && isLocalModpack ? (
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
            <input
              type="text"
              value={displayName}
              disabled
              onClick={() => isLocalModpack && setEditingName(true)}
              className={`input-field w-full ${isLocalModpack ? 'cursor-pointer hover:border-lumina-400/50 bg-dark-700 hover:bg-dark-600' : 'cursor-not-allowed bg-dark-700'} opacity-${isLocalModpack ? 100 : 70} transition-colors`}
            />
          )}
        </div>

        {/* Image Settings for Local Modpacks */}
        {isLocalModpack && (
          <div className="mb-6">
            <div className="flex items-center space-x-3 mb-4">
              <ImageIcon className="w-5 h-5 text-lumina-500" />
              <h3 className="text-white text-lg font-semibold">Personalización de imagen</h3>
            </div>

            <div className="space-y-4">
              {/* Logo Upload with Preview */}
              <div className="p-4 rounded-lg border border-dark-600 hover:border-lumina-500/50 transition-colors">
                <label className="block text-dark-300 text-sm font-medium mb-3">Logo</label>
                <div className="flex items-center space-x-4">
                  {/* Logo Preview */}
                  <div
                    className="relative w-20 h-20 rounded-lg bg-dark-700 flex items-center justify-center flex-shrink-0 group cursor-pointer"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {/* Logo Display */}
                    <div className="w-full h-full rounded-lg overflow-hidden flex items-center justify-center">
                      {/* Placeholder or actual content would go here */}
                      <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    </div>

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-medium">Cambiar</span>
                    </div>
                  </div>

                  {/* Upload Controls */}
                  <div className="flex-1">
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      disabled={isUploadingImage}
                      className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors font-medium"
                    >
                      {isUploadingImage ? 'Subiendo...' : 'Cambiar logo'}
                    </button>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleImageUpload('logo', file);
                        }
                      }}
                    />
                    <p className="text-dark-400 text-xs mt-2">PNG, JPG, GIF (Recomendado: 512x512px)</p>
                  </div>
                </div>
              </div>

              {/* Banner Upload */}
              <div className="p-4 rounded-lg border border-dark-600 hover:border-lumina-500/50 transition-colors">
                <label className="block text-dark-300 text-sm font-medium mb-3">Banner</label>
                <div className="flex items-center space-x-4">
                  {/* Banner Preview */}
                  <div
                    className="relative w-32 h-20 rounded-lg bg-dark-700 flex-shrink-0 group cursor-pointer overflow-hidden"
                    onClick={() => bannerInputRef.current?.click()}
                  >
                    {/* Banner Display */}
                    <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-600"></div>

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-medium">Cambiar</span>
                    </div>
                  </div>

                  {/* Upload Controls */}
                  <div className="flex-1">
                    <button
                      onClick={() => bannerInputRef.current?.click()}
                      disabled={isUploadingImage}
                      className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors font-medium"
                    >
                      {isUploadingImage ? 'Subiendo...' : 'Cambiar banner'}
                    </button>
                    <input
                      ref={bannerInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleImageUpload('banner', file);
                        }
                      }}
                    />
                    <p className="text-dark-400 text-xs mt-2">PNG, JPG (Recomendado: 1920x480px)</p>
                  </div>
                </div>
              </div>
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
            {/* Recommended by Author Option */}
            <label className="flex items-start space-x-3 p-4 rounded-lg border border-dark-600 hover:border-lumina-500/50 transition-colors cursor-pointer">
              <input
                type="radio"
                name="ramMode"
                value="recommended"
                checked={ramMode === 'recommended'}
                onChange={(e) => setRamMode(e.target.value as 'recommended')}
                className="mt-1 w-4 h-4 text-lumina-600 bg-dark-700 border-dark-600 focus:ring-lumina-500 focus:ring-2"
              />
              <div className="flex-1">
                <div className="text-white font-medium">
                  {t('profileOptions.recommendedByAuthor')} - {metadata?.recommendedRam || userSettings.allocatedRam * 1024}MB
                  {ramMode === 'recommended' && <span className="text-lumina-400 ml-2">{t('profileOptions.default')}</span>}
                </div>
                <div className="text-dark-300 text-sm">
                  {metadata?.recommendedRam
                    ? t('profileOptions.recommendedDescription')
                    : t('profileOptions.globalFallback')}
                </div>
              </div>
            </label>

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
                  {t('profileOptions.globalSettings')} - {userSettings.allocatedRam * 1024}MB
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
                          max={MAX_RAM}
                          value={customRamValue}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            if (!isNaN(value)) {
                              setCustomRamValue(Math.max(MIN_RAM, Math.min(MAX_RAM, value)));
                            }
                          }}
                          disabled={ramMode !== 'custom'}
                          className="bg-dark-700 border border-dark-600 text-white text-sm rounded px-3 py-1 w-24 text-right disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <span className="text-white text-sm font-medium">MB</span>
                      </div>
                    </div>

                    <input
                      type="range"
                      min={MIN_RAM}
                      max={MAX_RAM}
                      step="256"
                      value={customRamValue}
                      onChange={(e) => setCustomRamValue(parseInt(e.target.value))}
                      disabled={ramMode !== 'custom'}
                      className="w-full h-2 bg-dark-600 rounded-lg appearance-none cursor-pointer slider disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: ramMode === 'custom'
                          ? `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((customRamValue - MIN_RAM) / (MAX_RAM - MIN_RAM)) * 100}%, #374151 ${((customRamValue - MIN_RAM) / (MAX_RAM - MIN_RAM)) * 100}%, #374151 100%)`
                          : '#374151'
                      }}
                    />
                    <div className="flex justify-between text-xs text-dark-400">
                      <span>{MIN_RAM} MB</span>
                      <span>{MAX_RAM} MB</span>
                    </div>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Current Allocation Display */}
          <div className="mt-4 p-3 bg-dark-700 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-dark-300 text-sm">{t('profileOptions.effectiveAllocation')}</span>
              <span className="text-lumina-400 font-semibold">{getEffectiveRam()} MB ({(getEffectiveRam() / 1024).toFixed(1)} GB)</span>
            </div>
          </div>
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
