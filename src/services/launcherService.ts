import { invoke } from '@tauri-apps/api/core';
import axios from 'axios';
import type { 
  LauncherData, 
  InstanceMetadata, 
  UserSettings, 
  ModpackStatus,
  Translations,
  ModpackFeatures,
  AvailableLanguages,
  Modpack 
} from '../types/launcher';

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}

// Helper function to check if we're running in Tauri context
function isTauriContext(): boolean {
  return typeof window !== 'undefined' && 
         (window as any).__TAURI_INTERNALS__ !== undefined;
}

// Helper function to safely invoke Tauri commands
async function safeInvoke<T>(command: string, payload?: any): Promise<T> {
  if (!isTauriContext()) {
    throw new Error('Tauri context not available. Please run the application with Tauri.');
  }
  return invoke<T>(command, payload);
}

class LauncherService {
  private static instance: LauncherService;
  private launcherData: LauncherData | null = null;
  private userSettings: UserSettings;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutos para datos principales
  private readonly translationsTTL = 60 * 60 * 1000; // 1 hora para traducciones
  private readonly requestTimeout = 10000; // 10 segundos

  constructor() {
    this.userSettings = this.loadUserSettings();
    this.setupAxiosDefaults();
  }

  static getInstance(): LauncherService {
    if (!LauncherService.instance) {
      LauncherService.instance = new LauncherService();
    }
    return LauncherService.instance;
  }

  private setupAxiosDefaults(): void {
    axios.defaults.timeout = this.requestTimeout;
    // Note: User-Agent header cannot be set in browsers for security reasons
    // Only set other headers that are allowed
  }

  private detectDefaultLanguage(): string {
    // Check if user has manually set a language preference
    const storedLanguage = localStorage.getItem('LuminaKraftLauncher-language');
    if (storedLanguage && ['es', 'en'].includes(storedLanguage)) {
      return storedLanguage;
    }

    // Detect browser language - same logic as i18n
    const browserLanguage = navigator.language || (navigator as any).languages?.[0];
    if (browserLanguage) {
      // If any Spanish variant (es, es-ES, es-MX, es-AR, etc.), use Spanish
      if (browserLanguage.toLowerCase().startsWith('es')) {
        return 'es';
      }
    }

    // Default to English for all other languages
    return 'en';
  }

  private loadUserSettings(): UserSettings {
    const defaultSettings: UserSettings = {
      username: 'Player',
      allocatedRam: 4,
      launcherDataUrl: 'https://api.luminakraft.com/v1/launcher_data.json',
      language: this.detectDefaultLanguage(),
      authMethod: 'offline'
    };

    try {
      const saved = localStorage.getItem('LuminaKraftLauncher_settings');
      if (saved) {
        return { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Error loading user settings:', error);
    }

    return defaultSettings;
  }

  saveUserSettings(settings: Partial<UserSettings>): void {
    this.userSettings = { ...this.userSettings, ...settings };
    localStorage.setItem('LuminaKraftLauncher_settings', JSON.stringify(this.userSettings));
  }

  getUserSettings(): UserSettings {
    return { ...this.userSettings };
  }

  async checkAPIHealth(): Promise<boolean> {
    try {
      const baseUrl = this.getBaseUrl();
      const response = await axios.get(`${baseUrl}/health`, {
        timeout: 5000
      });
      return response.data.status === 'ok';
    } catch (error) {
      console.error('API health check failed:', error);
      return false;
    }
  }

  private getBaseUrl(): string {
    return this.userSettings.launcherDataUrl.replace('/v1/launcher_data.json', '');
  }

  private getFallbackData(): LauncherData {
    return {
      launcherVersion: "1.0.0",
      launcherDownloadUrls: {
        windows: "https://github.com/luminakraft/luminakraft-launcher/releases/latest/download/LuminaKraft-Launcher_x64_en-US.msi",
        macos: "https://github.com/luminakraft/luminakraft-launcher/releases/latest/download/LuminaKraft-Launcher_x64.dmg",
        linux: "https://github.com/luminakraft/luminakraft-launcher/releases/latest/download/LuminaKraft-Launcher_amd64.AppImage"
      },
      modpacks: []
    };
  }

  async fetchLauncherData(): Promise<LauncherData> {
    try {
      const cacheKey = 'launcher_data';
      const cached = this.cache.get(cacheKey);
      
      // Verificar caché
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        this.launcherData = cached.data;
        return cached.data;
      }

      console.log('Fetching launcher data from API...');
      const response = await axios.get<LauncherData>(this.userSettings.launcherDataUrl, {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      this.launcherData = response.data;
      
      // Guardar en caché
      this.cache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now()
      });

      console.log('Launcher data loaded successfully');
      return response.data;
    } catch (error) {
      console.error('Error fetching launcher data:', error);
      
      // Intentar usar datos en caché como fallback
      const cached = this.cache.get('launcher_data');
      if (cached) {
        console.warn('Using cached data as fallback');
        this.launcherData = cached.data;
        return cached.data;
      }

      // Último recurso: datos de fallback
      console.warn('Using fallback data');
      const fallback = this.getFallbackData();
      this.launcherData = fallback;
      return fallback;
    }
  }

  async getAvailableLanguages(): Promise<AvailableLanguages> {
    try {
      const cacheKey = 'available_languages';
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.translationsTTL) {
        return cached.data;
      }

      const baseUrl = this.getBaseUrl();
      const response = await axios.get<AvailableLanguages>(`${baseUrl}/v1/translations`);
      
      this.cache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now()
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching available languages:', error);
      return {
        availableLanguages: ['es', 'en'],
        defaultLanguage: 'es'
      };
    }
  }

