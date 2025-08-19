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
  Modpack,
  ProgressInfo
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
  private uiTranslations: any = null; // Store UI translations from API
  private userSettings: UserSettings;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes for main modpacks data
  private readonly translationsTTL = 60 * 60 * 1000; // 1 hour for translations
  private readonly requestTimeout = 30000; // 30 seconds

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
    axios.interceptors.request.use((config) => {
      try {
        const msToken = this.userSettings?.microsoftAccount?.accessToken;
        const offlineToken = this.userSettings?.clientToken;
        const baseUrl = this.getBaseUrl();
        const url = config.url || '';
        // Attach auth header only for our API base URL
        if (url.startsWith(baseUrl) || url.startsWith(this.userSettings.launcherDataUrl)) {
          config.headers = config.headers || {};
          if (msToken) {
            (config.headers as any)['Authorization'] = `Bearer ${msToken}`;
            console.log(`[LauncherService] Added Microsoft token to request: ${url}`);
          } else if (offlineToken) {
            (config.headers as any)['x-lk-token'] = offlineToken;
            console.log(`[LauncherService] Added offline token to request: ${url}`);
          }
          (config.headers as any)['x-luminakraft-client'] = 'luminakraft-launcher';
        } else {
          console.log(`[LauncherService] No auth headers added - URL ${url} doesn't match baseUrl ${baseUrl}`);
        }
      } catch (_) {
        // noop
      }
      return config;
    });
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
      launcherDataUrl: 'https://api.luminakraft.com/v1/modpacks?lang=es',
      language: this.detectDefaultLanguage(),
      authMethod: 'offline',
      clientToken: undefined
    };

    try {
      const saved = localStorage.getItem('LuminaKraftLauncher_settings');
      if (saved) {
        const merged = { ...defaultSettings, ...JSON.parse(saved) } as UserSettings;
        if (!merged.clientToken) {
          merged.clientToken = this.generateClientToken();
          localStorage.setItem('LuminaKraftLauncher_settings', JSON.stringify(merged));
        }
        return merged;
      }
    } catch (error) {
      console.error('Error loading user settings:', error);
    }

    // Ensure we have a client token for offline auth
    defaultSettings.clientToken = this.generateClientToken();
    try {
      localStorage.setItem('LuminaKraftLauncher_settings', JSON.stringify(defaultSettings));
    } catch {
      // Ignore localStorage errors in non-browser environments
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

  public getBaseUrl(): string {
    return this.userSettings.launcherDataUrl.replace(/\/v1\/modpacks.*$/, '');
  }

  private getFallbackData(): LauncherData {
    return {
      modpacks: []
    };
  }

  /**
   * Fetches the lightweight modpacks data for browsing (new API: /v1/modpacks?lang=)
   * Caches under 'modpacks_data' for clarity.
   */
  async fetchLauncherData(): Promise<LauncherData> {
    try {
      const cacheKey = 'modpacks_data';
      const cached = this.cache.get(cacheKey);
      const persisted = this.readPersistentCache<LauncherData>(cacheKey);
      // Check cache
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        this.launcherData = cached.data;
        return cached.data;
      }
      if (persisted && Date.now() - persisted.timestamp < this.cacheTTL) {
        this.launcherData = persisted.data;
        // hydrate in-memory cache for faster subsequent access
        this.cache.set(cacheKey, { data: persisted.data, timestamp: persisted.timestamp });
        return persisted.data;
      }

      console.log('Fetching modpacks data from API...');
      // Update URL to include current language
      const currentLang = this.userSettings.language || 'es';
      const urlWithLang = this.userSettings.launcherDataUrl.includes('?') 
        ? this.userSettings.launcherDataUrl.replace(/[?&]lang=[^&]*/, `?lang=${currentLang}`)
        : `${this.userSettings.launcherDataUrl}?lang=${currentLang}`;

      const response = await axios.get<{ count: number; modpacks: any[]; ui: any }>(urlWithLang, {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      this.launcherData = { modpacks: response.data.modpacks };
      this.uiTranslations = response.data.ui; // Store UI translations

      // Save to cache
      this.cache.set(cacheKey, {
        data: this.launcherData,
        timestamp: Date.now()
      });
      this.writePersistentCache(cacheKey, this.launcherData);

      // Cache modpack images automatically in background
      if (this.launcherData.modpacks && this.launcherData.modpacks.length > 0) {
        this.cacheModpackImages(this.launcherData.modpacks).catch((error: any) => {
          console.warn('Failed to cache modpack images:', error);
        });
      }

      console.log('Modpacks data loaded successfully');
      return this.launcherData;
    } catch (error) {
      console.error('Error fetching modpacks data:', error);

      // Try to use cached data as fallback
      const cached2 = this.cache.get('modpacks_data');
      if (cached2) {
        console.warn('Using cached modpacks data as fallback');
        this.launcherData = cached2.data;
        return cached2.data;
      }

      // Last resort: fallback data
      console.warn('Using fallback modpacks data');
      const fallback = this.getFallbackData();
      this.launcherData = fallback;
      return fallback;
    }
  }

  async getAvailableLanguages(): Promise<AvailableLanguages> {
    try {
      const cacheKey = 'available_languages';
      const cached = this.cache.get(cacheKey);
      const persisted = this.readPersistentCache<AvailableLanguages>(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.translationsTTL) {
        return cached.data;
      }
      if (persisted && Date.now() - persisted.timestamp < this.translationsTTL) {
        this.cache.set(cacheKey, persisted);
        return persisted.data;
      }

      const baseUrl = this.getBaseUrl();
      const response = await axios.get<AvailableLanguages>(`${baseUrl}/v1/translations`);
      
      this.cache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now()
      });
      this.writePersistentCache(cacheKey, response.data);

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
    // UI translations are now included in the modpacks response
    // Return them from memory if available, otherwise fallback to individual API call
    if (this.uiTranslations) {
      // Create a minimal translations object with UI translations
      return {
        modpacks: {}, // Modpack translations are embedded in modpack objects
        features: {}, // Features need individual API calls
        ui: this.uiTranslations
      } as Translations;
    }
    
    // Fallback to individual API call if not available
    try {
      const lang = language || this.userSettings.language;
      const baseUrl = this.getBaseUrl();
      const response = await axios.get<Translations>(`${baseUrl}/v1/translations/${lang}`);
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
      const persisted = this.readPersistentCache<ModpackFeatures>(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.translationsTTL) {
        return cached.data;
      }
      if (persisted && Date.now() - persisted.timestamp < this.translationsTTL) {
        this.cache.set(cacheKey, persisted);
        return persisted.data;
      }

      const baseUrl = this.getBaseUrl();
      const response = await axios.get<ModpackFeatures>(`${baseUrl}/v1/modpacks/${modpackId}/features/${lang}`);
      
      this.cache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now()
      });
      this.writePersistentCache(cacheKey, response.data);

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

      // Get full modpack details with individual API call
      const baseUrl = this.getBaseUrl();
      const [modpackDetails, features] = await Promise.all([
        axios.get(`${baseUrl}/v1/modpacks/${modpackId}`),
        this.getModpackFeatures(modpackId)
      ]);

      return {
        modpack: modpackDetails.data,
        translations: {
          name: modpack.name,
          shortDescription: modpack.shortDescription || '',
          description: modpack.description || ''
        },
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
      // urlIcono field removed
      urlModpackZip: modpack.urlModpackZip || '',
    };
  }

  // Transform frontend UserSettings structure to backend-expected structure
  private transformUserSettingsForBackend(settings: UserSettings) {
    return {
      username: settings.username,
      allocatedRam: settings.allocatedRam, // Keep camelCase, backend should handle it
      launcherDataUrl: settings.launcherDataUrl,
      authMethod: settings.authMethod,
      microsoftAccount: settings.microsoftAccount || null
      // Note: Don't send language to backend as it's frontend-only
    };
  }

  async installModpack(modpackId: string, _onProgress?: (_progress: ProgressInfo) => void): Promise<void> {
    const modpack = this.launcherData?.modpacks.find(m => m.id === modpackId);
    if (!modpack) {
      throw new Error('Modpack no encontrado');
    }

    if (!modpack.urlModpackZip) {
      throw new Error('Este servidor no requiere instalación de modpack');
    }

    try {
      // Set up progress listener if callback provided
      let unlistenProgress: (() => void) | null = null;
      
      if (isTauriContext()) {
        const { listen } = await import('@tauri-apps/api/event');
        unlistenProgress = await listen(
          `modpack_progress_${modpackId}`,
          (_event: any) => {
            const data = _event.payload;
            if (data) {
              // Filtrar mensajes que no deben aparecer en currentFile
              let currentFile = '';
              if (data.detailMessage) {
                currentFile = data.detailMessage;
              } else if (data.message && !data.message.startsWith('downloading_modpack:')) {
                currentFile = data.message;
              }
              
              _onProgress?.({
                percentage: data.percentage || 0,
                currentFile: currentFile,
                downloadSpeed: data.downloadSpeed || '',
                eta: data.eta || '', // ETA del backend (por ahora vacío, se calcula en frontend)
                step: data.step || '',
                generalMessage: data.generalMessage || '',
                detailMessage: data.detailMessage || ''
              });
            }
          }
        );
    }

    try {
      // Transform the modpack structure to match backend expectations
      const transformedModpack = this.transformModpackForBackend(modpack);
      const transformedSettings = this.transformUserSettingsForBackend(this.userSettings);
      
      await safeInvoke('install_modpack_with_minecraft', {
        modpack: transformedModpack,
        settings: transformedSettings
      });
      } finally {
        // Clean up event listener
        if (unlistenProgress) {
          unlistenProgress();
        }
      }
    } catch (error) {
      if (!isTauriContext()) {
        throw new Error('Esta función requiere ejecutar la aplicación con Tauri. Por favor, usa "npm run tauri:dev" en lugar de "npm run dev".');
      }
      console.error('Error installing modpack:', error);
      throw new Error('Error al instalar el modpack');
    }
  }

  async updateModpack(modpackId: string, _onProgress?: (_progress: ProgressInfo) => void): Promise<any[]> {
    // Las actualizaciones usan la misma función que instalación con tracking de fallos
    // pero el backend detecta automáticamente si es instalación inicial o actualización
    return this.installModpackWithFailedTracking(modpackId, _onProgress);
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
      if (error instanceof Error) {
        throw error; // Propagate original error message
      }
      throw new Error('Error al lanzar el modpack');
    }
  }

  async repairModpack(modpackId: string, _onProgress?: (_progress: ProgressInfo) => void): Promise<void> {
    // Para reparación, simplemente reinstalamos el modpack
    return this.installModpack(modpackId, _onProgress);
  }



  // Método para limpiar caché manualmente
  clearCache(): void {
    this.cache.clear();
    // Persisted cache remains; caller may want to clear it explicitly
  }

  // ---- Persistent cache helpers (localStorage) ----
  private readPersistentCache<T = any>(key: string): CacheEntry<T> | null {
    try {
      const raw = localStorage.getItem(`LK_CACHE:${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.timestamp === 'number' && 'data' in parsed) {
        return parsed as CacheEntry<T>;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  private writePersistentCache<T = any>(key: string, data: T): void {
    try {
      const entry: CacheEntry<T> = { data, timestamp: Date.now() };
      localStorage.setItem(`LK_CACHE:${key}`, JSON.stringify(entry));
    } catch (_) {
      // ignore
    }
  }

  private generateClientToken(): string {
    // Generate URL-safe random token
    const bytes = new Uint8Array(24);
    if (typeof crypto !== 'undefined' && (crypto as any).getRandomValues) {
      (crypto as any).getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

  async removeModpack(modpackId: string): Promise<void> {
    try {
      console.log('🔧 LauncherService: Removing modpack', modpackId);
      await safeInvoke('remove_modpack', { modpackId });
      console.log('✅ LauncherService: Modpack removed successfully');
    } catch (error) {
      console.error('❌ LauncherService: Error removing modpack:', error);
      if (!isTauriContext()) {
        throw new Error('Esta función requiere ejecutar la aplicación con Tauri. Por favor, usa "npm run tauri:dev" en lugar de "npm run dev".');
      }
      console.error('Error removing modpack:', error);
      throw new Error('Error al remover el modpack');
    }
  }

  async openInstanceFolder(modpackId: string): Promise<void> {
    try {
      console.log('📂 LauncherService: Opening instance folder for', modpackId);
      await safeInvoke('open_instance_folder', { modpackId });
      console.log('✅ LauncherService: Instance folder opened successfully');
    } catch (error) {
      console.error('❌ LauncherService: Error opening instance folder:', error);
      if (!isTauriContext()) {
        throw new Error('Esta función requiere ejecutar la aplicación con Tauri. Por favor, usa "npm run tauri:dev" en lugar de "npm run dev".');
      }
      console.error('Error opening instance folder:', error);
      throw new Error('Error al abrir la carpeta de la instancia');
    }
  }

  async installModpackWithFailedTracking(modpackId: string, _onProgress?: (_progress: ProgressInfo) => void): Promise<any[]> {
    const modpack = this.launcherData?.modpacks.find(m => m.id === modpackId);
    if (!modpack) {
      throw new Error('Modpack no encontrado');
    }

    let unlistenProgress: (() => void) | undefined;

    // Configurar listener de progreso si se proporciona callback
    if (_onProgress && isTauriContext()) {
      const { listen } = await import('@tauri-apps/api/event');
      
      unlistenProgress = await listen(
        `modpack-progress-${modpackId}`,
        (_event: any) => {
          const data = _event.payload;
          if (data) {
            // Filtrar mensajes que no deben aparecer en currentFile
            let currentFile = '';
            if (data.detailMessage) {
              currentFile = data.detailMessage;
            } else if (data.message && !data.message.startsWith('downloading_modpack:')) {
              currentFile = data.message;
            }
            
            _onProgress({
              percentage: data.percentage || 0,
              currentFile: currentFile,
              downloadSpeed: data.downloadSpeed || '',
              eta: data.eta || '', // ETA del backend (por ahora vacío, se calcula en frontend)
              step: data.step || '',
              generalMessage: data.generalMessage || '',
              detailMessage: data.detailMessage || ''
            });
          }
        }
      );
    }

    try {
      // Transform the modpack structure to match backend expectations
      const transformedModpack = this.transformModpackForBackend(modpack);
      const transformedSettings = this.transformUserSettingsForBackend(this.userSettings);
      
      const failedMods = await safeInvoke<any[]>('install_modpack_with_failed_tracking', {
        modpack: transformedModpack,
        settings: transformedSettings
      });
      
      return failedMods;
    } finally {
      // Clean up event listener
      if (unlistenProgress) {
        unlistenProgress();
      }
    }
  }

  private async cacheModpackImages(modpacks: any[]): Promise<void> {
    if (!isTauriContext()) {
      return; // Skip caching in browser environment
    }

    try {
      await safeInvoke('cache_modpack_images_command', { modpacks });
      console.log('Modpack images cached successfully');
    } catch (error) {
      console.error('Failed to cache modpack images:', error);
      throw error;
    }
  }

  async stopInstance(instanceId: string): Promise<void> {
    if (!isTauriContext()) {
      throw new Error('This function requires running the application with Tauri.');
    }
    try {
      await safeInvoke('stop_instance', { instanceId });
    } catch (error) {
      console.error('Error stopping instance:', error);
      throw new Error('Error stopping instance');
    }
  }

  // Java-specific helper methods removed – Lyceris handles runtimes automatically.
}

export default LauncherService; 