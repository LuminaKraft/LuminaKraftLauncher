export interface ModpacksData {
  modpacks: Modpack[];
}

export interface Modpack {
  id: string;
  name: string;
  description?: string;
  shortDescription?: string; // From translations in lightweight response
  version: string;
  minecraftVersion: string;
  modloader: string;
  logo: string;
  backgroundImage: string; // First image from images array
  banner?: string;
  images?: string[]; // Array of screenshot URLs
  gamemode?: string;
  ip?: string;
  isNew?: boolean;
  isActive?: boolean;
  isComingSoon?: boolean;
  downloads?: number;
  playTime?: number;
  players?: number;
  collaborators?: Collaborator[];
  urlModpackZip?: string;
  primaryColor?: string; // Hex color for gradient backgrounds
}

export interface Collaborator {
  name: string;
  role?: string;
  avatar?: string;
}

export interface Translations {
  modpacks: {
    [modpackId: string]: {
      name: string;
      description: string;
      shortDescription: string;
    };
  };
  ui: {
    status: {
      new: string;
      active: string;
      coming_soon: string;
      inactive: string;
    };
    modloader: {
      [key: string]: string;
    };
    gamemode: {
      [key: string]: string;
    };
  };
}

export interface ModpackFeatures {
  modpackId: string;
  language: string;
  features: Feature[];
}

export interface Feature {
  title: string;
  description?: string;
}

export interface AvailableLanguages {
  availableLanguages: string[];
  defaultLanguage: string;
}

export interface InstanceMetadata {
  id: string;
  version: string;
  installedAt: string;
  modloader: string;
  modloaderVersion: string;
  minecraftVersion: string;
}

export interface MicrosoftAccount {
  xuid: string;
  exp: number;
  uuid: string;
  username: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
}

export interface UserSettings {
  username: string;
  allocatedRam: number; // in GB
  // launcherDataUrl removed, endpoint is now hardcoded
  language: string; // 'es' | 'en'
  authMethod: 'offline' | 'microsoft';
  microsoftAccount?: MicrosoftAccount;
  enablePrereleases?: boolean;
  enableAnimations?: boolean;
  clientToken?: string; // launcher-generated token to authenticate offline users
}

export interface ProgressInfo {
  downloaded?: number;
  total?: number;
  percentage: number;
  speed?: number; // bytes per second
  currentFile?: string; // nombre del archivo que se está descargando o descripción del paso
  downloadSpeed?: string; // velocidad formateada (ej: "2.5 MB/s")
  eta?: string; // tiempo estimado restante (ej: "2m 30s")
  step?: string; // paso actual: 'checking', 'downloading', 'processing', etc.
  generalMessage?: string; // mensaje general para mostrar arriba (más estático)
  detailMessage?: string; // mensaje detallado para mostrar abajo (más específico)
}

// Mantener DownloadProgress por compatibilidad
export type DownloadProgress = ProgressInfo;

export type ModpackStatus = 
  | 'not_installed'
  | 'installed'
  | 'outdated'
  | 'installing'
  | 'updating'
  | 'launching'
  | 'running'
  | 'stopping'
  | 'error';

export interface ProgressHistoryEntry {
  percentage: number;
  timestamp: number;
}

export interface ModpackState {
  installed: boolean;
  downloading: boolean;
  progress: ProgressInfo;
  progressHistory?: ProgressHistoryEntry[];
  lastEtaSeconds?: number;
  translations?: {
    name?: string;
    description?: string;
    shortDescription?: string;
  };
  features?: Feature[];
  status: ModpackStatus;
  error?: string;
}

export interface ModpackTranslations {
  name?: string;
  description?: string;
}

export interface LauncherTranslations {
  ui: {
    modloader: {
      [key: string]: string;
    };
    status: {
      new: string;
      active: string;
      coming_soon: string;
      inactive: string;
    };
  };
}

export interface FailedMod {
  projectId: number;
  fileId: number;
  fileName?: string;
} 