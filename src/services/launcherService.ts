import { invoke } from '@tauri-apps/api/core';
import axios from 'axios';
import type { LauncherData, Modpack, InstanceMetadata, UserSettings, ModpackStatus } from '../types/launcher';

class LauncherService {
  private static instance: LauncherService;
  private launcherData: LauncherData | null = null;
  private userSettings: UserSettings;

  constructor() {
    this.userSettings = this.loadUserSettings();
  }

  static getInstance(): LauncherService {
    if (!LauncherService.instance) {
      LauncherService.instance = new LauncherService();
    }
    return LauncherService.instance;
  }

  private loadUserSettings(): UserSettings {
    const defaultSettings: UserSettings = {
      username: 'Player',
      allocatedRam: 4,
      launcherDataUrl: 'https://api.luminakraft.com/v1/launcher_data.json'
    };

    try {
      const saved = localStorage.getItem('luminakraft_settings');
      if (saved) {
        return { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Error loading user settings:', error);
    }

    return defaultSettings;
  }

  saveUserSettings(settings: Partial<UserSettings>): void {
    this.userSettings = { ...this.userSettings, ...settings };
    localStorage.setItem('luminakraft_settings', JSON.stringify(this.userSettings));
  }

  getUserSettings(): UserSettings {
    return { ...this.userSettings };
  }

  async fetchLauncherData(): Promise<LauncherData> {
    try {
      const response = await axios.get<LauncherData>(this.userSettings.launcherDataUrl);
      this.launcherData = response.data;
      return response.data;
    } catch (error) {
      console.error('Error fetching launcher data:', error);
      throw new Error('No se pudo obtener los datos del launcher. Verifica tu conexión a internet.');
    }
  }

  getLauncherData(): LauncherData | null {
    return this.launcherData;
  }

  async getModpackStatus(modpackId: string): Promise<ModpackStatus> {
    try {
      const metadata = await this.getInstanceMetadata(modpackId);
      if (!metadata) {
        return 'not_installed';
      }

      const modpack = this.launcherData?.modpacks.find(m => m.id === modpackId);
      if (!modpack) {
        return 'error';
      }

      if (metadata.version !== modpack.version) {
        return 'outdated';
      }

      return 'installed';
    } catch (error) {
      console.error('Error getting modpack status:', error);
      return 'error';
    }
  }

  async getInstanceMetadata(modpackId: string): Promise<InstanceMetadata | null> {
    try {
      const metadata = await invoke<string>('get_instance_metadata', { modpackId });
      return metadata ? JSON.parse(metadata) : null;
    } catch (error) {
      console.error('Error getting instance metadata:', error);
      return null;
    }
  }

  async installModpack(modpackId: string, onProgress?: (progress: number) => void): Promise<void> {
    const modpack = this.launcherData?.modpacks.find(m => m.id === modpackId);
    if (!modpack) {
      throw new Error('Modpack no encontrado');
    }

    try {
      await invoke('install_modpack', {
        modpack,
        onProgress: onProgress || (() => {})
      });
    } catch (error) {
      console.error('Error installing modpack:', error);
      throw new Error('Error al instalar el modpack');
    }
  }

  async updateModpack(modpackId: string, onProgress?: (progress: number) => void): Promise<void> {
    return this.installModpack(modpackId, onProgress);
  }

  async launchModpack(modpackId: string): Promise<void> {
    const modpack = this.launcherData?.modpacks.find(m => m.id === modpackId);
    if (!modpack) {
      throw new Error('Modpack no encontrado');
    }

    try {
      await invoke('launch_modpack', {
        modpack,
        settings: this.userSettings
      });
    } catch (error) {
      console.error('Error launching modpack:', error);
      throw new Error('Error al lanzar el modpack');
    }
  }

  async repairModpack(modpackId: string, onProgress?: (progress: number) => void): Promise<void> {
    try {
      await invoke('delete_instance', { modpackId });
      await this.installModpack(modpackId, onProgress);
    } catch (error) {
      console.error('Error repairing modpack:', error);
      throw new Error('Error al reparar el modpack');
    }
  }

  async checkForLauncherUpdate(): Promise<{ hasUpdate: boolean; downloadUrl?: string }> {
    if (!this.launcherData) {
      return { hasUpdate: false };
    }

    try {
      const currentVersion = await invoke<string>('get_launcher_version');
      const remoteVersion = this.launcherData.launcherVersion;

      if (this.isVersionNewer(remoteVersion, currentVersion)) {
        const platform = await invoke<string>('get_platform');
        const downloadUrl = this.launcherData.launcherDownloadUrls[platform as keyof typeof this.launcherData.launcherDownloadUrls];
        
        return {
          hasUpdate: true,
          downloadUrl
        };
      }

      return { hasUpdate: false };
    } catch (error) {
      console.error('Error checking for launcher update:', error);
      return { hasUpdate: false };
    }
  }

  private isVersionNewer(remote: string, current: string): boolean {
    const parseVersion = (version: string) => version.split('.').map(Number);
    const remoteVersion = parseVersion(remote);
    const currentVersion = parseVersion(current);

    for (let i = 0; i < Math.max(remoteVersion.length, currentVersion.length); i++) {
      const remotePart = remoteVersion[i] || 0;
      const currentPart = currentVersion[i] || 0;

      if (remotePart > currentPart) return true;
      if (remotePart < currentPart) return false;
    }

    return false;
  }
}

export default LauncherService; 