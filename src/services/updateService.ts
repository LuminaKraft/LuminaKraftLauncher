import { invoke } from '@tauri-apps/api/core';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl?: string;
  platform: string;
  releaseNotes?: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

class UpdateService {
  private static instance: UpdateService;
  private updateCheckInterval: number | null = null;
  private lastCheckTime: number = 0;
  private readonly CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
  // Primary: Public releases repository - no token needed!
  private readonly GITHUB_API_URL = 'https://api.github.com/repos/kristiangarcia/luminakraft-launcher-releases/releases/latest';
  // Fallback: Private repository (will need token, but try anyway)
  private readonly FALLBACK_GITHUB_API_URL = 'https://api.github.com/repos/kristiangarcia/luminakraft-launcher/releases/latest';

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
   * Get the appropriate download asset for the current platform
   */
  private getDownloadAsset(assets: GitHubRelease['assets'], platform: string): string | undefined {
    const platformLower = platform.toLowerCase();
    
    // Find the appropriate asset based on platform
    const asset = assets.find(asset => {
      const name = asset.name.toLowerCase();
      
      if (platformLower === 'windows') {
        return name.endsWith('.msi') || name.endsWith('.exe');
      } else if (platformLower === 'linux') {
        return name.endsWith('.deb');
      } else if (platformLower === 'macos' || platformLower === 'darwin') {
        return name.endsWith('.dmg');
      }
      
      return false;
    });
    
    return asset?.browser_download_url;
  }

  /**
   * Try to fetch from a specific GitHub releases URL
   */
  private async fetchGitHubRelease(url: string, repoName: string): Promise<GitHubRelease> {
    console.log(`Attempting to fetch from ${repoName}: ${url}`);
    
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'LuminaKraft-Launcher'
    };

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`No releases found in ${repoName}. Repository may not exist or have no releases.`);
      } else if (response.status === 403) {
        throw new Error(`Access denied to ${repoName}. Repository may be private or rate-limited.`);
      }
      throw new Error(`GitHub API request failed for ${repoName}: ${response.status} ${response.statusText}`);
    }

    const release: GitHubRelease = await response.json();
    console.log(`✅ Successfully fetched release from ${repoName}:`, release.tag_name);
    return release;
  }

  /**
   * Check for updates using GitHub releases with fallback strategy
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    try {
      console.log('🔍 Checking for updates...');
      
      // Get current version and platform from Tauri
      const [currentVersion, platform] = await Promise.all([
        invoke<string>('get_launcher_version'),
        invoke<string>('get_platform')
      ]);

      console.log(`Current version: ${currentVersion}, Platform: ${platform}`);

      let release: GitHubRelease;
      
      // Try public repository first
      try {
        release = await this.fetchGitHubRelease(this.GITHUB_API_URL, 'public releases repository');
      } catch (publicError) {
        console.warn('Failed to fetch from public repository:', publicError);
        
        // Try fallback to private repository
        try {
          console.log('🔄 Trying fallback to private repository...');
          release = await this.fetchGitHubRelease(this.FALLBACK_GITHUB_API_URL, 'private repository');
        } catch (fallbackError) {
          console.error('Both repositories failed:', fallbackError);
          
          // If both fail, return no update available
          const updateInfo: UpdateInfo = {
            hasUpdate: false,
            currentVersion,
            latestVersion: currentVersion,
            platform,
            releaseNotes: 'Unable to check for updates: No releases found. This is normal for new installations.'
          };
          
          console.log('❌ No releases found in any repository, returning no update');
          return updateInfo;
        }
      }

      const latestVersion = release.tag_name.replace('v', '');
      console.log(`Latest version found: ${latestVersion}`);

      // Compare versions
      const comparison = this.compareVersions(currentVersion, latestVersion);
      const hasUpdate = comparison < 0;

      console.log(`Version comparison: current(${currentVersion}) vs latest(${latestVersion}) = ${comparison} (hasUpdate: ${hasUpdate})`);

      const updateInfo: UpdateInfo = {
        hasUpdate,
        currentVersion,
        latestVersion,
        platform,
        downloadUrl: hasUpdate ? this.getDownloadAsset(release.assets, platform) : undefined,
        releaseNotes: hasUpdate ? release.body : undefined
      };

      this.lastCheckTime = Date.now();
      
      // Store update info in localStorage for persistence
      localStorage.setItem('lastUpdateCheck', JSON.stringify({
        timestamp: this.lastCheckTime,
        updateInfo
      }));

      console.log('✅ Update check completed:', updateInfo);
      return updateInfo;
    } catch (error) {
      console.error('❌ Failed to check for updates:', error);
      throw new Error(`Update check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
   * Download and open the update file
   */
  async downloadUpdate(downloadUrl: string): Promise<void> {
    try {
      console.log('Opening download URL:', downloadUrl);
      await this.openDownloadUrl(downloadUrl);
    } catch (error) {
      console.error('Failed to download update:', error);
      throw error;
    }
  }

  /**
   * Open download URL in browser
   */
  private async openDownloadUrl(url: string): Promise<void> {
    try {
      await invoke('open_url', { url });
    } catch (error) {
      console.error('Failed to open URL:', error);
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(url);
        console.log('Download URL copied to clipboard');
      } catch (clipboardError) {
        console.error('Failed to copy to clipboard:', clipboardError);
      }
      throw error;
    }
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