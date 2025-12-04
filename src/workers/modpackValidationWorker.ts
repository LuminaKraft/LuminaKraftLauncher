// Web Worker for processing large ZIP files without blocking the UI
import JSZip from 'jszip';

interface ModpackManifest {
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

interface ModFileInfo {
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

interface ValidationResult {
  success: boolean;
  manifest?: ModpackManifest;
  modsWithoutUrl: ModFileInfo[];
  modsInOverrides: string[];
  error?: string;
  fileIds?: number[];
}

interface ValidationRequest {
  file: File;
  modsInfo?: ModFileInfo[];
  getFileIds?: boolean;
}

// Listen for messages from the main thread
self.onmessage = async (event: MessageEvent<ValidationRequest>) => {
  try {
    const { file, modsInfo, getFileIds } = event.data;

    // Load and parse ZIP
    const zip = await JSZip.loadAsync(file);

    // Extract manifest.json
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      self.postMessage({
        success: false,
        modsWithoutUrl: [],
        modsInOverrides: [],
        fileIds: [],
        error: 'No manifest.json found in ZIP file'
      } as ValidationResult);
      return;
    }

    const manifestText = await manifestFile.async('text');
    const manifest: ModpackManifest = JSON.parse(manifestText);

    // If only getting file IDs, return early
    if (getFileIds) {
      const fileIds = manifest.files.map(f => f.fileID);
      self.postMessage({
        success: true,
        manifest,
        modsWithoutUrl: [],
        modsInOverrides: [],
        fileIds
      } as ValidationResult);
      return;
    }

    // If we have modsInfo, find which ones don't have URLs and check overrides
    if (modsInfo && modsInfo.length > 0) {
      const modsWithoutUrl = modsInfo.filter((mod: ModFileInfo) => !mod.downloadUrl || mod.downloadUrl === '');

      // Check which mods and resourcepacks are in overrides/
      const modsInOverridesList: string[] = [];
      for (const mod of modsWithoutUrl) {
        const modsFilePath = `overrides/mods/${mod.fileName}`;
        const resourcepackFilePath = `overrides/resourcepacks/${mod.fileName}`;
        if (zip.file(modsFilePath) || zip.file(resourcepackFilePath)) {
          modsInOverridesList.push(mod.fileName);
        }
      }

      // Send result back to main thread
      self.postMessage({
        success: true,
        manifest,
        modsWithoutUrl,
        modsInOverrides: modsInOverridesList
      } as ValidationResult);
    } else {
      // Return manifest and file IDs only
      const fileIds = manifest.files.map(f => f.fileID);
      self.postMessage({
        success: true,
        manifest,
        modsWithoutUrl: [],
        modsInOverrides: [],
        fileIds
      } as ValidationResult);
    }
  } catch (error) {
    self.postMessage({
      success: false,
      modsWithoutUrl: [],
      modsInOverrides: [],
      fileIds: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    } as ValidationResult);
  }
};
