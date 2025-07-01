import { invoke } from '@tauri-apps/api/core';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl?: string;
  platform: string;
  releaseNotes?: string;
  isPrerelease?: boolean;
}

class UpdateService {
  private static instance: UpdateService;
  private updateCheckInterval: number | null = null;
  private lastCheckTime: number = 0;
  private readonly CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
  private currentUpdate: Update | null = null;

  private constructor() {}

  static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  /**
   * Get user settings to check if prereleases are enabled
   */
  private async getPrereleaseSettings(): Promise<boolean> {
    try {
      // Unified key used by LauncherService
      const raw = localStorage.getItem('LuminaKraftLauncher_settings') || localStorage.getItem('userSettings');
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.enablePrereleases === true;
      }
      return false;
    } catch (error) {
      console.error('[UpdateService] Failed to parse user settings for prerelease flag:', error);
      return false;
    }
  }

  /**
   * Check for updates using GitHub API (for prereleases) or Tauri's built-in updater (for stable)
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    try {
      console.log('🔍 Checking for updates...');
      const [currentVersion, platform, enablePrereleases] = await Promise.all([
        invoke<string>('get_launcher_version'),
        invoke<string>('get_platform'),
        this.getPrereleaseSettings()
      ]);
      console.log(`Current version: ${currentVersion}, Platform: ${platform}, Prereleases: ${enablePrereleases}`);

      if (enablePrereleases) {
        return this.checkForAnyUpdate(currentVersion, platform); // accept prereleases too
      } else {
        return this.checkForStableUpdate(currentVersion, platform);
      }
    } catch (error) {
      console.error('❌ Failed to check for updates:', error);
      throw new Error(`Update check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check using Tauri updater and accept any version (stable or prerelease)
   */
  private async checkForAnyUpdate(currentVersion: string, platform: string): Promise<UpdateInfo> {
    console.log('🔍 Checking using Tauri updater (prereleases enabled)...');
    const update = await check();
    if (update) {
      this.currentUpdate = update;
      const updateInfo: UpdateInfo = {
        hasUpdate: true,
        currentVersion,
        latestVersion: update.version,
        platform,
        releaseNotes: update.body || '',
        isPrerelease: this.isPrerelease(update.version)
      };
      this.storeUpdateInfo(updateInfo);
      return updateInfo;
    }
    const none: UpdateInfo = {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      platform
    };
    this.storeUpdateInfo(none);
    return none;
  }

  /**
   * Check for stable updates using Tauri's built-in updater
   */
  private async checkForStableUpdate(currentVersion: string, platform: string): Promise<UpdateInfo> {
    console.log('🔍 Checking for stable updates using Tauri updater...');
    
    const update = await check();
    
    if (update && !this.isPrerelease(update.version)) {
      this.currentUpdate = update;
      console.log(`✅ Stable update available: ${currentVersion} -> ${update.version}`);
      
      const updateInfo: UpdateInfo = {
        hasUpdate: true,
        currentVersion,
        latestVersion: update.version,
        platform,
        releaseNotes: update.body || '',
        isPrerelease: false
      };

      this.storeUpdateInfo(updateInfo);
      return updateInfo;
    } else {
      console.log('✅ No stable updates available');
      const updateInfo: UpdateInfo = {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        platform
      };

      this.storeUpdateInfo(updateInfo);
      return updateInfo;
    }
  }

  /**
   * Check if a version is a prerelease
   */
  private isPrerelease(version: string): boolean {
    return version.includes('alpha') || version.includes('beta') || version.includes('rc');
  }

  /**
   * Store update info in localStorage
   */
  private storeUpdateInfo(updateInfo: UpdateInfo): void {
    this.lastCheckTime = Date.now();
    localStorage.setItem('lastUpdateCheck', JSON.stringify({
      timestamp: this.lastCheckTime,
      updateInfo
    }));
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
   * Download and install the update automatically
   */
  async downloadAndInstallUpdate(onProgress?: (progress: number, total: number) => void): Promise<void> {
    if (this.currentUpdate) {
      return this.installTauriUpdate(onProgress);
    } else {
      throw new Error('No update available to install');
    }
  }

  /**
   * Install update using Tauri's updater
   */
  private async installTauriUpdate(onProgress?: (progress: number, total: number) => void): Promise<void> {
    if (!this.currentUpdate) {
      throw new Error('No Tauri update available to install');
    }

    try {
      console.log('📥 Starting automatic update download and installation...');
      
      await this.currentUpdate.downloadAndInstall((event: any) => {
        const data = event.data || {};
        switch (event.event) {
          case 'Started':
            console.log('🔄 Update download started');
            onProgress?.(0, data.contentLength ?? 0);
            break;
          case 'Progress':
            if (typeof data.chunkLength === 'number' && typeof data.contentLength === 'number') {
              console.log(`📦 Update download progress: ${data.chunkLength}/${data.contentLength}`);
              onProgress?.(data.chunkLength, data.contentLength);
            }
            break;
          case 'Finished':
            console.log('✅ Update download finished, installing...');
            if (typeof data.contentLength === 'number') {
              onProgress?.(data.contentLength, data.contentLength);
            }
            break;
          default:
            console.log('Update event:', event);
        }
      });

      console.log('🎉 Update installed successfully! Restarting application...');
      
      setTimeout(async () => {
        try {
          await relaunch();
        } catch (error) {
          console.error('Failed to relaunch application:', error);
          alert('Update installed successfully! Please restart the application manually.');
        }
      }, 1000);

    } catch (error) {
      console.error('❌ Failed to download and install update:', error);
      throw error;
    }
  }
}

export const updateService = UpdateService.getInstance(); 