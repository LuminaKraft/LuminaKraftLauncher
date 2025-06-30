import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { formatBytes } from '../../utils/formatBytes';
import { useLauncher } from '../../contexts/LauncherContext';

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
  const [systemJavaPath, setSystemJavaPath] = useState<string | null>(null);
  const [minecraftVersions, setMinecraftVersions] = useState<string[] | null>(null);
  const [javaInstallations, setJavaInstallations] = useState<string[] | null>(null);
  const [showMinecraft, setShowMinecraft] = useState(false);
  const [showJava, setShowJava] = useState(false);
  const { userSettings } = useLauncher();
  const userJavaPath = userSettings.javaPath?.trim() || null;

  const loadStorageInfo = async () => {
    try {
      const info = await invoke<string>('get_meta_storage_info');
      setStorageInfo(JSON.parse(info));
      // Also detect system Java path
      try {
        const detected = await invoke<string | null>('detect_system_java_path');
        setSystemJavaPath(detected ?? null);
      } catch (e) {
        console.warn('System Java detection failed:', e);
      }
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

  const toggleJava = async () => {
    if (!showJava && javaInstallations === null) {
      const list = await invoke<string[]>('list_java_installations');
      setJavaInstallations(list);
    }
    setShowJava(!showJava);
  };

  React.useEffect(() => {
    loadStorageInfo();
  }, []);

  if (!storageInfo) {
    return <div className="animate-pulse">Loading...</div>;
  }

  const extraUser = userJavaPath && userJavaPath !== systemJavaPath && !(javaInstallations ?? []).includes(userJavaPath) ? 1 : 0;

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

      {/* Java installations */}
      <div className="p-4 bg-dark-700 rounded-lg cursor-pointer" onClick={toggleJava}>
        <p className="text-dark-300 text-sm font-medium mb-1 flex justify-between items-center">
          {t('metaStorage.javaInstallations')}
          <span className="text-dark-400 text-xs">{showJava ? '▲' : '▼'}</span>
        </p>
        <p className="text-white text-lg font-semibold mb-2">{storageInfo.java_installations_count + (systemJavaPath ? 1 : 0) + extraUser}</p>
        {showJava && (
          <ul className="text-xs text-dark-300 max-h-48 overflow-auto space-y-1 list-disc ml-4 break-all">
            {systemJavaPath && <li key="system">{systemJavaPath} (system)</li>}
            {userJavaPath && userJavaPath !== systemJavaPath && <li key="user">{userJavaPath} (user)</li>}
            {(javaInstallations ?? []).map(p => <li key={p}>{p}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MetaStorageSettings;