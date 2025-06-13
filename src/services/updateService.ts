import { invoke } from '@tauri-apps/api/core';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl?: string;
  platform: string;
  update?: Update;
}

export interface LauncherData {
  launcherVersion: string;
  launcherDownloadUrls: {
    windows: string;
    macos: string;
    linux: string;
  };
}

class UpdateService {
  private static instance: UpdateService;
  private updateCheckInterval: number | null = null;
  private lastCheckTime: number = 0;
  private readonly CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
  private readonly API_URL = 'https://api.luminakraft.com/v1/launcher_data.json';

  private constructor() {}

  static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  /**
   * Compare version strings (e.g., "0.3.0" vs "0.2.1")
   */
  private compareVersions(current: string, latest: string): number {
    const currentParts = current.replace('v', '').split('.').map(Number);
    const latestParts = latest.replace('v', '').split('.').map(Number);
    
    const maxLength = Math.max(currentParts.length, latestParts.length);
    
    for (let i = 0; i < maxLength; i++) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;
      
      if (currentPart < latestPart) return -1;
      if (currentPart > latestPart) return 1;
    }
    
    return 0;
  }

  /**
   * Get platform-specific download URL
   */
  private getDownloadUrl(urls: LauncherData['launcherDownloadUrls'], platform: string): string {
    switch (platform.toLowerCase()) {
      case 'windows':
        return urls.windows;
      case 'macos':
      case 'darwin':
        return urls.macos;
      case 'linux':
        return urls.linux;
      default:
        return urls.windows; // Default fallback
    }
  }

  /**
   * Check for updates using Tauri's built-in updater
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    try {
      console.log('Checking for updates using Tauri updater...');
      
      // Get current version and platform from Tauri
      const [currentVersion, platform] = await Promise.all([
        invoke<string>('get_launcher_version'),
        invoke<string>('get_platform')
      ]);

      // Use Tauri's built-in updater to check for updates
      const update = await check();
      
      const updateInfo: UpdateInfo = {
        hasUpdate: update !== null,
        currentVersion,
        latestVersion: update?.version || currentVersion,
        platform,
        update: update || undefined
      };

      this.lastCheckTime = Date.now();
      
      // Store update info in localStorage for persistence
      localStorage.setItem('lastUpdateCheck', JSON.stringify({
        timestamp: this.lastCheckTime,
        updateInfo: {
          ...updateInfo,
          update: undefined // Don't serialize the Update object
        }
      }));

      console.log('Update check result:', updateInfo);
      return updateInfo;
    } catch (error) {
      console.error('Failed to check for updates:', error);
      
      // Fallback to manual checking if Tauri updater fails
      try {
        return await this.checkForUpdatesManually();
      } catch (fallbackError) {
        console.error('Fallback update check also failed:', fallbackError);
        throw error;
      }
    }
  }

  /**
   * Fallback manual update checking (original method)
   */
  private async checkForUpdatesManually(): Promise<UpdateInfo> {
    console.log('Using fallback manual update checking...');
    
    // Get current version and platform from Tauri
    const [currentVersion, platform] = await Promise.all([
      invoke<string>('get_launcher_version'),
      invoke<string>('get_platform')
    ]);

    // Fetch latest version from API
    const response = await fetch(this.API_URL);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data: LauncherData = await response.json();
    const latestVersion = data.launcherVersion;

    // Compare versions
    const comparison = this.compareVersions(currentVersion, latestVersion);
    const hasUpdate = comparison < 0;

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      platform,
      downloadUrl: hasUpdate ? this.getDownloadUrl(data.launcherDownloadUrls, platform) : undefined
    };
  }

  /**
   * Get cached update info if available and recent
   */
  getCachedUpdateInfo(): UpdateInfo | null {
    try {
      const cached = localStorage.getItem('lastUpdateCheck');
      if (!cached) return null;

      const { timestamp, updateInfo } = JSON.parse(cached);
      
      // Use cached info if it's less than 1 hour old
      if (Date.now() - timestamp < this.CHECK_INTERVAL) {
        return updateInfo;
      }
    } catch (error) {
      console.error('Failed to get cached update info:', error);
    }
    
    return null;
  }

  /**
   * Start automatic update checking
   */
  startAutomaticChecking(): void {
    // Check immediately if no recent check
    const cached = this.getCachedUpdateInfo();
    if (!cached) {
      this.checkForUpdates().catch(console.error);
    }

    // Set up periodic checking
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
    }

    this.updateCheckInterval = window.setInterval(() => {
      this.checkForUpdates().catch(console.error);
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop automatic update checking
   */
  stopAutomaticChecking(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
  }

  /**
   * Download and install update automatically
   */
  async downloadAndInstallUpdate(updateInfo: UpdateInfo): Promise<void> {
    if (!updateInfo.update) {
      throw new Error('No update object available for automatic installation');
    }

    try {
      console.log('Starting automatic update download and installation...');
      
      // Download and install the update
      await updateInfo.update.downloadAndInstall();
      
      console.log('Update downloaded and installed successfully');
      
      // Relaunch the application to apply the update
      console.log('Relaunching application to apply update...');
      await relaunch();
      
    } catch (error) {
      console.error('Failed to download and install update:', error);
      
      // Fallback to manual download if automatic installation fails
      if (updateInfo.downloadUrl) {
        console.log('Falling back to manual download...');
        await this.openDownloadUrl(updateInfo.downloadUrl);
      } else {
        throw new Error('Automatic update failed and no manual download URL available');
      }
    }
  }

  /**
   * Open download URL in default browser (fallback method)
   */
  private async openDownloadUrl(url: string): Promise<void> {
    try {
      await invoke('open_url', { url });
      console.log('Successfully opened download URL in browser');
    } catch (error) {
      console.error('Failed to open download URL:', error);
      
      // Fallback: try to copy to clipboard
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          throw new Error(`Could not open browser. Download URL copied to clipboard: ${url}`);
        } else {
          throw new Error(`Could not open browser or copy to clipboard. Download URL: ${url}`);
        }
      } catch (clipboardError) {
        throw new Error(`Could not open browser. Please visit: ${url}`);
      }
    }
  }

  /**
   * Check if updates should be checked (not too frequent)
   */
  shouldCheckForUpdates(): boolean {
    const now = Date.now();
    const timeSinceLastCheck = now - this.lastCheckTime;
    return timeSinceLastCheck >= this.CHECK_INTERVAL;
  }

  /**
   * Get time until next automatic check
   */
  getTimeUntilNextCheck(): number {
    const now = Date.now();
    const timeSinceLastCheck = now - this.lastCheckTime;
    return Math.max(0, this.CHECK_INTERVAL - timeSinceLastCheck);
  }
}

export default UpdateService; 