import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { formatBytes } from '../../utils/formatBytes';
// Removed useLauncher; Java overrides not stored in settings.

interface MetaStorageInfo {
  total_size: number;
  cache_size: number;
  icons_size: number;
  screenshots_size: number;
  meta_path: string;
  minecraft_versions_count: number;
  java_installations_count: number;
}

const MetaStorageSettings: React.FC = () => {
  const { t } = useTranslation();
  const [storageInfo, setStorageInfo] = useState<MetaStorageInfo | null>(null);
  const [minecraftVersions, setMinecraftVersions] = useState<string[] | null>(null);
  const [showMinecraft, setShowMinecraft] = useState(false);

  const loadStorageInfo = async () => {
    try {
      const info = await invoke<string>('get_meta_storage_info');
      setStorageInfo(JSON.parse(info));
      // No explicit Java detection; Lyceris downloads runtimes on demand.
    } catch (error) {
      console.error('Failed to load meta storage info:', error);
      toast.error(t('errors.failedToLoadStorageInfo'));
    }
  };

  const toggleMinecraft = async () => {
    if (!showMinecraft && minecraftVersions === null) {
      const list = await invoke<string[]>('list_minecraft_versions');
      setMinecraftVersions(list);
    }
    setShowMinecraft(!showMinecraft);
  };

  React.useEffect(() => {
    loadStorageInfo();
  }, []);

  if (!storageInfo) {
    return <div className="animate-pulse">Loading...</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Total size */}
      <div className="p-4 bg-dark-700 rounded-lg">
        <p className="text-dark-300 text-sm font-medium mb-1">{t('metaStorage.totalSize')}</p>
        <p className="text-white text-lg font-semibold">{formatBytes(storageInfo.total_size)}</p>
      </div>

      {/* Cache size */}
      <div className="p-4 bg-dark-700 rounded-lg">
        <p className="text-dark-300 text-sm font-medium mb-1">{t('metaStorage.cacheSize')}</p>
        <p className="text-white text-lg font-semibold">{formatBytes(storageInfo.cache_size)}</p>
      </div>

      {/* Minecraft versions */}
      <div className="p-4 bg-dark-700 rounded-lg cursor-pointer" onClick={toggleMinecraft}>
        <p className="text-dark-300 text-sm font-medium mb-1 flex justify-between items-center">
          {t('metaStorage.minecraftVersions')}
          <span className="text-dark-400 text-xs">{showMinecraft ? '▲' : '▼'}</span>
        </p>
        <p className="text-white text-lg font-semibold mb-2">{storageInfo.minecraft_versions_count}</p>
        {showMinecraft && (
          <ul className="text-xs text-dark-300 max-h-48 overflow-auto space-y-1 list-disc ml-4">
            {(minecraftVersions ?? []).map(v => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MetaStorageSettings;