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
      const settings = localStorage.getItem('userSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        return parsed.enablePrereleases || false;
      }
      return false;
    } catch (error) {
      console.error('Failed to get prerelease settings:', error);
      return false;
    }
  }

  /**
   * Check for updates using GitHub API (for prereleases) or Tauri's built-in updater (for stable)
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    try {
      console.log('🔍 Checking for updates...');
      
      // Get current version and platform from Tauri
      const [currentVersion, platform, enablePrereleases] = await Promise.all([
        invoke<string>('get_launcher_version'),
        invoke<string>('get_platform'),
        this.getPrereleaseSettings()
      ]);

      console.log(`Current version: ${currentVersion}, Platform: ${platform}, Prereleases: ${enablePrereleases}`);

      if (enablePrereleases) {
        // Use GitHub API to get all releases including prereleases
        return this.checkForPrerelease(currentVersion, platform);
      } else {
        // Use Tauri's updater for stable releases only
        return this.checkForStableUpdate(currentVersion, platform);
      }
    } catch (error) {
      console.error('❌ Failed to check for updates:', error);
      throw new Error(`Update check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
        releaseNotes: update.body || 'New stable version available',
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
   * Check for prereleases using GitHub API
   */
  private async checkForPrerelease(currentVersion: string, platform: string): Promise<UpdateInfo> {
    console.log('🔍 Checking for prereleases using GitHub API...');
    
    try {
      const response = await fetch('https://api.github.com/repos/LuminaKraft/LuminakraftLauncher/releases', {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'LuminaKraft-Launcher'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const releases = await response.json();
      const latestRelease = releases[0]; // First release is the most recent
      
      if (latestRelease && this.compareVersions(currentVersion, latestRelease.tag_name.replace('v', '')) < 0) {
        console.log(`✅ Prerelease update available: ${currentVersion} -> ${latestRelease.tag_name}`);
        
        const updateInfo: UpdateInfo = {
          hasUpdate: true,
          currentVersion,
          latestVersion: latestRelease.tag_name.replace('v', ''),
          platform,
          releaseNotes: latestRelease.body || 'New experimental version available',
          isPrerelease: latestRelease.prerelease
        };

        // For prereleases from GitHub, we need to create a manual update flow
        // since Tauri updater only works with signed updates
        this.currentUpdate = null; // Clear current update for GitHub-based updates

        this.storeUpdateInfo(updateInfo);
        return updateInfo;
      } else {
        console.log('✅ No prereleases available');
        const updateInfo: UpdateInfo = {
          hasUpdate: false,
          currentVersion,
          latestVersion: currentVersion,
          platform
        };

        this.storeUpdateInfo(updateInfo);
        return updateInfo;
      }
    } catch (error) {
      console.error('Failed to fetch prereleases from GitHub:', error);
      // Fallback to stable updates
      return this.checkForStableUpdate(currentVersion, platform);
    }
  }

  /**
   * Check if a version is a prerelease
   */
  private isPrerelease(version: string): boolean {
    return version.includes('alpha') || version.includes('beta') || version.includes('rc');
  }

  /**
   * Compare version strings
   */
  private compareVersions(current: string, latest: string): number {
    const parseVersion = (version: string) => {
      const clean = version.replace(/^v/, '');
      const [main, pre] = clean.split('-');
      const mainParts = main.split('.').map(Number);
      return { main: mainParts, pre };
    };

    const currentParts = parseVersion(current);
    const latestParts = parseVersion(latest);

    // Compare main version
    for (let i = 0; i < 3; i++) {
      const curr = currentParts.main[i] || 0;
      const lat = latestParts.main[i] || 0;
      if (curr < lat) return -1;
      if (curr > lat) return 1;
    }

    // If main versions are equal, compare prerelease
    if (!currentParts.pre && !latestParts.pre) return 0;
    if (!currentParts.pre && latestParts.pre) return 1;
    if (currentParts.pre && !latestParts.pre) return -1;
    
    return currentParts.pre < latestParts.pre ? -1 : 1;
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
      // Use Tauri's automatic updater for stable releases
      return this.installTauriUpdate(onProgress);
    } else {
      // For prereleases, open download page
      return this.openPrereleaseDownload();
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
        switch (event.event) {
          case 'Started':
            console.log('🔄 Update download started');
            onProgress?.(0, event.data.contentLength || 0);
            break;
          case 'Progress':
            console.log(`📦 Update download progress: ${event.data.chunkLength}/${event.data.contentLength || 0}`);
            onProgress?.(event.data.chunkLength || 0, event.data.contentLength || 0);
            break;
          case 'Finished':
            console.log('✅ Update download finished, installing...');
            onProgress?.(event.data.contentLength || 0, event.data.contentLength || 0);
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

  /**
   * Open prerelease download page
   */
  private async openPrereleaseDownload(): Promise<void> {
    try {
      const url = 'https://github.com/LuminaKraft/LuminakraftLauncher/releases';
      await invoke('open_url', { url });
      console.log('🌐 Opened prereleases page in browser');
    } catch (error) {
      console.error('Failed to open prereleases page:', error);
      throw new Error('Failed to open download page. Please visit GitHub releases manually.');
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async downloadUpdate(): Promise<void> {
    return this.downloadAndInstallUpdate();
  }

  /**
   * Check if we should check for updates (not checked recently)
   */
  shouldCheckForUpdates(): boolean {
    return Date.now() - this.lastCheckTime > this.CHECK_INTERVAL;
  }

  /**
   * Get time until next automatic check (in milliseconds)
   */
  getTimeUntilNextCheck(): number {
    return Math.max(0, this.CHECK_INTERVAL - (Date.now() - this.lastCheckTime));
  }
}

export const updateService = UpdateService.getInstance(); 