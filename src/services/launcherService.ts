import { invoke } from '@tauri-apps/api/core';
import axios from 'axios';
import type { 
  ModpacksData, 
  InstanceMetadata, 
  UserSettings, 
  ModpackStatus,
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
  private modpacksData: ModpacksData | null = null;
  // uiTranslations removed (deprecated)
  private userSettings: UserSettings;
  private readonly API_BASE_URL = 'https://api.luminakraft.com';
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTTL = 15 * 60 * 1000; // 15 minutes for all modpack data
  // translationsTTL removed (deprecated)
  private readonly requestTimeout = 30000; // 30 seconds

  constructor() {
    this.userSettings = this.loadUserSettings();
    this.setupAxiosDefaults();
    // Remove legacy launcherDataUrl from localStorage if present
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('LuminaKraftLauncher_settings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if ('launcherDataUrl' in parsed) {
            delete parsed.launcherDataUrl; // removed, endpoint is hardcoded
            localStorage.setItem('LuminaKraftLauncher_settings', JSON.stringify(parsed));
          }
        } catch {
          // Ignore JSON parsing errors for legacy settings
        }
      }
    }
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
        const msAccount = this.userSettings?.microsoftAccount;
        const msToken = msAccount?.accessToken;
        const offlineToken = this.userSettings?.clientToken;
        const baseUrl = this.API_BASE_URL;
        const url = config.url || '';

        console.log(`[LauncherService] Interceptor - URL: ${url}, baseUrl: ${baseUrl}`);

        // Attach auth header only for our API base URL
        if (url.startsWith(baseUrl)) {
          // Initialize headers if they don't exist
          if (!config.headers) {
            config.headers = {} as any;
          }

          // Check if Microsoft token is expired
          const isTokenExpired = msAccount && msAccount.exp < Math.floor(Date.now() / 1000);

          if (msToken && !isTokenExpired) {
            config.headers['Authorization'] = `Bearer ${msToken}`;
            console.log(`[LauncherService] ✅ Using Microsoft token for request: ${url}`);
            console.log(`[LauncherService] Token preview: ${msToken.substring(0, 20)}...`);
          } else if (offlineToken) {
            config.headers['x-lk-token'] = offlineToken;
            console.log(`[LauncherService] ✅ Using offline token for request: ${url}`);
            console.log(`[LauncherService] Token preview: ${offlineToken.substring(0, 8)}...`);

            if (isTokenExpired) {
              console.warn(`[LauncherService] ⚠️ Microsoft token is expired. Using offline token instead. Please refresh your Microsoft token in settings.`);
            }
          } else {
            console.error(`[LauncherService] ❌ No valid authentication token available for request: ${url}`);
          }

          config.headers['x-luminakraft-client'] = 'luminakraft-launcher';
          console.log(`[LauncherService] Final headers (Authorization: ${!!config.headers['Authorization']}, x-lk-token: ${!!config.headers['x-lk-token']})`);
        } else {
          console.log(`[LauncherService] No auth headers added - URL ${url} doesn't match baseUrl ${baseUrl}`);
        }
      } catch (error) {
        console.error('[LauncherService] Error in request interceptor:', error);
      }
      return config;
    });

    // Add response interceptor to handle auth errors
    axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          const url = error.config?.url || '';
          const detail = error.response?.data?.detail || '';

          console.error(`[LauncherService] 401 Unauthorized for ${url}`);
          console.error(`[LauncherService] API Response: ${detail}`);

          // Check if we sent a Microsoft token
          const sentAuth = error.config?.headers?.['Authorization'];
          const sentLKToken = error.config?.headers?.['x-lk-token'];

          console.error(`[LauncherService] Sent Authorization header: ${!!sentAuth}`);
          console.error(`[LauncherService] Sent x-lk-token header: ${!!sentLKToken}`);

          if (sentAuth && detail.includes('Invalid Microsoft token')) {
            console.error('[LauncherService] Microsoft token is invalid or expired. Please re-authenticate.');
          } else if (!sentAuth && !sentLKToken) {
            console.error('[LauncherService] No authentication headers were sent to the API');
          }
        }
        return Promise.reject(error);
      }
    );
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
    return this.API_BASE_URL;
  }

  private getFallbackData(): ModpacksData {
    return {
      modpacks: []
    };
  }

  /**
   * Fetches the lightweight modpacks data for browsing (new API: /v1/modpacks?lang=)
   * Caches under 'modpacks_data' for clarity.
   */
  async fetchModpacksData(): Promise<ModpacksData> {
    try {
      const lang = this.userSettings.language || 'en';
      const cacheKey = `modpacks_data_${lang}`;
      const cached = this.cache.get(cacheKey);
      const persisted = this.readPersistentCache<ModpacksData>(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        this.modpacksData = cached.data;
        return cached.data;
      }
      if (persisted && Date.now() - persisted.timestamp < this.cacheTTL) {
        this.modpacksData = persisted.data;
        this.cache.set(cacheKey, { data: persisted.data, timestamp: persisted.timestamp });
        return persisted.data;
      }
      console.log('Fetching modpacks data from API...');
      const urlWithLang = `${this.API_BASE_URL}/v1/modpacks?lang=${lang}`;
      const response = await axios.get<{ count: number; modpacks: any[]; ui: any }>(urlWithLang, {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      this.modpacksData = { modpacks: response.data.modpacks };
      this.cache.set(cacheKey, {
        data: this.modpacksData,
        timestamp: Date.now()
      });
      this.writePersistentCache(cacheKey, this.modpacksData);
      if (this.modpacksData.modpacks && this.modpacksData.modpacks.length > 0) {
        this.cacheModpackImages(this.modpacksData.modpacks).catch((error: any) => {
          console.warn('Failed to cache modpack images:', error);
        });
      }
      console.log('Modpacks data loaded successfully');
      return this.modpacksData;
    } catch (error) {
      console.error('Error fetching modpacks data:', error);
      const lang = this.userSettings.language || 'en';
      const cacheKey = `modpacks_data_${lang}`;
      const cached2 = this.cache.get(cacheKey);
      if (cached2) {
        console.warn('Using cached modpacks data as fallback');
        this.modpacksData = cached2.data;
        return cached2.data;
      }
      const fallback = this.getFallbackData();
      this.modpacksData = fallback;
      return fallback;
    }
  }

  /**
   * Fetches and caches full details for a specific modpack (with language)
   * @param modpackId string
   */
  async fetchModpackDetails(modpackId: string): Promise<any> {
    const lang = this.userSettings.language || 'es';
    const cacheKey = `modpack_details_${modpackId}_${lang}`;
    const cached = this.cache.get(cacheKey);
    const persisted = this.readPersistentCache<any>(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    if (persisted && Date.now() - persisted.timestamp < this.cacheTTL) {
      this.cache.set(cacheKey, { data: persisted.data, timestamp: persisted.timestamp });
      return persisted.data;
    }
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/v1/modpacks/${modpackId}?lang=${lang}`;
    try {
      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      this.cache.set(cacheKey, { data: response.data, timestamp: Date.now() });
      this.writePersistentCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching modpack details:', error);
      if (persisted) return persisted.data;
      return null;
    }
  }

  getModpacksData(): ModpacksData | null {
    return this.modpacksData;
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

      const modpack = this.modpacksData?.modpacks.find((m: any) => m.id === modpackId);
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

  // Helper function to ensure modpack has required fields, refreshing data if needed
  private async ensureModpackHasRequiredFields(modpackId: string): Promise<any> {
    let modpack = this.modpacksData?.modpacks.find((m: any) => m.id === modpackId);
    if (!modpack) {
      throw new Error('Modpack no encontrado');
    }

    // Check if modpack has modloaderVersion, if not, try to refresh data
    if (!modpack.modloaderVersion) {
      console.warn(`⚠️ Modpack ${modpackId} missing modloaderVersion, attempting to refresh data...`);
      try {
        // Clear cache and fetch fresh data
        this.clearCache();
        await this.fetchModpacksData();
        
        // Try to find the modpack again with fresh data
        modpack = this.modpacksData?.modpacks.find((m: any) => m.id === modpackId);
        
        if (!modpack) {
          throw new Error('Modpack no encontrado después de refrescar datos');
        }
        
        if (!modpack.modloaderVersion) {
          throw new Error(`Modpack ${modpackId} aún no tiene modloaderVersion después de refrescar. La API puede no estar actualizada.`);
        }
        
        console.log(`✅ Successfully refreshed modpack data for ${modpackId}`);
      } catch (refreshError) {
        console.error('Failed to refresh modpack data:', refreshError);
        throw new Error(`No se pudo obtener modloaderVersion para ${modpackId}. Intenta refrescar la aplicación.`);
      }
    }

    return modpack;
  }

  // Transform frontend modpack structure to backend-expected structure
  private transformModpackForBackend(modpack: any) {
    if (!modpack.modloaderVersion) {
      throw new Error(`Modpack ${modpack.id} is missing modloaderVersion field. Please refresh the modpack data.`);
    }

    const transformed = {
      id: modpack.id,
      nombre: modpack.name, // Transform 'name' to 'nombre'
      descripcion: modpack.description || '', // Add missing field
      version: modpack.version,
      minecraftVersion: modpack.minecraftVersion,
      modloader: modpack.modloader,
      modloaderVersion: modpack.modloaderVersion,
      logo: modpack.logo || '', // Use logo field directly
      urlModpackZip: modpack.urlModpackZip || '',
    };


    return transformed;
  }

  // Transform frontend UserSettings structure to backend-expected structure
  private transformUserSettingsForBackend(settings: UserSettings) {
    const transformed = {
      username: settings.username,
      allocatedRam: settings.allocatedRam, // Keep camelCase, backend should handle it
      language: settings.language || 'en',
      authMethod: settings.authMethod,
      microsoftAccount: settings.microsoftAccount || null,
      clientToken: settings.clientToken || null,
      enablePrereleases: settings.enablePrereleases || false,
      enableAnimations: settings.enableAnimations || true,
    };


    return transformed;
  }

  async installModpack(modpackId: string, _onProgress?: (_progress: ProgressInfo) => void): Promise<void> {
    const modpack = await this.ensureModpackHasRequiredFields(modpackId);

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
    const modpack = await this.ensureModpackHasRequiredFields(modpackId);

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

  async repairModpack(modpackId: string, _onProgress?: (_progress: ProgressInfo) => void): Promise<any[]> {
    // For repair, use installModpackWithFailedTracking to get detailed information
    // about any issues and show specific errors
    try {
      console.log(`🔧 Starting repair for modpack: ${modpackId}`);
      
      // Report initial progress specific to repair
      if (_onProgress) {
        _onProgress({
          percentage: 0,
          currentFile: '',
          downloadSpeed: '',
          eta: '',
          step: 'checking',
          generalMessage: 'Iniciando reparación...',
          detailMessage: 'Verificando estado del modpack'
        });
      }
      
      // Use installModpackWithFailedTracking to get detailed information
      const failedMods = await this.installModpackWithFailedTracking(modpackId, _onProgress);
      
      console.log(`✅ Repair completed for modpack: ${modpackId}`, { failedMods: failedMods.length });
      return failedMods;
      
    } catch (error) {
      console.error(`❌ Repair failed for modpack: ${modpackId}`, error);
      
      // Improve error message to be more specific about repair
      if (error instanceof Error) {
        const originalMessage = error.message;
        
        // If error is already specific, keep it
        if (originalMessage.includes('authentication') || 
            originalMessage.includes('forbidden') ||
            originalMessage.includes('network') ||
            originalMessage.includes('download') ||
            originalMessage.includes('extraction') ||
            originalMessage.includes('permission') ||
            originalMessage.includes('space') ||
            originalMessage.includes('java')) {
          throw error; // Keep specific error
        }
        
        // For generic errors, create a more useful message
        const repairError = new Error(`Error durante la reparación: ${originalMessage}`);
        repairError.stack = error.stack;
        throw repairError;
      }
      
      // For non-specific errors
      throw new Error(`Error durante la reparación del modpack: ${String(error)}`);
    }
  }



  // Método para limpiar caché manualmente
  clearCache(): void {
    this.cache.clear();
    // Remove all LK_CACHE:* keys from localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('LK_CACHE:')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }
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
    const modpack = await this.ensureModpackHasRequiredFields(modpackId);

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