/**
 * Tipos para la integración de CurseForge
 */

/**
 * Estructura del archivo manifest.json en los modpacks exportados de CurseForge
 */
export interface CurseForgeManifest {
  minecraft: {
    version: string;
    modLoaders: CurseForgeModLoader[];
    recommendedRam?: number; // Recommended RAM in MB
  };
  manifestType: string;
  manifestVersion: number;
  name: string;
  version: string;
  author: string;
  files: CurseForgeFile[];
  overrides: string;
}

export interface CurseForgeModLoader {
  id: string;  // Ejemplo: "forge-40.2.0"
  primary: boolean;
}

export interface CurseForgeFile {
  projectID: number;
  fileID: number;
  required: boolean;
}

/**
 * Estructura de la respuesta de la API de CurseForge para un mod
 */
export interface CurseForgeModInfo {
  id: number;
  gameId: number;
  name: string;
  slug: string;
  links: {
    websiteUrl: string;
    wikiUrl?: string;
    issuesUrl?: string;
    sourceUrl?: string;
  };
  summary: string;
  downloadCount: number;
  categories: {
    id: number;
    name: string;
    url: string;
  }[];
  logo?: {
    id: number;
    url: string;
  };
  latestFiles: CurseForgeFileInfo[];
}

export interface CurseForgeFileInfo {
  id: number;
  gameId: number;
  modId: number;
  displayName: string;
  fileName: string;
  downloadUrl: string;
  fileDate: string;
  fileLength: number;
  downloadCount: number;
  fileStatus: number;
  gameVersions: string[];
  hashes: CurseForgeFileHash[];
}

export interface CurseForgeFileHash {
  value: string;
  algo: number; // 1 = SHA1, 2 = MD5
}

/**
 * Estructura de la respuesta del proxy de la API de CurseForge
 */
export interface ProxyResponse {
  data: any;
  status: number;
  message?: string;
} 