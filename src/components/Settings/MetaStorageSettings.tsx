import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatBytes } from '../../utils/formatBytes';

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
  const [isLoading, setIsLoading] = useState(false);
  const [storageInfo, setStorageInfo] = useState<MetaStorageInfo | null>(null);

  const loadStorageInfo = async () => {
    try {
      const info = await invoke<string>('get_meta_storage_info');
      setStorageInfo(JSON.parse(info));
    } catch (error) {
      console.error('Failed to load meta storage info:', error);
      toast.error(t('errors.failedToLoadStorageInfo'));
    }
  };

  React.useEffect(() => {
    loadStorageInfo();
  }, []);

  const handleCleanup = async () => {
    setIsLoading(true);
    try {
      const cleanedItems = await invoke<string[]>('cleanup_meta_storage');
      toast.success(t('metaStorage.cleanupSuccess', { count: cleanedItems.length }));
      loadStorageInfo();
    } catch (error) {
      console.error('Failed to cleanup meta storage:', error);
      toast.error(t('errors.failedToCleanupStorage'));
    } finally {
      setIsLoading(false);
    }
  };

  if (!storageInfo) {
    return <div className="animate-pulse">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <span className="text-gray-400 text-sm mb-1">{t('metaStorage.totalSize')}</span>
          <span className="text-xl font-semibold">{formatBytes(storageInfo.total_size)}</span>
        </div>
        
        <div className="flex flex-col">
          <span className="text-gray-400 text-sm mb-1">{t('metaStorage.resourceCounts')}</span>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">{t('metaStorage.minecraftVersions')}:</span>
              <span className="font-medium">{storageInfo.minecraft_versions_count}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-300">{t('metaStorage.javaInstallations')}:</span>
              <span className="font-medium">{storageInfo.java_installations_count}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={handleCleanup}
          disabled={isLoading}
          className="btn btn-red flex items-center space-x-2"
        >
          <Trash2 className="w-4 h-4" />
          <span>{isLoading ? t('common.loading') : t('metaStorage.cleanup')}</span>
        </button>
      </div>
    </div>
  );
};

export default MetaStorageSettings;