import { invoke } from '@tauri-apps/api/core';
import axios from 'axios';
import { supabase } from './supabaseClient';
import i18next from 'i18next';
import AuthService from './authService';
import JSZip from 'jszip';
import { listen } from '@tauri-apps/api/event';
import type {
  ModpacksData,
  InstanceMetadata,
  UserSettings,
  ModpackStatus,
  ProgressInfo
} from '../types/launcher';

/**
 * Cache behaviour patterns inspired by Modrinth's approach:
 * - StaleWhileRevalidate: Return cached data immediately, revalidate in background
 * - MustRevalidate: Force revalidation if cache is expired
 * - Bypass: Skip cache entirely, always fetch fresh
 */
export enum CacheBehaviour {
  StaleWhileRevalidate = 'stale_while_revalidate',
  MustRevalidate = 'must_revalidate',
  Bypass = 'bypass'
}

import { open } from '@tauri-apps/plugin-shell';
import { IntegrityError } from './IntegrityError';

/**
 * Cache TTL constants in milliseconds
 */
const CACHE_TTL = {
  MODPACKS: 5 * 60 * 1000, // 5 minutes (reduced from 30)
  FEATURED: 5 * 60 * 1000, // 5 minutes
  CATEGORIES: 24 * 60 * 60 * 1000, // 24 hours
  SEARCH: 2 * 60 * 1000, // 2 minutes
  MODPACK_DETAILS: 10 * 60 * 1000, // 10 minutes
  PARTNERS: 10 * 60 * 1000 // 10 minutes
} as const;

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  expiresAt: number;  // TTL-based expiry
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
  private userSettings: UserSettings;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes for all modpack data (synced with periodic refresh interval)
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
  }

  private detectDefaultLanguage(): string {
    try {
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
    } catch (error) {
      console.error('Error detecting default language:', error);
    }

    // Default to English for all other languages or on error
    return 'en';
  }

  private loadUserSettings(): UserSettings {
    const defaultSettings: UserSettings = {
      username: 'Player',
      allocatedRam: 4,
      language: this.detectDefaultLanguage(),
      authMethod: 'offline',
      clientToken: this.generateClientToken() // Generate immediately, not undefined
    };

    try {
      const saved = localStorage.getItem('LuminaKraftLauncher_settings');
      if (saved) {
        const merged = { ...defaultSettings, ...JSON.parse(saved) } as UserSettings;

        // CRITICAL: Always ensure we have a client token for offline auth
        if (!merged.clientToken) {
          console.warn('⚠️ ClientToken missing in saved settings, generating new one');
          merged.clientToken = this.generateClientToken();
        }

        // Save the merged settings with guaranteed clientToken
        try {
          localStorage.setItem('LuminaKraftLauncher_settings', JSON.stringify(merged));
        } catch (saveError) {
          console.error('Error saving merged settings to localStorage:', saveError);
        }

        return merged;
      }
    } catch (error) {
      console.error('Error loading user settings:', error);
    }

    // Fallback: return default settings (which already have a clientToken generated)
    try {
      localStorage.setItem('LuminaKraftLauncher_settings', JSON.stringify(defaultSettings));
    } catch (saveError) {
      console.error('Error saving default settings to localStorage:', saveError);
    }

    console.log('✅ Using default settings with generated clientToken');
    return defaultSettings;
  }

  saveUserSettings(settings: Partial<UserSettings>): void {
    this.userSettings = { ...this.userSettings, ...settings };
    localStorage.setItem('LuminaKraftLauncher_settings', JSON.stringify(this.userSettings));
  }

  getUserSettings(): UserSettings {
    return { ...this.userSettings };
  }

  /**
   * Check if backend connection is healthy
   */
  async checkAPIHealth(): Promise<boolean> {
    try {
      // Test backend connection by making a simple query
      const { error } = await supabase
        .from('modpacks')
        .select('id')
        .limit(1);

      if (error) {
        console.error('Backend health check failed:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Backend health check failed:', error);
      return false;
    }
  }

  private getFallbackData(): ModpacksData {
    return {
      modpacks: []
    };
  }

  /**
   * Fetches the lightweight modpacks data for browsing from Supabase
   * Uses the modpacks_i18n() function for automatic translation
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
        this.cache.set(cacheKey, { data: persisted.data, timestamp: persisted.timestamp, expiresAt: persisted.timestamp + CACHE_TTL.MODPACKS });
        return persisted.data;
      }
      console.log('Fetching modpacks data from Supabase...');

      // Fetch partners first to map names
      const partners = await this.fetchPartners();
      const partnersMap = new Map(partners.map((p: any) => [p.id, p.name]));

      // Fetch modpack partner associations directly (workaround for potential RPC missing field)
      const { data: modpackPartners } = await supabase
        .from('modpacks')
        .select('id, partner_id');

      const modpackPartnerMap = new Map(modpackPartners?.map((m: any) => [m.id, m.partner_id]) || []);

      // Fetch modpacks using the i18n function
      const result = await supabase.rpc('modpacks_i18n', {
        p_language: lang
      } as any);
      const { data, error } = result as { data: any[] | null; error: any };

      if (error) {
        console.error('Error fetching modpacks from Supabase:', error);
        throw error;
      }

      // Transform Supabase data to match launcher format
      if (data && data.length > 0) {
        console.log('📦 Raw modpack data sample:', data[0]);
        console.log(`📦 Total modpacks returned by RPC: ${data.length}`);
        data.forEach((m: any) => {
          console.log(`  - ${m.name} (active: ${m.is_active}, coming_soon: ${m.is_coming_soon}, upload_status: ${m.upload_status})`);
        });
      } else {
        console.log('⚠️ No modpacks returned by modpacks_i18n RPC');
      }

      // Fetch stats for all modpacks in parallel
      const statsMap = new Map<string, any>();
      if (data && data.length > 0) {
        console.log(`🔄 Fetching stats for ${data.length} modpacks...`);
        const statsPromises: Promise<null>[] = data.map((modpack: any) => {
          console.log(`  Requesting stats for: ${modpack.name} (${modpack.id})`);
          return (supabase.rpc('get_modpack_aggregate_stats', { p_modpack_id: modpack.id } as any) as unknown as Promise<any>)
            .then((result: any) => {
              console.log(`📊 Stats response for ${modpack.name}:`, { data: result.data, error: result.error });
              if (result.data) {
                // RPC returns array, get first element
                const stats = Array.isArray(result.data) ? result.data[0] : result.data;
                statsMap.set(modpack.id, stats);
                console.log(`✅ Stats stored for ${modpack.name}:`, stats);
              } else if (result.error) {
                console.warn(`⚠️ Stats error for ${modpack.name}:`, result.error);
              }
              return null;
            })
            .catch((error: any) => {
              console.error(`❌ Failed to fetch stats for modpack ${modpack.id}:`, error);
              return null;
            })
        });
        console.log(`⏳ Waiting for ${statsPromises.length} stat requests...`);
        await Promise.all(statsPromises);
        console.log(`✨ Stats fetch complete. Stored ${statsMap.size} results`);
      }

      // Helper function to check if modpack is new
      // Priority: 1) Check DB is_new flag (admin override), 2) Calculate based on published_at date (7 days)
      // Note: Coming soon modpacks are never marked as "New" - they get their own badge
      const isModpackNew = (dbIsNew: boolean, publishedAt: string | null, isComingSoon: boolean): boolean => {
        // Coming soon modpacks don't get the "New" badge
        if (isComingSoon) return false;

        // If admin explicitly set is_new to true in DB, honor that
        if (dbIsNew) return true;

        // Otherwise, check if published within last 7 days
        if (!publishedAt) return false;
        const publishDate = new Date(publishedAt);
        const now = new Date();
        const daysOld = (now.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysOld <= 7;
      };

      const modpacks = data?.map((modpack: any) => ({
        id: modpack.id,
        slug: modpack.slug,
        category: modpack.category,
        name: modpack.name,
        shortDescription: modpack.short_description,
        description: modpack.description,
        version: modpack.version,
        minecraftVersion: modpack.minecraft_version,
        modloader: modpack.modloader,
        modloaderVersion: modpack.modloader_version,
        gamemode: modpack.gamemode,
        ip: modpack.server_ip,
        logo: modpack.logo_url,
        banner: modpack.banner_url,
        backgroundImage: modpack.banner_url, // Use banner as background
        urlModpackZip: modpack.modpack_file_url,
        primaryColor: modpack.primary_color,
        isNew: isModpackNew(modpack.is_new, modpack.published_at, modpack.is_coming_soon),
        isActive: modpack.is_active,
        isComingSoon: modpack.is_coming_soon,
        youtubeEmbed: modpack.youtube_embed,
        tiktokEmbed: modpack.tiktok_embed,
        partnerId: modpack.partner_id || modpackPartnerMap.get(modpack.id),
        partnerName: (modpack.partner_id || modpackPartnerMap.get(modpack.id)) ? partnersMap.get(modpack.partner_id || modpackPartnerMap.get(modpack.id)) : undefined,
        publishedAt: modpack.published_at,
        downloads: statsMap.get(modpack.id)?.total_downloads || 0,
        allowCustomMods: modpack.allow_custom_mods ?? true,
        allowCustomResourcepacks: modpack.allow_custom_resourcepacks ?? true,
        fileSha256: modpack.file_sha256, // SHA256 of the ZIP file
      })) || [];

      this.modpacksData = { modpacks };
      const now = Date.now();
      this.cache.set(cacheKey, {
        data: this.modpacksData,
        timestamp: now,
        expiresAt: now + CACHE_TTL.MODPACKS
      });
      this.writePersistentCache(cacheKey, this.modpacksData);
      console.log(`✅ Loaded ${modpacks.length} modpacks from Supabase`);
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
   * Fetches and caches full details for a specific modpack from Supabase
   * Includes features, images, collaborators, and stats
   * @param modpackId string
   */
  async fetchModpackDetails(modpackId: string): Promise<any> {
    const lang = this.userSettings.language || 'en';
    const cacheKey = `modpack_details_${modpackId}_${lang}`;
    const cached = this.cache.get(cacheKey);
    const persisted = this.readPersistentCache<any>(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    if (persisted && Date.now() - persisted.timestamp < this.cacheTTL) {
      this.cache.set(cacheKey, { data: persisted.data, timestamp: persisted.timestamp, expiresAt: persisted.timestamp + CACHE_TTL.MODPACK_DETAILS });
      return persisted.data;
    }

    try {
      // Fetch modpack basic info with latest version
      // Note: We don't filter by is_active=true because coming soon modpacks may not be active yet
      const { data: modpackData, error: modpackError } = await supabase
        .from('modpacks')
        .select(`
          *,
          modpack_versions (
            version,
            minecraft_version,
            modloader_version,
            file_url,
            file_size,
            file_sha256,
            created_at
          )
        `)
        .eq('id', modpackId)
        .order('created_at', { foreignTable: 'modpack_versions', ascending: false })
        .limit(1, { foreignTable: 'modpack_versions' })
        .single() as { data: any; error: any };

      if (modpackError || !modpackData) {
        console.error('Error fetching modpack from Supabase:', modpackError);
        if (persisted) return persisted.data;
        return null;
      }

      // Extract latest version info
      const latestVersion = modpackData.modpack_versions?.[0] || null;

      // Fetch related data in parallel
      const [featuresResult, imagesResult, collaboratorsResult, statsResult] = await Promise.all([
        supabase
          .from('modpack_features')
          .select('*')
          .eq('modpack_id', modpackId)
          .order('sort_order'),
        supabase
          .from('modpack_images')
          .select('*')
          .eq('modpack_id', modpackId)
          .order('sort_order'),
        supabase
          .from('modpack_collaborators')
          .select('*')
          .eq('modpack_id', modpackId)
          .order('sort_order'),
        (async () => {
          const result = await supabase.rpc('get_modpack_aggregate_stats', { p_modpack_id: modpackId } as any);
          return result as { data: any; error: any };
        })()
      ]);

      // Helper function to get translation
      const getTranslation = (i18nField: Record<string, string> | null) => {
        if (!i18nField) return '';
        return i18nField[lang] || i18nField['en'] || '';
      };

      // Transform to launcher format
      const details = {
        id: modpackData.id,
        slug: modpackData.slug,
        category: modpackData.category,
        name: getTranslation(modpackData.name_i18n),
        shortDescription: getTranslation(modpackData.short_description_i18n),
        description: getTranslation(modpackData.description_i18n),
        version: latestVersion?.version || modpackData.version,
        minecraftVersion: latestVersion?.minecraft_version || modpackData.minecraft_version,
        modloader: modpackData.modloader,
        modloaderVersion: latestVersion?.modloader_version || modpackData.modloader_version,
        gamemode: modpackData.gamemode,
        ip: modpackData.server_ip,
        logo: modpackData.logo_url,
        banner: modpackData.banner_url,
        backgroundImage: modpackData.banner_url, // Use banner as background
        urlModpackZip: latestVersion?.file_url || null,
        primaryColor: modpackData.primary_color,
        isNew: modpackData.is_new || false,
        isActive: modpackData.is_active !== false,
        isComingSoon: modpackData.is_coming_soon || false,
        youtubeEmbed: modpackData.youtube_embed || null,
        tiktokEmbed: modpackData.tiktok_embed || null,
        partnerId: modpackData.partner_id || null,
        fileSha256: latestVersion?.file_sha256 || null, // SHA256 for integrity verification
        allowCustomMods: modpackData.allow_custom_mods ?? true,
        allowCustomResourcepacks: modpackData.allow_custom_resourcepacks ?? true,
        // Features
        features: featuresResult.data?.map((feature: any) => ({
          title: getTranslation(feature.title_i18n),
          description: getTranslation(feature.description_i18n),
          icon: feature.icon,
        })) || [],
        // Images/Screenshots
        images: imagesResult.data?.map((image: any) => image.image_url) || [],
        // Collaborators
        collaborators: collaboratorsResult.data?.map((collab: any) => ({
          name: collab.name,
          role: collab.role,
          avatar: collab.avatar,
        })) || [],
        // Stats
        downloads: statsResult.data?.total_downloads || 0,
        playTime: statsResult.data?.total_playtime_hours || 0,
        rating: statsResult.data?.average_rating || null,
      };

      const detailsNow = Date.now();
      this.cache.set(cacheKey, { data: details, timestamp: detailsNow, expiresAt: detailsNow + CACHE_TTL.MODPACK_DETAILS });
      this.writePersistentCache(cacheKey, details);
      return details;
    } catch (error) {
      console.error('Error fetching modpack details from Supabase:', error);
      if (persisted) return persisted.data;
      return null;
    }
  }

  /**
   * Fetches all active partners from Supabase
   * Caches the result to avoid frequent DB calls
   */
  async fetchPartners(): Promise<any[]> {
    const cacheKey = 'partners_data';
    const cached = this.cache.get(cacheKey);
    const persisted = this.readPersistentCache<any[]>(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    if (persisted && Date.now() - persisted.timestamp < this.cacheTTL) {
      this.cache.set(cacheKey, { data: persisted.data, timestamp: persisted.timestamp, expiresAt: persisted.timestamp + CACHE_TTL.PARTNERS });
      return persisted.data;
    }

    try {
      console.log('Fetching partners from Supabase...');
      const { data, error } = await supabase
        .from('partners')
        .select('id, name')
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching partners:', error);
        return [];
      }

      console.log(`✅ Loaded ${data?.length || 0} partners`);
      const partnersNow = Date.now();
      this.cache.set(cacheKey, { data: data || [], timestamp: partnersNow, expiresAt: partnersNow + CACHE_TTL.PARTNERS });
      this.writePersistentCache(cacheKey, data || []);
      return data || [];
    } catch (error) {
      console.error('Error fetching partners:', error);
      return [];
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

    // If not found in server list, try to load from local instance metadata
    if (!modpack) {
      try {
        const metadataJson = await safeInvoke<string | null>('get_instance_metadata', { modpackId });
        if (metadataJson) {
          const metadata = JSON.parse(metadataJson);
          // Create a modpack object from local metadata
          modpack = {
            id: metadata.id,
            name: metadata.name,
            description: '',
            version: metadata.version,
            minecraftVersion: metadata.minecraftVersion,
            modloader: metadata.modloader,
            modloaderVersion: metadata.modloaderVersion,
            urlModpackZip: '', // Local modpacks don't need download URL
            category: 'community',
            logo: '',
            backgroundImage: '',
          };
        } else {
          throw new Error('Modpack no encontrado');
        }
      } catch {
        throw new Error('Modpack no encontrado');
      }
    }

    // Check if modpack has modloaderVersion, if not, try to refresh data
    if (!modpack || !modpack.modloaderVersion) {
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
      category: modpack.category || null, // For cleanup/integrity behavior
      fileSha256: modpack.fileSha256 || null, // For download verification
    };


    return transformed;
  }

  // Transform frontend UserSettings structure to backend-expected structure
  private async transformUserSettingsForBackend(settings: UserSettings) {
    // Get the current Supabase access token
    const authService = AuthService.getInstance();
    const supabaseAccessToken = await authService.getSupabaseAccessToken();

    const transformed = {
      username: settings.username,
      allocatedRam: settings.allocatedRam, // Keep camelCase, backend should handle it
      language: settings.language || 'en',
      authMethod: settings.authMethod,
      microsoftAccount: settings.microsoftAccount || null,
      clientToken: settings.clientToken || null,
      supabaseAccessToken: supabaseAccessToken,
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
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
        const transformedSettings = await this.transformUserSettingsForBackend(this.userSettings);

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
      // Verify integrity before launching (anti-cheat for official/partner modpacks)
      if (isTauriContext()) {
        console.log('🔐 Verifying modpack integrity before launch...');

        // Verify integrity (passing authoritative flags from DB/Server)
        // This prevents users from bypassing restrictions by editing instance.json locally

        const integrityResult = await safeInvoke<{
          isValid: boolean;
          issues: string[];
          reason?: string;
        }>('verify_instance_integrity', {
          modpackId: modpack.id,
          expectedZipSha256: modpack.fileSha256 || null,
          overrideAllowCustomMods: modpack.allowCustomMods ?? true,
          overrideAllowCustomResourcepacks: modpack.allowCustomResourcepacks ?? true
        });

        if (!integrityResult.isValid) {
          console.warn('⚠️ Integrity check failed:', integrityResult.issues);

          // Filter out "UnauthorizedFile" issues if we are in "permissive" mode
          // But since we are passing flags to the backend, the backend should have already filtered them
          // based on the Authoritative flags we just sent.

          // If there are issues, we must STOP launch and ask for repair
          // Unless it's just a warning or community pack
          if (integrityResult.issues.length > 0) {
            console.error('⛔ Critical integrity issues found:', integrityResult.issues);
            // Throw specific error for UI handling
            throw new IntegrityError(integrityResult.issues);
          }
        } else {
          console.log('✅ Integrity verification passed');
        }
      }

      // Transform the modpack structure to match backend expectations
      const transformedModpack = this.transformModpackForBackend(modpack);
      const transformedSettings = await this.transformUserSettingsForBackend(this.userSettings);

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
          generalMessage: i18next.t('progress.startingRepair'),
          detailMessage: i18next.t('progress.verifyingModpackStatus')
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

    // Dispatch a custom event to notify all listeners that cache has been cleared
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('luminakraft:cache-cleared'));
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
      const persistNow = Date.now();
      const entry: CacheEntry<T> = { data, timestamp: persistNow, expiresAt: persistNow + CACHE_TTL.MODPACKS };
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

  /**
   * Get backend information
   * This replaces the old API info endpoint
   */
  async getAPIInfo(): Promise<any> {
    try {
      // Check if backend is available
      const isHealthy = await this.checkAPIHealth();

      return {
        backend: 'LuminaKraft Services',
        status: isHealthy ? 'online' : 'offline',
        version: '1.0.0',
        features: ['modpacks', 'authentication', 'statistics', 'file-storage']
      };
    } catch (error) {
      console.error('Error getting backend info:', error);
      return {
        backend: 'LuminaKraft Services',
        status: 'offline',
        version: '1.0.0',
        features: []
      };
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
      const transformedSettings = await this.transformUserSettingsForBackend(this.userSettings);

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

  /**
   * Check if a string is a valid UUID
   */
  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Check rate limit before download and track if allowed
   * Returns rate limit info including whether download is allowed
   * @throws Error if rate limit exceeded
   */
  async checkDownloadRateLimit(modpackId: string, clientToken?: string): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: string;
    isAuthenticated: boolean;
    isDiscordMember: boolean;
    errorCode?: string;
    message: string;
  }> {
    // Local modpacks don't have rate limits
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(modpackId)) {
      return {
        allowed: true,
        limit: 999,
        remaining: 999,
        resetAt: new Date(Date.now() + 3600000).toISOString(),
        isAuthenticated: false,
        isDiscordMember: false,
        message: 'Local modpack'
      };
    }

    console.log('🔐 Rate limit check - clientToken:', clientToken ? `${clientToken.substring(0, 10)}...` : 'NULL/UNDEFINED');

    const { data, error } = await supabase.rpc('track_download_with_limit', {
      p_modpack_id: modpackId,
      p_client_token: clientToken || null  // Ensure null, not undefined
    } as any) as { data: any; error: any };

    if (error) {
      console.error('Error checking download rate limit:', error);
      throw new Error('Failed to check download rate limit');
    }

    const result = {
      allowed: data.allowed,
      limit: data.limit,
      remaining: data.remaining,
      resetAt: data.reset_at,
      isAuthenticated: data.is_authenticated,
      isDiscordMember: data.is_discord_member,
      message: data.message
    };

    console.log('Rate limit check:', result.message);
    return result;
  }

  /**
   * Update playtime for a modpack in Supabase stats
   * @param modpackId The modpack ID
   * @param hours Number of hours played
   */
  async updatePlaytime(modpackId: string, hours: number): Promise<void> {
    try {
      // Get current user ID (anonymous or authenticated)
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      if (!userId) {
        console.warn('Cannot update playtime for anonymous user');
        return;
      }

      const { error } = await supabase.rpc('update_playtime', {
        p_modpack_id: modpackId,
        p_user_id: userId,
        p_hours: hours
      } as any) as { error: any };

      if (error) {
        console.error('Error updating playtime:', error);
      } else {
        console.log(`✅ Playtime updated for modpack: ${modpackId} (${hours}h)`);
      }
    } catch (error) {
      console.error('Error updating playtime:', error);
      // Don't throw - stats tracking should not break the main flow
    }
  }

  /**
   * Check if a modpack has updates available
   * Returns the latest version info if an update is available
   */
  async checkForModpackUpdate(modpackId: string): Promise<{
    hasUpdate: boolean;
    currentVersion?: string;
    latestVersion?: string;
    changelog?: string;
  }> {
    try {
      // Get current installed version
      const metadata = await this.getInstanceMetadata(modpackId);
      if (!metadata) {
        return { hasUpdate: false };
      }

      // Get latest version from Supabase
      const { data: modpackData, error } = await supabase
        .from('modpacks')
        .select('version')
        .eq('id', modpackId)
        .eq('is_active', true)
        .single() as { data: any; error: any };

      if (error || !modpackData) {
        console.error('Error checking for modpack update:', error);
        return { hasUpdate: false };
      }

      const hasUpdate = metadata.version !== modpackData.version;

      if (hasUpdate) {
        // Get changelog for the new version
        const changelog = await this.getVersionChangelog(modpackId, modpackData.version);

        return {
          hasUpdate: true,
          currentVersion: metadata.version,
          latestVersion: modpackData.version,
          changelog
        };
      }

      return { hasUpdate: false };
    } catch (error) {
      console.error('Error checking for modpack update:', error);
      return { hasUpdate: false };
    }
  }

  /**
   * Get changelog for a specific version
   */
  async getVersionChangelog(modpackId: string, version: string): Promise<string> {
    try {
      const lang = this.userSettings.language || 'en';

      const { data, error } = await supabase
        .from('modpack_versions')
        .select('changelog_i18n')
        .eq('modpack_id', modpackId)
        .eq('version', version)
        .single() as { data: any; error: any };

      if (error || !data) {
        return '';
      }

      // Get translation
      const changelog = data.changelog_i18n;
      return changelog?.[lang] || changelog?.['en'] || '';
    } catch (error) {
      console.error('Error getting version changelog:', error);
      return '';
    }
  }

  /**
   * Get version history for a modpack
   */
  async getModpackVersionHistory(modpackId: string): Promise<any[]> {
    try {
      const lang = this.userSettings.language || 'en';

      const { data, error } = await supabase
        .from('modpack_versions')
        .select('*')
        .eq('modpack_id', modpackId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting version history:', error);
        return [];
      }

      // Transform to include translated changelog
      return data?.map((version: any) => ({
        version: version.version,
        changelog: version.changelog_i18n?.[lang] || version.changelog_i18n?.['en'] || '',
        fileUrl: version.file_url,
        fileSize: version.file_size,
        createdAt: version.created_at,
      })) || [];
    } catch (error) {
      console.error('Error getting version history:', error);
      return [];
    }
  }

  /**
   * Install a modpack from a local ZIP file
   * Extracts manifest, creates temporary modpack object, and installs
   */
  async installModpackFromZip(filePath: string, onProgress?: (_progress: ProgressInfo) => void): Promise<void> {
    if (!isTauriContext()) {
      throw new Error('Esta función requiere ejecutar la aplicación con Tauri.');
    }

    try {
      // Read the ZIP file from the path to extract manifest
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const zipBuffer = await readFile(filePath);

      // Extract and parse manifest from ZIP using JSZip
      const zip = await JSZip.loadAsync(zipBuffer);
      const manifestFile = zip.file('manifest.json');

      if (!manifestFile) {
        throw new Error('No manifest.json found in ZIP file');
      }

      const manifestText = await manifestFile.async('text');
      const manifest = JSON.parse(manifestText);

      // Extract file name from path
      const fileName = filePath.split('/').pop() || 'modpack.zip';

      // Create a safe ID for event names and folder names
      // Keep original case and replace only invalid filesystem characters with underscores
      const safeName = (manifest.name || fileName.replace('.zip', ''))
        .replace(/[^a-zA-Z0-9\-_]/g, '_')
        .replace(/_{2,}/g, '_');

      // Create a temporary modpack object from manifest
      const modpackName = manifest.name || fileName.replace('.zip', '');
      const tempModpack = {
        id: safeName,
        name: modpackName,
        description: manifest.description || '',
        version: manifest.version || '1.0.0',
        minecraftVersion: manifest.minecraft?.version || manifest.minecraftVersion || '1.20.1',
        modloader: manifest.minecraft?.modLoaders?.[0]?.id?.split('-')[0] || 'forge',
        modloaderVersion: manifest.minecraft?.modLoaders?.[0]?.id?.split('-')[1] || '47.0.0',
        logo: '',
        urlModpackZip: '', // Will be set by backend from temp file
      };

      // Transform settings
      const transformedSettings = await this.transformUserSettingsForBackend(this.userSettings);

      // Set up progress listener
      let unlistenProgress: (() => void) | null = null;

      if (onProgress) {
        unlistenProgress = await listen(
          `modpack_progress_${tempModpack.id}`,
          (event: any) => {
            const data = event.payload;
            if (data) {
              let currentFile = '';
              if (data.detailMessage) {
                currentFile = data.detailMessage;
              } else if (data.message && !data.message.startsWith('downloading_modpack:')) {
                currentFile = data.message;
              }

              onProgress({
                percentage: data.percentage || 0,
                currentFile: currentFile,
                downloadSpeed: data.downloadSpeed || '',
                eta: data.eta || '',
                step: data.step || '',
                generalMessage: data.generalMessage || '',
                detailMessage: data.detailMessage || ''
              });
            }
          }
        );
      }

      try {
        // Call the backend command to install from local ZIP (pass file path, not bytes)
        await safeInvoke('install_modpack_from_local_zip', {
          zipPath: filePath,
          modpack: tempModpack,
          settings: transformedSettings
        });
      } finally {
        if (unlistenProgress) {
          unlistenProgress();
        }
      }
    } catch (error) {
      console.error('Error installing modpack from ZIP:', error);
      throw error;
    }
  }

  // Java-specific helper methods removed – Lyceris handles runtimes automatically.

  // ============================================================================
  // STATISTICS AND PLAYTIME TRACKING
  // ============================================================================

  /**
   * Get comprehensive statistics for a modpack
   */
  async getModpackStats(modpackId: string): Promise<{
    totalDownloads: number;
    totalPlaytime: number;
    activePlayers: number;
    uniquePlayers: number;
    averageRating: number | null;
  } | null> {
    try {
      if (!this.isValidUUID(modpackId)) {
        return null;
      }

      const { data, error } = await supabase.rpc('get_modpack_stats', {
        p_modpack_id: modpackId
      } as any) as { data: any; error: any };

      if (error) {
        console.error('Error getting modpack stats:', error);
        return null;
      }

      return {
        totalDownloads: data.total_downloads || 0,
        totalPlaytime: data.total_playtime || 0,
        activePlayers: data.active_players || 0,
        uniquePlayers: data.unique_players || 0,
        averageRating: data.average_rating
      };
    } catch (error) {
      console.error('Error getting modpack stats:', error);
      return null;
    }
  }

  /**
   * Get personal statistics for current user and modpack
   */
  async getUserModpackStats(modpackId: string): Promise<{
    downloads: number;
    playtimeHours: number;
    lastPlayed: string | null;
    rating: number | null;
  } | null> {
    try {
      if (!this.isValidUUID(modpackId)) {
        // For local modpacks, get from localStorage
        return this.getLocalPlaytime(modpackId);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Anonymous user - get from localStorage
        return this.getLocalPlaytime(modpackId);
      }

      const { data, error } = await supabase.rpc('get_user_modpack_stats', {
        p_modpack_id: modpackId,
        p_user_id: user.id
      } as any) as { data: any; error: any };

      if (error) {
        console.error('Error getting user modpack stats:', error);
        return null;
      }

      return {
        downloads: data.downloads || 0,
        playtimeHours: data.playtime_hours || 0,
        lastPlayed: data.last_played,
        rating: data.rating
      };
    } catch (error) {
      console.error('Error getting user modpack stats:', error);
      return null;
    }
  }

  /**
   * Update active status (called every 2 minutes while Minecraft is running)
   */
  async updateActiveStatus(modpackId: string): Promise<void> {
    try {
      if (!this.isValidUUID(modpackId)) {
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return; // Anonymous users don't track active status
      }

      const { error } = await supabase.rpc('update_active_status', {
        p_modpack_id: modpackId,
        p_user_id: user.id
      } as any) as { error: any };

      if (error) {
        console.error('Error updating active status:', error);
      }
    } catch (error) {
      console.error('Error updating active status:', error);
    }
  }

  /**
   * Add playtime for a modpack (hybrid: BD for all, local as backup)
   * @param hoursPlayed - Hours played in this session (can be decimal, e.g., 0.5)
   *
   * Authenticated users: individual tracking with user_id
   * Anonymous users: aggregated tracking with user_id = NULL
   */
  async addPlaytime(modpackId: string, hoursPlayed: number): Promise<void> {
    try {
      // Always save to localStorage first (for quick access and backup)
      this.saveLocalPlaytime(modpackId, hoursPlayed);

      // If valid UUID, also save to database (both authenticated and anonymous)
      if (this.isValidUUID(modpackId)) {
        const { data: { user } } = await supabase.auth.getUser();

        // Authenticated users: use their user_id
        // Anonymous users: use NULL (aggregated stats)
        const userId = (user && user.role === 'authenticated') ? user.id : null;

        const { error } = await supabase.rpc('add_playtime', {
          p_modpack_id: modpackId,
          p_user_id: userId,
          p_hours_played: hoursPlayed
        } as any) as { error: any };

        if (error) {
          console.error('Error adding playtime to database:', error);
        } else {
          console.log(`Playtime added to database: ${hoursPlayed.toFixed(2)}h (${userId ? 'authenticated' : 'anonymous'})`);
        }
      }

      console.log(`Playtime tracked: ${hoursPlayed.toFixed(2)}h for ${modpackId}`);
    } catch (error) {
      console.error('Error adding playtime:', error);
    }
  }

  /**
   * Get local playtime from localStorage
   */
  private getLocalPlaytime(modpackId: string): {
    downloads: number;
    playtimeHours: number;
    lastPlayed: string | null;
    rating: number | null;
  } {
    try {
      const key = `playtime_${modpackId}`;
      const data = localStorage.getItem(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error getting local playtime:', error);
    }

    return {
      downloads: 0,
      playtimeHours: 0,
      lastPlayed: null,
      rating: null
    };
  }

  /**
   * Save playtime to localStorage
   */
  private saveLocalPlaytime(modpackId: string, hoursPlayed: number): void {
    try {
      const key = `playtime_${modpackId}`;
      const existing = this.getLocalPlaytime(modpackId);

      const updated = {
        downloads: existing.downloads,
        playtimeHours: existing.playtimeHours + hoursPlayed,
        lastPlayed: new Date().toISOString(),
        rating: existing.rating
      };

      localStorage.setItem(key, JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving local playtime:', error);
    }
  }
}

export default LauncherService; 