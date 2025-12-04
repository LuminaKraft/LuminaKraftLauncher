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
}

// Listen for messages from the main thread
self.onmessage = async (event: MessageEvent) => {
  try {
    const { file, modsInfo } = event.data;

    // Load and parse ZIP
    const zip = await JSZip.loadAsync(file);

    // Extract manifest.json
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      self.postMessage({
        success: false,
        modsWithoutUrl: [],
        modsInOverrides: [],
        error: 'No manifest.json found in ZIP file'
      } as ValidationResult);
      return;
    }

    const manifestText = await manifestFile.async('text');
    const manifest: ModpackManifest = JSON.parse(manifestText);

    // Find mods without download URL
    const modsWithoutUrl = modsInfo.filter((mod: ModFileInfo) => !mod.downloadUrl || mod.downloadUrl === '');

    // Check which mods are in overrides/mods/
    const modsInOverridesList: string[] = [];
    for (const mod of modsWithoutUrl) {
      const filePath = `overrides/mods/${mod.fileName}`;
      if (zip.file(filePath)) {
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
  } catch (error) {
    self.postMessage({
      success: false,
      modsWithoutUrl: [],
      modsInOverrides: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    } as ValidationResult);
  }
};
