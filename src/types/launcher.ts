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
  nombre: string;
  descripcion: string;
  version: string;
  minecraftVersion: string;
  modloader: 'forge' | 'fabric' | 'quilt' | 'neoforge';
  modloaderVersion: string;
  urlIcono: string;
  urlModpackZip: string;
  changelog: string;
  jvmArgsRecomendados: string;
}

export interface InstanceMetadata {
  id: string;
  version: string;
  installedAt: string;
  modloader: string;
  modloaderVersion: string;
  minecraftVersion: string;
}

export interface UserSettings {
  username: string;
  allocatedRam: number; // in GB
  javaPath?: string;
  launcherDataUrl: string;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
  speed: number; // bytes per second
}

export type ModpackStatus = 'not_installed' | 'installed' | 'outdated' | 'installing' | 'updating' | 'launching' | 'error';

export interface ModpackState {
  status: ModpackStatus;
  progress?: DownloadProgress;
  error?: string;
} 