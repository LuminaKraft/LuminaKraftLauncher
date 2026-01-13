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

    // Try to find manifest (CurseForge or Modrinth)
    const curseforgeManifestFile = zip.file('manifest.json');
    const modrinthManifestFile = zip.file('modrinth.index.json');

    // Modrinth modpacks have direct download URLs in the manifest, no validation needed
    if (modrinthManifestFile) {
      const manifestText = await modrinthManifestFile.async('text');
      const manifest = JSON.parse(manifestText);

      // Return success - Modrinth modpacks don't need CurseForge-style validation
      self.postMessage({
        success: true,
        manifest: {
          name: manifest.name,
          version: manifest.versionId || '1.0.0',
          minecraft: {
            version: manifest.dependencies?.minecraft || '1.20.1',
            modLoaders: []
          },
          files: [] // Modrinth files have direct URLs, no projectID/fileID
        },
        modsWithoutUrl: [],
        modsInOverrides: [],
        fileIds: [],
        isModrinth: true
      } as ValidationResult);
      return;
    }

    // CurseForge format
    if (!curseforgeManifestFile) {
      self.postMessage({
        success: false,
        modsWithoutUrl: [],
        modsInOverrides: [],
        fileIds: [],
        error: 'No manifest found in ZIP file (expected manifest.json or modrinth.index.json)'
      } as ValidationResult);
      return;
    }

    const manifestText = await curseforgeManifestFile.async('text');
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
