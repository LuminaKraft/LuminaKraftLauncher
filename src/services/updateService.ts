import { invoke } from '@tauri-apps/api/core';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl?: string;
  platform: string;
  releaseNotes?: string;
  isPrerelease?: boolean;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  prerelease: boolean;
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
  // Only use public repository and get all releases (including prereleases)
  private readonly GITHUB_API_URL = 'https://api.github.com/repos/LuminaKraft/LuminaKraftLauncher/releases';

  private constructor() {}

  static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  /**
   * Compare version strings with proper prerelease support (e.g., "0.0.6-alpha.1" vs "0.0.6-alpha.2")
   */
  private compareVersions(current: string, latest: string): number {
    // Remove 'v' prefix if present
    const currentClean = current.replace(/^v/, '');
    const latestClean = latest.replace(/^v/, '');
    
    // Split version and prerelease parts
    const currentParts = this.parseVersion(currentClean);
    const latestParts = this.parseVersion(latestClean);
    
    // Compare main version numbers (major.minor.patch)
    for (let i = 0; i < 3; i++) {
      const currentPart = currentParts.version[i] || 0;
      const latestPart = latestParts.version[i] || 0;
      
      if (currentPart < latestPart) return -1;
      if (currentPart > latestPart) return 1;
    }
    
    // If main versions are equal, compare prerelease
    return this.comparePrereleaseVersions(currentParts.prerelease, latestParts.prerelease);
  }

  /**
   * Parse a version string into version numbers and prerelease parts
   */
  private parseVersion(version: string): { version: number[], prerelease: string | null } {
    const parts = version.split('-');
    const versionNumbers = parts[0].split('.').map(Number);
    const prerelease = parts.length > 1 ? parts.slice(1).join('-') : null;
    
    return {
      version: versionNumbers,
      prerelease: prerelease
    };
  }

  /**
   * Compare prerelease versions (alpha.1, beta.2, rc.1, etc.)
   */
  private comparePrereleaseVersions(current: string | null, latest: string | null): number {
    // If neither has prerelease, they're equal
    if (!current && !latest) return 0;
    
    // Stable version (no prerelease) is always greater than prerelease
    if (!current && latest) return 1;   // 1.0.0 > 1.0.0-alpha.1
    if (current && !latest) return -1;  // 1.0.0-alpha.1 < 1.0.0
    
    // Both have prereleases, compare them
    if (current && latest) {
      // Parse prerelease identifiers (alpha.1 -> ["alpha", "1"])
      const currentParts = this.parsePrereleaseIdentifiers(current);
      const latestParts = this.parsePrereleaseIdentifiers(latest);
      
      const maxLength = Math.max(currentParts.length, latestParts.length);
      
      for (let i = 0; i < maxLength; i++) {
        const currentPart = currentParts[i];
        const latestPart = latestParts[i];
        
        // If one is undefined, the other is greater
        if (currentPart === undefined) return -1;
        if (latestPart === undefined) return 1;
        
        // Compare numeric vs non-numeric
        const currentIsNum = /^\d+$/.test(currentPart);
        const latestIsNum = /^\d+$/.test(latestPart);
        
        if (currentIsNum && latestIsNum) {
          // Both numeric: compare as numbers
          const diff = parseInt(currentPart) - parseInt(latestPart);
          if (diff !== 0) return diff < 0 ? -1 : 1;
        } else if (currentIsNum && !latestIsNum) {
          // Numeric comes after non-numeric
          return 1;
        } else if (!currentIsNum && latestIsNum) {
          // Non-numeric comes before numeric
          return -1;
        } else {
          // Both non-numeric: compare lexically with precedence rules
          const comparison = this.comparePrereleaseTypes(currentPart, latestPart);
          if (comparison !== 0) return comparison;
        }
      }
    }
    
    return 0;
  }

  /**
   * Parse prerelease identifiers (e.g., "alpha.1" -> ["alpha", "1"])
   */
  private parsePrereleaseIdentifiers(prerelease: string): string[] {
    return prerelease.split(/[.\-]/);
  }

  /**
   * Compare prerelease type identifiers with proper precedence
   */
  private comparePrereleaseTypes(current: string, latest: string): number {
    const precedence = ['alpha', 'beta', 'rc'];
    const currentIndex = precedence.indexOf(current.toLowerCase());
    const latestIndex = precedence.indexOf(latest.toLowerCase());
    
    // If both are known types, compare by precedence
    if (currentIndex !== -1 && latestIndex !== -1) {
      return currentIndex - latestIndex;
    }
    
    // If one is unknown, fall back to lexical comparison
    if (current < latest) return -1;
    if (current > latest) return 1;
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
  private async fetchGitHubReleases(url: string, repoName: string): Promise<GitHubRelease[]> {
    console.log(`Attempting to fetch releases from ${repoName}: ${url}`);
    
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

    const releases: GitHubRelease[] = await response.json();
    console.log(`✅ Successfully fetched ${releases.length} releases from ${repoName}`);
    return releases;
  }

  /**
   * Find the latest release (including prereleases)
   */
  private findLatestRelease(releases: GitHubRelease[]): GitHubRelease | null {
    if (!releases || releases.length === 0) {
      return null;
    }

    // Releases are already sorted by GitHub API (newest first)
    // Take the first one which will be the most recent (including prereleases)
    const latestRelease = releases[0];
    console.log(`🔍 Latest release found: ${latestRelease.tag_name} (prerelease: ${latestRelease.prerelease})`);
    return latestRelease;
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
        const releases = await this.fetchGitHubReleases(this.GITHUB_API_URL, 'public releases repository');
        const latestRelease = this.findLatestRelease(releases);
        
        if (!latestRelease) {
          throw new Error('No releases found in the repository');
        }
        
        release = latestRelease;
      } catch (publicError) {
        console.warn('Failed to fetch from public repository:', publicError);
        
        // If repository fails, return no update available
          const updateInfo: UpdateInfo = {
            hasUpdate: false,
            currentVersion,
            latestVersion: currentVersion,
            platform,
            releaseNotes: 'Unable to check for updates: No releases found. This is normal for new installations.'
          };
          
        console.log('❌ No releases found in repository, returning no update');
          return updateInfo;
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
        releaseNotes: hasUpdate ? release.body : undefined,
        isPrerelease: hasUpdate ? release.prerelease : false
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