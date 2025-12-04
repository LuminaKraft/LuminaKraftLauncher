import { invoke } from '@tauri-apps/api/core';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import toast from 'react-hot-toast';

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
   * Check for updates using a hybrid approach: Tauri updater + GitHub API for prereleases
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
        // Check for both stable and prereleases via GitHub API
        return this.checkForAnyRelease(currentVersion, platform);
      } else {
        // Only check for stable releases via Tauri updater
        return this.checkForStableRelease(currentVersion, platform);
      }
    } catch (error) {
      console.error('❌ Failed to check for updates:', error);
      throw new Error(`Update check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check for stable releases only using Tauri updater
   */
  private async checkForStableRelease(currentVersion: string, platform: string): Promise<UpdateInfo> {
    console.log('🔍 Checking for stable updates only...');
    
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
   * Check for any release (stable or prerelease) using GitHub API
   */
  private async checkForAnyRelease(currentVersion: string, platform: string): Promise<UpdateInfo> {
    console.log('🔍 Checking for any updates (including prereleases)...');
    
    try {
      const response = await fetch('https://api.github.com/repos/LuminaKraft/LuminakraftLauncher/releases');
      const releases = await response.json();
      
      if (!Array.isArray(releases)) {
        throw new Error('Invalid releases response from GitHub API');
      }

      // Find the latest release (could be stable or prerelease)
      const latestRelease = releases
        .filter(r => !r.draft && r.tag_name.match(/^v?\d+\.\d+\.\d+/))
        .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())[0];

      if (!latestRelease) {
        throw new Error('No valid releases found');
      }

      const latestVersion = latestRelease.tag_name.replace(/^v/, '');
      const isPrerelease = latestRelease.prerelease || this.isPrerelease(latestVersion);

      if (this.isNewerVersion(currentVersion, latestVersion)) {
        console.log(`✅ Update available: ${currentVersion} -> ${latestVersion} (${isPrerelease ? 'prerelease' : 'stable'})`);

        if (isPrerelease) {
          // For prereleases, we need to trigger Tauri updater with custom endpoint
          return this.checkPrereleaseWithTauri(latestRelease, currentVersion, platform);
        } else {
          // For stable releases, use regular Tauri updater
          return this.checkForStableRelease(currentVersion, platform);
        }
      } else {
        console.log('✅ No newer updates available');
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
      console.error('❌ Failed to check GitHub API, falling back to Tauri updater:', error);
      // Fallback to Tauri updater
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
      } else {
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
  }

  /**
   * Check prerelease using Tauri updater with dynamic manifest
   */
  private async checkPrereleaseWithTauri(release: any, currentVersion: string, platform: string): Promise<UpdateInfo> {
    try {
      console.log(`🔍 Checking prerelease ${release.tag_name} via Tauri updater...`);

      // Force Tauri updater to use our latest.json (which now points to the prerelease)
      const update = await check();

      console.log(`Tauri updater response:`, update ? {
        version: update.version,
        date: update.date,
        hasUpdate: !!update
      } : 'No update found');

      if (update && update.version === release.tag_name.replace(/^v/, '')) {
        this.currentUpdate = update;
        console.log(`✅ Prerelease update available via Tauri: ${currentVersion} -> ${update.version}`);

        const updateInfo: UpdateInfo = {
          hasUpdate: true,
          currentVersion,
          latestVersion: update.version,
          platform,
          releaseNotes: update.body || release.body || '',
          isPrerelease: true
        };

        this.storeUpdateInfo(updateInfo);
        return updateInfo;
      }

      // Fallback to manual download if Tauri couldn't detect the update
      console.log(`⚠️ Prerelease ${release.tag_name} requires manual download (Tauri version mismatch or no update detected)`);
      const updateInfo: UpdateInfo = {
        hasUpdate: true,
        currentVersion,
        latestVersion: release.tag_name.replace(/^v/, ''),
        platform,
        releaseNotes: release.body || '',
        isPrerelease: true,
        downloadUrl: release.html_url
      };

      this.storeUpdateInfo(updateInfo);
      return updateInfo;
    } catch (error) {
      console.error('❌ Failed to check prerelease with Tauri:', error);
      console.error('Error type:', typeof error);

      if (error && typeof error === 'object') {
        console.error('Error details:', JSON.stringify(error, null, 2));
      }

      // Fallback to manual download
      const updateInfo: UpdateInfo = {
        hasUpdate: true,
        currentVersion,
        latestVersion: release.tag_name.replace(/^v/, ''),
        platform,
        releaseNotes: release.body || '',
        isPrerelease: true,
        downloadUrl: release.html_url
      };

      this.storeUpdateInfo(updateInfo);
      return updateInfo;
    }
  }

  /**
   * Compare two version strings to determine if the second is newer
   */
  private isNewerVersion(current: string, candidate: string): boolean {
    const currentParts = current.replace(/^v/, '').split('-')[0].split('.').map(Number);
    const candidateParts = candidate.replace(/^v/, '').split('-')[0].split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
      const currentPart = currentParts[i] || 0;
      const candidatePart = candidateParts[i] || 0;
      
      if (candidatePart > currentPart) return true;
      if (candidatePart < currentPart) return false;
    }
    
    // If base versions are equal, check prerelease status
    const currentIsPrerelease = this.isPrerelease(current);
    const candidateIsPrerelease = this.isPrerelease(candidate);
    
    // If current is prerelease and candidate is stable with same base version, candidate is newer
    if (currentIsPrerelease && !candidateIsPrerelease) return true;
    
    // If both are prereleases or both are stable, compare full versions
    if (currentIsPrerelease === candidateIsPrerelease) {
      return candidate !== current && candidate > current;
    }
    
    return false;
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
   * Download and install the update automatically (works for both stable and prereleases)
   */
  async downloadAndInstallUpdate(_onProgress?: (_progress: number, _total: number) => void): Promise<void> {
    if (this.currentUpdate) {
      return this.installTauriUpdate(_onProgress);
    } else {
      // Check if there's a cached update info with download URL (for prereleases)
      const cached = this.getCachedUpdateInfo();
      if (cached?.hasUpdate && cached.downloadUrl && cached.isPrerelease) {
        // For prereleases that can't be auto-installed, open download page
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(cached.downloadUrl);
        throw new Error('Prerelease update requires manual download. Opening download page...');
      }
      throw new Error('No update available to install');
    }
  }

  /**
   * Install update using Tauri's updater
   */
  private async installTauriUpdate(_onProgress?: (_progress: number, _total: number) => void): Promise<void> {
    if (!this.currentUpdate) {
      throw new Error('No Tauri update available to install');
    }

    try {
      // Get platform info for logging
      const platform = await invoke<string>('get_platform');

      console.log('📥 Starting automatic update download and installation...');
      console.log(`Platform: ${platform}`);
      console.log(`Update version: ${this.currentUpdate.version}`);
      console.log(`Current update object:`, {
        version: this.currentUpdate.version,
        date: this.currentUpdate.date,
        // Don't log the full body as it can be very long
      });

      await this.currentUpdate.downloadAndInstall((_event: any) => {
        const data = _event.data || {};
        switch (_event.event) {
          case 'Started':
            console.log('🔄 Update download started');
            _onProgress?.(0, data.contentLength ?? 0);
            break;
          case 'Progress':
            if (typeof data.chunkLength === 'number' && typeof data.contentLength === 'number') {
              console.log(`📦 Update download progress: ${data.chunkLength}/${data.contentLength}`);
              _onProgress?.(data.chunkLength, data.contentLength);
            }
            break;
          case 'Finished':
            console.log('✅ Update download finished, installing...');
            if (typeof data.contentLength === 'number') {
              _onProgress?.(data.contentLength, data.contentLength);
            }
            break;
          default:
            console.log('Update event:', _event);
        }
      });

      console.log('🎉 Update installed successfully! Restarting application...');

      setTimeout(async () => {
        try {
          await relaunch();
        } catch (error) {
          console.error('Failed to relaunch application:', error);
          // Silently fail - app will continue running with new version on next restart
        }
      }, 1000);

    } catch (error) {
      console.error('❌ Failed to download and install update:', error);
      console.error('Error type:', typeof error);
      console.error('Error details:', error);

      // Try to extract more information from the error
      if (error && typeof error === 'object') {
        console.error('Error keys:', Object.keys(error));
        console.error('Error stringified:', JSON.stringify(error, null, 2));
      }

      throw error;
    }
  }
}

export const updateService = UpdateService.getInstance(); 