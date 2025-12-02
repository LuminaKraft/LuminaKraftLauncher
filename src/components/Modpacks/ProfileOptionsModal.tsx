import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, HardDrive } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { useLauncher } from '../../contexts/LauncherContext';

interface ProfileOptionsModalProps {
  modpackId: string;
  modpackName: string;
  isOpen: boolean;
  onClose: () => void;
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
  metadata
}) => {
  const { t } = useTranslation();
  const { userSettings } = useLauncher();

  const [ramMode, setRamMode] = useState<'curseforge' | 'recommended' | 'custom' | 'global'>(
    (metadata?.ramAllocation as 'curseforge' | 'recommended' | 'custom' | 'global') || 'recommended'
  );
  const [customRamValue, setCustomRamValue] = useState<number>(
    metadata?.customRam || metadata?.recommendedRam || userSettings.allocatedRam * 1024 || 4096
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (metadata) {
      setRamMode((metadata.ramAllocation as 'curseforge' | 'recommended' | 'custom' | 'global') || 'recommended');
      setCustomRamValue(metadata.customRam || metadata.recommendedRam || userSettings.allocatedRam * 1024 || 4096);
    }
  }, [metadata, userSettings.allocatedRam]);

  if (!isOpen) return null;

  // RAM values based on mode
  const getEffectiveRam = (): number => {
    switch (ramMode) {
      case 'curseforge':
        // CurseForge default: 4096MB (4GB)
        return 4096;
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

  const MIN_RAM = 512; // 512MB minimum
  const MAX_RAM = 32768; // 32GB maximum

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-lg p-6 max-w-2xl w-full mx-4 border border-dark-600">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Profile Options</h2>
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
            Name
          </label>
          <input
            type="text"
            value={modpackName}
            disabled
            className="input-field w-full bg-dark-700 cursor-not-allowed opacity-70"
          />
        </div>

        {/* Memory Settings */}
        <div className="mb-6">
          <div className="flex items-center space-x-3 mb-4">
            <HardDrive className="w-5 h-5 text-lumina-500" />
            <h3 className="text-white text-lg font-semibold">Memory Settings</h3>
          </div>

          <div className="space-y-3">
            {/* CurseForge Settings Option */}
            <label className="flex items-start space-x-3 p-4 rounded-lg border border-dark-600 hover:border-lumina-500/50 transition-colors cursor-pointer">
              <input
                type="radio"
                name="ramMode"
                value="curseforge"
                checked={ramMode === 'curseforge'}
                onChange={(e) => setRamMode(e.target.value as 'curseforge')}
                className="mt-1 w-4 h-4 text-lumina-600 bg-dark-700 border-dark-600 focus:ring-lumina-500 focus:ring-2"
              />
              <div className="flex-1">
                <div className="text-white font-medium">CurseForge Settings - 4096MB</div>
                <div className="text-dark-300 text-sm">Use CurseForge default memory allocation</div>
              </div>
            </label>

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
                  Recommended by Author - {metadata?.recommendedRam || userSettings.allocatedRam * 1024}MB
                  {ramMode === 'recommended' && <span className="text-lumina-400 ml-2">(Default)</span>}
                </div>
                <div className="text-dark-300 text-sm">
                  {metadata?.recommendedRam
                    ? 'Use the memory allocation recommended by the modpack author'
                    : 'Use global memory allocation (no specific recommendation from author)'}
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
                  Global Settings - {userSettings.allocatedRam * 1024}MB
                </div>
                <div className="text-dark-300 text-sm">Use your global memory allocation from settings</div>
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
                  <div className="text-white font-medium mb-3">Custom RAM Allocation</div>

                  {/* Custom RAM Slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-dark-300 text-sm">Memory:</span>
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
              <span className="text-dark-300 text-sm">Effective Memory Allocation:</span>
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
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn-primary inline-flex items-center"
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              'Done'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileOptionsModal;
