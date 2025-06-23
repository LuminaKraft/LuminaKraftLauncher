export interface LauncherData {
  launcherVersion: string;
  launcherDownloadUrls: {
    windows: string;
    macos: string;
    linux: string;
  };
  modpacks: Modpack[];
}

export interface Modpack {
  id: string;
  name: string;
  version: string;
  minecraftVersion: string;
  modloader: 'forge' | 'fabric' | 'neoforge' | 'paper' | 'vanilla';
  modloaderVersion: string;
  gamemode: string;
  isNew: boolean;
  isActive: boolean;
  isComingSoon: boolean;
  images: string[];
  logo: string;
  urlIcono: string;
  featureIcons: string[];
  collaborators: Collaborator[];
  urlModpackZip: string | null;
  changelog: string;
  jvmArgsRecomendados: string;
  youtubeEmbed?: string;
  tiktokEmbed?: string;
  ip?: string;
  leaderboardPath?: string;
}

export interface Collaborator {
  name: string;
  logo: string;
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
  description: string;
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
  javaPath?: string;
  launcherDataUrl: string;
  language: string; // 'es' | 'en'
  authMethod: 'offline' | 'microsoft';
  microsoftAccount?: MicrosoftAccount;
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

export type ModpackStatus = 'not_installed' | 'installed' | 'outdated' | 'installing' | 'updating' | 'launching' | 'error';

export interface ProgressHistoryEntry {
  percentage: number;
  timestamp: number;
}

export interface ModpackState {
  status: ModpackStatus;
  progress?: DownloadProgress;
  error?: string;
  translations?: {
    name: string;
    description: string;
    shortDescription: string;
  };
  features?: Feature[];
  progressHistory?: ProgressHistoryEntry[];
  lastEtaSeconds?: number; // Para suavizado del cálculo de ETA
}

export interface FailedMod {
  projectId: number;
  fileId: number;
  fileName?: string;
} 