  async getTranslations(language?: string): Promise<Translations | null> {
    try {
      const lang = language || this.userSettings.language;
      const cacheKey = `translations_${lang}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.translationsTTL) {
        return cached.data;
      }

      const baseUrl = this.getBaseUrl();
      const response = await axios.get<Translations>(`${baseUrl}/v1/translations/${lang}`);
      
      this.cache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now()
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching translations:', error);
      return null;
    }
  }

  async getModpackFeatures(modpackId: string, language?: string): Promise<ModpackFeatures | null> {
    try {
      const lang = language || this.userSettings.language;
      const cacheKey = `features_${modpackId}_${lang}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.translationsTTL) {
        return cached.data;
      }

      const baseUrl = this.getBaseUrl();
      const response = await axios.get<ModpackFeatures>(`${baseUrl}/v1/modpacks/${modpackId}/features/${lang}`);
      
      this.cache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now()
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching modpack features:', error);
      return null;
    }
  }

  async getModpackWithTranslations(modpackId: string): Promise<{ modpack: Modpack; translations: any; features: any } | null> {
    try {
      if (!this.launcherData) {
        await this.fetchLauncherData();
      }

      const modpack = this.launcherData?.modpacks.find(m => m.id === modpackId);
      if (!modpack) {
        return null;
      }

      const [translations, features] = await Promise.all([
        this.getTranslations(),
        this.getModpackFeatures(modpackId)
      ]);

      return {
        modpack,
        translations: translations?.modpacks[modpackId] || null,
        features: features?.features || []
      };
    } catch (error) {
      console.error('Error getting modpack with translations:', error);
      return null;
    }
  }

  getLauncherData(): LauncherData | null {
    return this.launcherData;
  }

  async getModpackStatus(modpackId: string): Promise<ModpackStatus> {
    if (!isTauriContext()) {
      // When not in Tauri context, return default status
      return 'not_installed';
    }

    try {
      const metadata = await this.getInstanceMetadata(modpackId);
      if (!metadata) {
        return 'not_installed';
      }

      const modpack = this.launcherData?.modpacks.find(m => m.id === modpackId);
      if (!modpack) {
        return 'error';
      }

      if (metadata.version !== modpack.version) {
        return 'outdated';
      }

      return 'installed';
    } catch (error) {
      console.error(`Error getting status for modpack ${modpackId}:`, error);
      return 'error';
    }
  }

  async getInstanceMetadata(modpackId: string): Promise<InstanceMetadata | null> {
    try {
      const metadata = await safeInvoke<string>('get_instance_metadata', { modpackId });
      return metadata ? JSON.parse(metadata) : null;
    } catch (error) {
      if (!isTauriContext()) {
        console.warn('Tauri context not available for getting instance metadata');
        return null;
      }
      console.error('Error getting instance metadata:', error);
      return null;
    }
  }

  // Transform frontend modpack structure to backend-expected structure
  private transformModpackForBackend(modpack: any) {
    return {
      id: modpack.id,
      nombre: modpack.name, // Transform 'name' to 'nombre'
      descripcion: modpack.description || '', // Add missing field
      version: modpack.version,
      minecraftVersion: modpack.minecraftVersion,
      modloader: modpack.modloader,
      modloaderVersion: modpack.modloaderVersion,
      urlIcono: modpack.urlIcono || modpack.logo || '',
      urlModpackZip: modpack.urlModpackZip || '',
      changelog: modpack.changelog || '',
      jvmArgsRecomendados: modpack.jvmArgsRecomendados || ''
    };
  }

  // Transform frontend UserSettings structure to backend-expected structure
  private transformUserSettingsForBackend(settings: UserSettings) {
    return {
      username: settings.username,
      allocatedRam: settings.allocatedRam, // Keep camelCase, backend should handle it
      javaPath: settings.javaPath || null,
      launcherDataUrl: settings.launcherDataUrl,
      authMethod: settings.authMethod,
      microsoftAccount: settings.microsoftAccount || null
      // Note: Don't send language to backend as it's frontend-only
    };
  }

  async installModpack(modpackId: string, _onProgress?: (progress: number) => void): Promise<void> {
    const modpack = this.launcherData?.modpacks.find(m => m.id === modpackId);
    if (!modpack) {
      throw new Error('Modpack no encontrado');
    }

    if (!modpack.urlModpackZip) {
      throw new Error('Este servidor no requiere instalación de modpack');
    }

    try {
      // Transform the modpack structure to match backend expectations
      const transformedModpack = this.transformModpackForBackend(modpack);
      const transformedSettings = this.transformUserSettingsForBackend(this.userSettings);
      
      await safeInvoke('install_modpack_with_minecraft', {
        modpack: transformedModpack,
        settings: transformedSettings
      });
    } catch (error) {
      if (!isTauriContext()) {
        throw new Error('Esta función requiere ejecutar la aplicación con Tauri. Por favor, usa "npm run tauri:dev" en lugar de "npm run dev".');
      }
      console.error('Error installing modpack:', error);
      throw new Error('Error al instalar el modpack');
    }
  }

  async updateModpack(modpackId: string, onProgress?: (progress: number) => void): Promise<void> {
    return this.installModpack(modpackId, onProgress);
  }

  async launchModpack(modpackId: string): Promise<void> {
    const modpack = this.launcherData?.modpacks.find(m => m.id === modpackId);
    if (!modpack) {
      throw new Error('Modpack no encontrado');
    }

    try {
      // Transform the modpack structure to match backend expectations
      const transformedModpack = this.transformModpackForBackend(modpack);
      const transformedSettings = this.transformUserSettingsForBackend(this.userSettings);
      
      await safeInvoke('launch_modpack', {
        modpack: transformedModpack,
        settings: transformedSettings
      });
    } catch (error) {
      if (!isTauriContext()) {
        throw new Error('Esta función requiere ejecutar la aplicación con Tauri. Por favor, usa "npm run tauri:dev" en lugar de "npm run dev".');
      }
      console.error('Error launching modpack:', error);
      throw new Error('Error al lanzar el modpack');
    }
  }

  async repairModpack(modpackId: string, onProgress?: (progress: number) => void): Promise<void> {
    try {
      await safeInvoke('delete_instance', { modpackId });
      // The installModpack method already handles the transformation
      await this.installModpack(modpackId, onProgress);
    } catch (error) {
      if (!isTauriContext()) {
        throw new Error('Esta función requiere ejecutar la aplicación con Tauri. Por favor, usa "npm run tauri:dev" en lugar de "npm run dev".');
      }
      console.error('Error repairing modpack:', error);
      throw new Error('Error al reparar el modpack');
    }
  }

  async checkForLauncherUpdate(): Promise<{ hasUpdate: boolean; downloadUrl?: string }> {
    if (!this.launcherData) {
      return { hasUpdate: false };
    }

    if (!isTauriContext()) {
      // When not in Tauri context, can't check for updates
      return { hasUpdate: false };
    }

    try {
      const currentVersion = await safeInvoke<string>('get_launcher_version');
      const remoteVersion = this.launcherData.launcherVersion;

      if (this.isVersionNewer(remoteVersion, currentVersion)) {
        const platform = await safeInvoke<string>('get_platform');
        const downloadUrl = this.launcherData.launcherDownloadUrls[platform as keyof typeof this.launcherData.launcherDownloadUrls];
        
        return {
          hasUpdate: true,
          downloadUrl
        };
      }

      return { hasUpdate: false };
    } catch (error) {
      console.error('Error checking for launcher update:', error);
      return { hasUpdate: false };
    }
  }

  private isVersionNewer(remote: string, current: string): boolean {
    const parseVersion = (version: string) => version.split('.').map(Number);
    const remoteVersion = parseVersion(remote);
    const currentVersion = parseVersion(current);

    for (let i = 0; i < Math.max(remoteVersion.length, currentVersion.length); i++) {
      const remotePart = remoteVersion[i] || 0;
      const currentPart = currentVersion[i] || 0;

      if (remotePart > currentPart) return true;
      if (remotePart < currentPart) return false;
    }

    return false;
  }

  // Método para limpiar caché manualmente
  clearCache(): void {
    this.cache.clear();
  }

  // Método para obtener información de la API
  async getAPIInfo(): Promise<any> {
    try {
      const baseUrl = this.getBaseUrl();
      const response = await axios.get(`${baseUrl}/v1/info`);
      return response.data;
    } catch (error) {
      console.error('Error getting API info:', error);
      return null;
    }
  }

  // Método para cambiar idioma
  async changeLanguage(language: string): Promise<void> {
    this.userSettings.language = language;
    this.saveUserSettings({ language });
    
    // Actualizar localStorage para i18n
    localStorage.setItem('LuminaKraftLauncher-language', language);
    
    // Limpiar caché de traducciones y características para forzar recarga completa
    const keysToDelete = Array.from(this.cache.keys()).filter(key => 
      key.startsWith('translations_') || key.startsWith('features_')
    );
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  // Check if we're running in Tauri context
  isTauriAvailable(): boolean {
    return isTauriContext();
  }
}

export default LauncherService; 