import JSZip from 'jszip';
import { supabase } from './supabaseClient';

export interface ModpackManifest {
  name: string;
  version: string;
  minecraft: {
    version: string;
    modLoaders: Array<{ id: string; primary: boolean }>;
  };
  files: Array<{
    projectID: number;
    fileID: number;
    required: boolean;
  }>;
}

export interface ModFileInfo {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  downloadUrl: string | null;
  fileStatus: number;
  isAvailable: boolean;
  modSlug?: string;
  modWebsiteUrl?: string;
}

export interface ValidationResult {
  success: boolean;
  manifest?: ModpackManifest;
  modsWithoutUrl: ModFileInfo[];
  modsInOverrides: string[];
  error?: string;
}

class ModpackValidationService {
  private static instance: ModpackValidationService;

  static getInstance(): ModpackValidationService {
    if (!ModpackValidationService.instance) {
      ModpackValidationService.instance = new ModpackValidationService();
    }
    return ModpackValidationService.instance;
  }

  /**
   * Validate a modpack ZIP file using Web Worker for non-blocking processing
   * - Parses manifest.json
   * - Checks which mods have empty downloadUrl
   * - Verifies if those mods are in overrides/mods/
   */
  async validateModpackZip(file: File): Promise<ValidationResult> {
    try {
      // First, load and parse just the manifest to get file IDs (quick operation)
      const zip = await JSZip.loadAsync(file);

      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) {
        return {
          success: false,
          modsWithoutUrl: [],
          modsInOverrides: [],
          error: 'No manifest.json found in ZIP file'
        };
      }

      const manifestText = await manifestFile.async('text');
      const manifest: ModpackManifest = JSON.parse(manifestText);

      // Extract file IDs
      const fileIds = manifest.files.map(f => f.fileID);

      // Query Supabase Edge Function to get mod file info (this is already async)
      const modsInfo = await this.fetchModsInfo(fileIds);

      // Now use Web Worker to check overrides without blocking the UI
      const result = await this.validateZipWithWorker(file, modsInfo);

      return {
        success: result.success,
        manifest: result.manifest || manifest,
        modsWithoutUrl: result.modsWithoutUrl,
        modsInOverrides: result.modsInOverrides,
        error: result.error
      };
    } catch (error) {
      console.error('Error validating modpack:', error);
      return {
        success: false,
        modsWithoutUrl: [],
        modsInOverrides: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Use Web Worker to process ZIP file without blocking UI
   */
  private validateZipWithWorker(file: File, modsInfo: ModFileInfo[]): Promise<ValidationResult> {
    return new Promise((resolve, reject) => {
      try {
        // Create worker
        const worker = new Worker(
          new URL('../workers/modpackValidationWorker.ts', import.meta.url),
          { type: 'module' }
        );

        // Set timeout to prevent hanging
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('Validation timeout - ZIP file too large'));
        }, 60000); // 60 second timeout

        // Handle worker message
        worker.onmessage = (event: MessageEvent<ValidationResult>) => {
          clearTimeout(timeout);
          worker.terminate();
          resolve(event.data);
        };

        // Handle worker error
        worker.onerror = (error: ErrorEvent) => {
          clearTimeout(timeout);
          worker.terminate();
          reject(error);
        };

        // Send file and mods info to worker
        worker.postMessage({
          file,
          modsInfo
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Fetch mod file information from CurseForge via Supabase Edge Function
   */
  private async fetchModsInfo(fileIds: number[]): Promise<ModFileInfo[]> {
    const BATCH_SIZE = 50;
    const allModFiles: ModFileInfo[] = [];

    // Step 1: Fetch file information
    for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
      const batch = fileIds.slice(i, i + BATCH_SIZE);

      try {
        const { data, error } = await supabase.functions.invoke('curseforge-proxy', {
          body: {
            endpoint: '/mods/files',
            method: 'POST',
            body: {
              fileIds: batch
            }
          }
        });

        if (error) {
          console.error('Error fetching mods batch:', error);
          continue;
        }

        if (data?.data) {
          allModFiles.push(...data.data);
        }
      } catch (error) {
        console.error('Error in batch fetch:', error);
      }
    }

    // Step 2: Get unique mod IDs and fetch mod information
    const uniqueModIds = [...new Set(allModFiles.map(file => file.modId))];
    const modInfoMap = new Map<number, { slug: string; websiteUrl: string }>();

    for (let i = 0; i < uniqueModIds.length; i += BATCH_SIZE) {
      const batch = uniqueModIds.slice(i, i + BATCH_SIZE);

      try {
        const { data, error } = await supabase.functions.invoke('curseforge-proxy', {
          body: {
            endpoint: '/mods',
            method: 'POST',
            body: {
              modIds: batch
            }
          }
        });

        if (error) {
          console.error('Error fetching mod info:', error);
          continue;
        }

        if (data?.data) {
          for (const mod of data.data) {
            modInfoMap.set(mod.id, {
              slug: mod.slug,
              websiteUrl: mod.links?.websiteUrl || ''
            });
          }
        }
      } catch (error) {
        console.error('Error fetching mod info:', error);
      }
    }

    // Step 3: Enrich file info with mod info
    return allModFiles.map(file => {
      const modInfo = modInfoMap.get(file.modId);
      return {
        ...file,
        modSlug: modInfo?.slug,
        modWebsiteUrl: modInfo?.websiteUrl
      };
    });
  }

  /**
   * Check which mods/resourcepacks are present in overrides/ folders
   */
  private async checkModsInOverrides(zip: JSZip, modsWithoutUrl: ModFileInfo[]): Promise<string[]> {
    const overrideModsPath = 'overrides/mods/';
    const overrideResourcepacksPath = 'overrides/resourcepacks/';
    const modsInOverrides: string[] = [];

    // Get all files in overrides/mods/ (JAR files)
    const overrideModFiles = Object.keys(zip.files).filter(path =>
      path.startsWith(overrideModsPath) && path.endsWith('.jar')
    );

    // Get all files in overrides/resourcepacks/ (ZIP files)
    const overrideResourcepackFiles = Object.keys(zip.files).filter(path =>
      path.startsWith(overrideResourcepacksPath) && path.endsWith('.zip')
    );

    // Extract just the filenames from the full paths
    const overrideModFileNames = overrideModFiles.map(path =>
      path.substring(overrideModsPath.length).toLowerCase()
    );

    const overrideResourcepackFileNames = overrideResourcepackFiles.map(path =>
      path.substring(overrideResourcepacksPath.length).toLowerCase()
    );

    // Combine all override filenames
    const allOverrideFileNames = [...overrideModFileNames, ...overrideResourcepackFileNames];

    // Check if each mod without URL is in overrides
    for (const mod of modsWithoutUrl) {
      const modFileName = mod.fileName.toLowerCase();
      if (allOverrideFileNames.includes(modFileName)) {
        modsInOverrides.push(mod.fileName);
      }
    }

    return modsInOverrides;
  }

  /**
   * Get user-friendly file status text
   */
  getFileStatusText(status: number): string {
    const statusMap: Record<number, string> = {
      1: 'Processing',
      2: 'Changes Required',
      3: 'Under Review',
      4: 'Approved',
      5: 'Rejected',
      6: 'Malware Detected',
      7: 'Deleted',
      8: 'Archived',
      9: 'Testing',
      10: 'Released',
      11: 'Ready For Review',
      12: 'Deprecated',
      13: 'Baking',
      14: 'Awaiting Publishing',
      15: 'Failed Publishing'
    };

    return statusMap[status] || 'Unknown';
  }
}

export default ModpackValidationService;
