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
  displayName: string;
  fileName: string;
  downloadUrl: string | null;
  fileStatus: number;
  isAvailable: boolean;
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
   * Validate a modpack ZIP file
   * - Parses manifest.json
   * - Checks which mods have empty downloadUrl
   * - Verifies if those mods are in overrides/mods/
   */
  async validateModpackZip(file: File): Promise<ValidationResult> {
    try {
      // Load ZIP file
      const zip = await JSZip.loadAsync(file);

      // Extract manifest.json
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

      // Query Supabase Edge Function to get mod file info
      const modsInfo = await this.fetchModsInfo(fileIds);

      // Find mods without download URL
      const modsWithoutUrl = modsInfo.filter(mod => !mod.downloadUrl || mod.downloadUrl === '');

      // Check which mods are in overrides/mods/
      const modsInOverrides = await this.checkModsInOverrides(zip, modsWithoutUrl);

      return {
        success: true,
        manifest,
        modsWithoutUrl,
        modsInOverrides
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
   * Fetch mod file information from CurseForge via Supabase Edge Function
   */
  private async fetchModsInfo(fileIds: number[]): Promise<ModFileInfo[]> {
    const BATCH_SIZE = 50;
    const allMods: ModFileInfo[] = [];

    // Process in batches
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
          allMods.push(...data.data);
        }
      } catch (error) {
        console.error('Error in batch fetch:', error);
      }
    }

    return allMods;
  }

  /**
   * Check which mods are present in overrides/mods/ folder
   */
  private async checkModsInOverrides(zip: JSZip, modsWithoutUrl: ModFileInfo[]): Promise<string[]> {
    const overrideModsPath = 'overrides/mods/';
    const modsInOverrides: string[] = [];

    // Get all files in overrides/mods/
    const overrideFiles = Object.keys(zip.files).filter(path =>
      path.startsWith(overrideModsPath) && path.endsWith('.jar')
    );

    // Extract just the filename from the full path
    const overrideFileNames = overrideFiles.map(path =>
      path.substring(overrideModsPath.length).toLowerCase()
    );

    // Check if each mod without URL is in overrides
    for (const mod of modsWithoutUrl) {
      const modFileName = mod.fileName.toLowerCase();
      if (overrideFileNames.includes(modFileName)) {
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
