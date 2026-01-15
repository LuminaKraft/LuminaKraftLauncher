import { supabase, supabaseUrl } from './supabaseClient';
import type { MicrosoftAccount, CurseForgeManifest, ParsedModpackData } from '../types/launcher';
import type { ModrinthManifest } from '../types/modrinth';
import JSZip from 'jszip';
import LauncherService from './launcherService';

// Cache TTL constants for modpack management data
const MODPACK_MGMT_CACHE_TTL = {
  CAN_MANAGE: 5 * 60 * 1000, // 5 minutes - permissions rarely change
  USER_MODPACKS: 2 * 60 * 1000, // 2 minutes - modpacks list may change more often
} as const;

interface MgmtCacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * Service for managing modpack creation and updates
 * Used by partners and community members
 */
export class ModpackManagementService {
  private static instance: ModpackManagementService;
  // Kept for infrastructure/future use even though currently unused
  private _microsoftAccount: MicrosoftAccount | null = null;
  // In-memory cache for permission and modpack data
  private cache: Map<string, MgmtCacheEntry<unknown>> = new Map();

  public static getInstance(): ModpackManagementService {
    if (!ModpackManagementService.instance) {
      ModpackManagementService.instance = new ModpackManagementService();
    }
    return ModpackManagementService.instance;
  }

  // ============================================================================
  // CACHE METHODS
  // ============================================================================

  /**
   * Get cached data if valid (not expired)
   */
  private getCache<T>(key: string): T | null {
    const entry = this.cache.get(key) as MgmtCacheEntry<T> | undefined;
    if (!entry) return null;

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cache entry with TTL
   */
  private setCache<T>(key: string, data: T, ttl: number): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl
    });
  }

  /**
   * Clear all modpack management caches (call after mutations)
   */
  public clearCache(): void {
    this.cache.clear();
    console.log('🗑️ Modpack management cache cleared');
  }

  /**
   * Set the Microsoft account for the current session
   * This should be called after Microsoft authentication
   */
  public setMicrosoftAccount(account: MicrosoftAccount | null): void {
    this._microsoftAccount = account;
  }

  /**
   * Get the Microsoft account for the current session
   * Kept for infrastructure/future use
   */
  public getMicrosoftAccount(): MicrosoftAccount | null {
    return this._microsoftAccount;
  }

  /**
   * Check if the current user can create/edit modpacks
   * Requires Discord authentication only
   * Cached for 5 minutes to reduce redundant network calls
   */
  async canManageModpacks(): Promise<{
    canManage: boolean;
    role: 'admin' | 'partner' | 'user' | null;
    partnerName?: string;
  }> {
    const cacheKey = 'can_manage_modpacks';

    // Check cache first
    const cached = this.getCache<{ canManage: boolean; role: 'admin' | 'partner' | 'user' | null; partnerName?: string }>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      // Check if user has active Supabase session
      const { data: { user } } = await supabase.auth.getUser();

      if (!user || user.is_anonymous) {
        const result: { canManage: boolean; role: 'admin' | 'partner' | 'user' | null; partnerName?: string } = { canManage: false, role: null };
        this.setCache(cacheKey, result, MODPACK_MGMT_CACHE_TTL.CAN_MANAGE);
        return result;
      }

      // Look up user profile and check Discord is linked
      const { data: profile } = await supabase
        .from('users')
        .select('role, discord_id, partner_id')
        .eq('id', user.id)
        .single() as { data: any };

      if (!profile) {
        const result: { canManage: boolean; role: 'admin' | 'partner' | 'user' | null; partnerName?: string } = { canManage: false, role: null };
        this.setCache(cacheKey, result, MODPACK_MGMT_CACHE_TTL.CAN_MANAGE);
        return result;
      }

      // Must have Discord linked
      if (!profile.discord_id) {
        const result: { canManage: boolean; role: 'admin' | 'partner' | 'user' | null; partnerName?: string } = { canManage: false, role: null };
        this.setCache(cacheKey, result, MODPACK_MGMT_CACHE_TTL.CAN_MANAGE);
        return result;
      }

      const role = profile.role as 'admin' | 'partner' | 'user';

      // Only admin and partner can manage modpacks (community publishing disabled temporarily)
      const canManage = ['admin', 'partner'].includes(role);

      let partnerName: string | undefined;
      if (role === 'partner' && profile.partner_id) {
        const { data: partner } = await supabase
          .from('partners')
          .select('name')
          .eq('id', profile.partner_id)
          .single() as { data: { name: string } | null };

        if (partner) {
          partnerName = partner.name;
        }
      }

      const result = { canManage, role, partnerName };
      this.setCache(cacheKey, result, MODPACK_MGMT_CACHE_TTL.CAN_MANAGE);
      return result;
    } catch (error) {
      console.error('Error checking user permissions:', error);
      return { canManage: false, role: null };
    }
  }

  /**
   * Verify if the current user has permission to modify a specific modpack
   * Returns true if user is: owner, admin, or same-partner member
   */
  async verifyModpackOwnership(modpackId: string): Promise<{ hasPermission: boolean; error?: string }> {
    try {
      // Get authenticated user
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser) {
        return { hasPermission: false, error: 'User not authenticated' };
      }

      // Get modpack details
      const { data: modpack, error: modpackError } = await supabase
        .from('modpacks')
        .select('author_id, category')
        .eq('id', modpackId)
        .single() as { data: { author_id: string; category: string } | null; error: any };

      if (modpackError || !modpack) {
        return { hasPermission: false, error: 'Modpack not found' };
      }

      // Get user profile
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, role, partner_id')
        .eq('id', authUser.id)
        .single() as { data: { id: string; role: string; partner_id: string | null } | null; error: any };

      if (userError || !userData) {
        return { hasPermission: false, error: 'User profile not found' };
      }

      // Check if owner
      if (modpack.author_id === userData.id) {
        return { hasPermission: true };
      }

      // Check if admin
      if (userData.role === 'admin') {
        return { hasPermission: true };
      }

      // Check if same partner (for partner category modpacks)
      if (modpack.category === 'partner' && userData.partner_id) {
        const { data: authorData } = await supabase
          .from('users')
          .select('partner_id')
          .eq('id', modpack.author_id)
          .single() as { data: { partner_id: string | null } | null };

        if (authorData?.partner_id && authorData.partner_id === userData.partner_id) {
          return { hasPermission: true };
        }
      }

      return { hasPermission: false, error: 'Insufficient permissions' };
    } catch (error) {
      console.error('Error verifying modpack ownership:', error);
      return { hasPermission: false, error: 'Failed to verify permissions' };
    }
  }

  /**
   * Parse manifest from a modpack ZIP (supports both CurseForge and Modrinth formats)
   * Extracts metadata like version, modloader, etc.
   * Returns the parsed data along with the detected source type
   */
  async parseManifestFromZip(zipFile: File): Promise<{
    success: boolean;
    data?: ParsedModpackData;
    source?: 'curseforge' | 'modrinth';
    error?: string
  }> {
    try {
      console.log('Parsing manifest from ZIP:', zipFile.name);

      // Load ZIP file
      const zip = new JSZip();
      const zipData = await zip.loadAsync(zipFile);

      // Check for Modrinth format first (modrinth.index.json)
      const modrinthManifestFile = zipData.file('modrinth.index.json');
      if (modrinthManifestFile) {
        return await this.parseModrinthManifest(modrinthManifestFile);
      }

      // Check for CurseForge format (manifest.json)
      const curseforgeManifestFile = zipData.file('manifest.json');
      if (curseforgeManifestFile) {
        return await this.parseCurseForgeManifest(curseforgeManifestFile);
      }

      return { success: false, error: 'No manifest found in ZIP (expected manifest.json or modrinth.index.json)' };
    } catch (error) {
      console.error('❌ Error parsing manifest from ZIP:', error);
      return { success: false, error: 'Failed to parse manifest from ZIP' };
    }
  }

  /**
   * Parse CurseForge manifest.json
   */
  private async parseCurseForgeManifest(manifestFile: JSZip.JSZipObject): Promise<{
    success: boolean;
    data?: ParsedModpackData;
    source?: 'curseforge' | 'modrinth';
    error?: string;
  }> {
    try {
      const manifestText = await manifestFile.async('text');
      const manifest: CurseForgeManifest = JSON.parse(manifestText);

      // Extract modloader info from ID (e.g., "forge-47.4.2")
      const primaryModLoader = manifest.minecraft.modLoaders.find(ml => ml.primary);
      if (!primaryModLoader) {
        return { success: false, error: 'No primary modloader found in CurseForge manifest' };
      }

      const modloaderParts = primaryModLoader.id.split('-');
      if (modloaderParts.length < 2) {
        return { success: false, error: 'Invalid modloader format in CurseForge manifest' };
      }

      const modloader = modloaderParts[0].toLowerCase() as 'forge' | 'fabric' | 'neoforge' | 'quilt';
      const modloaderVersion = modloaderParts.slice(1).join('-');

      const parsedData: ParsedModpackData = {
        name: manifest.name,
        version: manifest.version || '1.0.0',
        author: manifest.author || '',
        minecraftVersion: manifest.minecraft.version,
        modloader,
        modloaderVersion,
        recommendedRam: manifest.minecraft.recommendedRam,
        files: manifest.files
      };

      console.log('✅ CurseForge manifest parsed successfully:', parsedData);
      return { success: true, data: parsedData, source: 'curseforge' };
    } catch (error) {
      console.error('❌ Error parsing CurseForge manifest:', error);
      return { success: false, error: 'Failed to parse CurseForge manifest' };
    }
  }

  /**
   * Parse Modrinth modrinth.index.json
   */
  private async parseModrinthManifest(manifestFile: JSZip.JSZipObject): Promise<{
    success: boolean;
    data?: ParsedModpackData;
    source?: 'curseforge' | 'modrinth';
    error?: string;
  }> {
    try {
      const manifestText = await manifestFile.async('text');
      const manifest: ModrinthManifest = JSON.parse(manifestText);

      // Validate it's a Minecraft modpack
      if (manifest.game !== 'minecraft') {
        return { success: false, error: `Modpack is not for Minecraft (game: ${manifest.game})` };
      }

      // Extract Minecraft version from dependencies
      const minecraftVersion = manifest.dependencies['minecraft'];
      if (!minecraftVersion) {
        return { success: false, error: 'No Minecraft version found in Modrinth manifest' };
      }

      // Extract modloader from dependencies
      let modloader: 'forge' | 'fabric' | 'neoforge' | 'quilt' = 'forge';
      let modloaderVersion = '';

      if (manifest.dependencies['forge']) {
        modloader = 'forge';
        modloaderVersion = manifest.dependencies['forge'];
      } else if (manifest.dependencies['neoforge']) {
        modloader = 'neoforge';
        modloaderVersion = manifest.dependencies['neoforge'];
      } else if (manifest.dependencies['fabric-loader']) {
        modloader = 'fabric';
        modloaderVersion = manifest.dependencies['fabric-loader'];
      } else if (manifest.dependencies['quilt-loader']) {
        modloader = 'quilt';
        modloaderVersion = manifest.dependencies['quilt-loader'];
      }

      if (!modloaderVersion) {
        return { success: false, error: 'No modloader found in Modrinth manifest dependencies' };
      }

      const parsedData: ParsedModpackData = {
        name: manifest.name,
        version: manifest.versionId || '1.0.0',
        author: '', // Modrinth manifest doesn't include author
        minecraftVersion,
        modloader,
        modloaderVersion,
        recommendedRam: undefined, // Modrinth format doesn't have this
        files: [] // Modrinth uses a different file format, not needed for validation
      };

      console.log('✅ Modrinth manifest parsed successfully:', parsedData);
      return { success: true, data: parsedData, source: 'modrinth' };
    } catch (error) {
      console.error('❌ Error parsing Modrinth manifest:', error);
      return { success: false, error: 'Failed to parse Modrinth manifest' };
    }
  }

  /**
   * Create a new modpack
   */
  async createModpack(modpackData: {
    slug: string;
    category: 'official' | 'partner' | 'community';
    name: Record<string, string>; // { en: "...", es: "..." }
    shortDescription: Record<string, string>;
    description: Record<string, string>;
    version: string;
    minecraftVersion: string;
    modloader: 'forge' | 'fabric' | 'neoforge' | 'quilt';
    modloaderVersion: string;
    recommendedRam?: number;
    gamemode?: string;
    serverIp?: string;
    primaryColor?: string;
    isComingSoon?: boolean;
    allowCustomMods?: boolean;
    allowCustomResourcepacks?: boolean;
  }): Promise<{ success: boolean; modpackId?: string; error?: string }> {
    try {
      // Check permissions (Discord authentication is required, not Microsoft)
      const { canManage, role } = await this.canManageModpacks();
      if (!canManage) {
        return { success: false, error: 'Insufficient permissions' };
      }

      // Get authenticated user from Supabase
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser) {
        return { success: false, error: 'User not authenticated' };
      }

      // Get user data from users table
      const { data: userData } = await supabase
        .from('users')
        .select('id, partner_id')
        .eq('id', authUser.id)
        .single() as { data: { id: string; partner_id: string | null } | null };

      if (!userData) {
        return { success: false, error: 'User profile not found' };
      }

      // Determine category based on role if not specified
      let category = modpackData.category;
      if (role === 'admin' && !category) {
        category = 'official';
      } else if (role === 'partner' && !category) {
        category = 'partner';
      } else if (!category) {
        category = 'community';
      }

      const insertResult = await supabase
        .from('modpacks')
        .insert({
          slug: modpackData.slug,
          category,
          name_i18n: modpackData.name,
          short_description_i18n: modpackData.shortDescription,
          description_i18n: modpackData.description,
          version: modpackData.version,
          minecraft_version: modpackData.minecraftVersion,
          modloader: modpackData.modloader,
          modloader_version: modpackData.modloaderVersion,
          recommended_ram: modpackData.recommendedRam || null,
          gamemode: modpackData.gamemode || null,
          server_ip: modpackData.serverIp || null,
          primary_color: modpackData.primaryColor || null,
          author_id: userData.id,
          partner_id: userData.partner_id, // Save partner_id if available
          // Coming soon modpacks don't need a ZIP file, so mark as completed immediately
          upload_status: modpackData.isComingSoon ? 'completed' : 'pending',
          is_active: false, // Activate after uploading files
          is_coming_soon: modpackData.isComingSoon || false,
          allow_custom_mods: modpackData.allowCustomMods ?? true,
          allow_custom_resourcepacks: modpackData.allowCustomResourcepacks ?? true,
        } as any)
        .select('id')
        .single();
      const { data, error } = insertResult as { data: { id: string } | null; error: any };

      if (error) {
        console.error('Error creating modpack:', error);
        return { success: false, error: error.message };
      }

      // Create initial version entry only for non-coming-soon modpacks
      // Coming soon modpacks don't need a version entry until they have a file
      if (data?.id && !modpackData.isComingSoon) {
        await supabase
          .from('modpack_versions')
          .insert({
            modpack_id: data.id,
            version: modpackData.version,
            changelog_i18n: { en: 'Initial release', es: 'Lanzamiento inicial' },
            file_url: null // Will be updated after file upload
          } as any);
      }

      return { success: true, modpackId: data?.id || '' };
    } catch (error) {
      console.error('Error creating modpack:', error);
      return { success: false, error: 'Failed to create modpack' };
    }
  }

  /**
   * Get versions for a modpack
   */
  async getModpackVersions(modpackId: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('modpack_versions')
        .select('*')
        .eq('modpack_id', modpackId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching versions:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data || [] };
    } catch (error) {
      console.error('Error fetching versions:', error);
      return { success: false, error: 'Failed to fetch versions' };
    }
  }

  /**
   * Upload modpack ZIP file to R2
   */
  async uploadModpackFile(
    modpackId: string,
    file: File,
    onProgress?: (_progress: number) => void
  ): Promise<{ success: boolean; fileUrl?: string; filePath?: string; sha256?: string; error?: string }> {
    try {
      console.log('📤 Starting file upload:', file.name, file.size, 'bytes');

      // Calculate SHA256 hash for integrity verification
      console.log('🔐 Calculating SHA256 hash...');
      const sha256 = await this.calculateSHA256(file);
      console.log('✅ SHA256:', sha256);

      // Create FormData with file and modpackId
      const formData = new FormData();
      formData.append('file', file);
      formData.append('modpackId', modpackId);
      formData.append('sha256', sha256);

      // Upload using Edge Function proxy
      const xhr = new XMLHttpRequest();

      return new Promise((resolve) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            const percentComplete = (e.loaded / e.total) * 100;
            onProgress(percentComplete);
            console.log(`📊 Upload progress: ${percentComplete.toFixed(1)}%`);
          }
        });

        xhr.addEventListener('load', async () => {
          console.log('Upload response status:', xhr.status);
          console.log('Upload response:', xhr.responseText);

          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (response.success) {
                resolve({
                  success: true,
                  fileUrl: response.fileUrl,
                  filePath: response.filePath,
                  sha256: sha256
                });

                // If this upload is for a specific version, update the version record
                // This is handled by the caller usually, but we could add logic here if needed
              } else {
                resolve({
                  success: false, error: response.error || 'Upload failed'
                });
              }
            } catch (parseError) {
              console.error('Error parsing response:', parseError);
              resolve({ success: false, error: 'Invalid response from server' });
            }
          } else {
            console.error('Upload failed with status:', xhr.status, xhr.statusText);
            resolve({ success: false, error: `Upload failed with status ${xhr.status}: ${xhr.statusText}` });
          }
        });

        xhr.addEventListener('error', (e) => {
          console.error('XHR error event:', e);
          resolve({ success: false, error: 'Upload failed - network error' });
        });

        // Get Supabase session for authorization
        supabase.auth.getSession().then(({ data: { session } }) => {
          const functionUrl = `${supabaseUrl}/functions/v1/upload-modpack-file`;
          console.log('📡 Uploading to:', functionUrl);

          xhr.open('POST', functionUrl);
          xhr.setRequestHeader('Authorization', `Bearer ${session?.access_token}`);
          xhr.send(formData);
        });
      });
    } catch (error) {
      console.error('Error uploading modpack file:', error);
      return { success: false, error: 'Upload failed' };
    }
  }

  /**
   * Calculate SHA256 hash of a file
   */
  private async calculateSHA256(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  /**
   * Update modpack metadata
   */
  async updateModpack(
    modpackId: string,
    updates: Partial<{
      name: Record<string, string>;
      shortDescription: Record<string, string>;
      description: Record<string, string>;
      version: string;
      minecraftVersion: string;
      modloaderVersion: string;
      gamemode: string;
      serverIp: string;
      primaryColor: string;
      isActive: boolean;
      isComingSoon: boolean;
      allowCustomMods: boolean;
      allowCustomResourcepacks: boolean;
      recommendedRam: number;
    }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Verify permissions first
      const permissionCheck = await this.verifyModpackOwnership(modpackId);
      if (!permissionCheck.hasPermission) {
        console.error('❌ Permission denied:', permissionCheck.error);
        return { success: false, error: permissionCheck.error || 'Insufficient permissions' };
      }

      const updateData: any = {};

      if (updates.name) updateData.name_i18n = updates.name;
      if (updates.shortDescription) updateData.short_description_i18n = updates.shortDescription;
      if (updates.description) updateData.description_i18n = updates.description;
      if (updates.version) updateData.version = updates.version;
      if (updates.minecraftVersion) updateData.minecraft_version = updates.minecraftVersion;
      if (updates.modloaderVersion) updateData.modloader_version = updates.modloaderVersion;
      if (updates.gamemode !== undefined) updateData.gamemode = updates.gamemode;
      if (updates.serverIp !== undefined) updateData.server_ip = updates.serverIp;
      if (updates.primaryColor !== undefined) updateData.primary_color = updates.primaryColor;
      if (updates.isComingSoon !== undefined) updateData.is_coming_soon = updates.isComingSoon;
      if (updates.allowCustomMods !== undefined) updateData.allow_custom_mods = updates.allowCustomMods;
      if (updates.allowCustomResourcepacks !== undefined) updateData.allow_custom_resourcepacks = updates.allowCustomResourcepacks;
      if (updates.recommendedRam !== undefined) updateData.recommended_ram = updates.recommendedRam;
      if (updates.isActive !== undefined) {
        updateData.is_active = updates.isActive;
        // Set published_at and upload_status when making modpack public for the first time
        if (updates.isActive) {
          // Check if published_at is already set
          const { data: modpack } = await supabase
            .from('modpacks')
            .select('published_at, upload_status')
            .eq('id', modpackId)
            .single();

          if (modpack && !(modpack as any).published_at) {
            updateData.published_at = new Date().toISOString();
          }
          // Ensure upload_status is 'completed' so modpack is visible in public listings
          if (modpack && (modpack as any).upload_status !== 'completed') {
            updateData.upload_status = 'completed';
          }
        }
      }

      const { error }: any = await (supabase as any)
        .from('modpacks')
        .update(updateData)
        .eq('id', modpackId);

      if (error) {
        console.error('Error updating modpack:', error);
        return { success: false, error: error.message };
      }

      // Clear launcher cache if modpack status changed (isActive or isComingSoon updated)
      if (updates.isActive !== undefined || updates.isComingSoon !== undefined) {
        LauncherService.getInstance().clearCache();
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating modpack:', error);
      return { success: false, error: 'Failed to update modpack' };
    }
  }

  /**
   * Upload logo or banner image to R2
   */
  async uploadModpackImage(
    modpackId: string,
    file: File,
    imageType: 'logo' | 'banner'
  ): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    try {
      // Verify permissions first
      const permissionCheck = await this.verifyModpackOwnership(modpackId);
      if (!permissionCheck.hasPermission) {
        console.error('❌ Permission denied:', permissionCheck.error);
        return { success: false, error: permissionCheck.error || 'Insufficient permissions' };
      }

      console.log(`📤 Uploading ${imageType}:`, file.name, file.size, 'bytes');

      // Create FormData with file and modpackId
      const formData = new FormData();
      formData.append('file', file);
      formData.append('modpackId', modpackId);
      formData.append('fileType', imageType); // Tell backend this is an image

      // Get session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      const functionUrl = `${supabaseUrl}/functions/v1/upload-modpack-file`;

      // Upload using Edge Function
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Upload failed:', errorData);
        return { success: false, error: errorData.error || 'Failed to upload image' };
      }

      const result = await response.json();

      if (!result.success) {
        return { success: false, error: result.error || 'Upload failed' };
      }

      // Update modpack with image URL
      const imageUrlField = imageType === 'logo' ? 'logo_url' : 'banner_url';
      const { error: updateError }: any = await (supabase as any)
        .from('modpacks')
        .update({ [imageUrlField]: result.fileUrl })
        .eq('id', modpackId);

      if (updateError) {
        console.error('Error updating modpack with image URL:', updateError);
        return { success: false, error: 'Failed to update modpack' };
      }

      return { success: true, imageUrl: result.fileUrl };
    } catch (error) {
      console.error('Error uploading image:', error);
      return { success: false, error: 'Upload failed' };
    }
  }

  /**
   * Create features for a modpack
   */
  async createModpackFeatures(
    modpackId: string,
    features: Array<{
      title: Record<string, string>; // { en: "...", es: "..." }
      description?: Record<string, string>;
      icon?: string;
    }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (features.length === 0) {
        return { success: true };
      }

      const featureRecords = features.map((feature, index) => ({
        modpack_id: modpackId,
        title_i18n: feature.title,
        description_i18n: feature.description || { en: '', es: '' },
        icon: feature.icon || null,
        sort_order: index
      }));

      const { error } = await supabase
        .from('modpack_features')
        .insert(featureRecords as any) as { error: any };

      if (error) {
        console.error('Error creating features:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error creating features:', error);
      return { success: false, error: 'Failed to create features' };
    }
  }

  /**
   * Upload screenshots/images for a modpack
   */
  async uploadModpackScreenshots(
    modpackId: string,
    files: File[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (files.length === 0) {
        return { success: true };
      }

      // Verify permissions first
      const permissionCheck = await this.verifyModpackOwnership(modpackId);
      if (!permissionCheck.hasPermission) {
        console.error('❌ Permission denied:', permissionCheck.error);
        return { success: false, error: permissionCheck.error || 'Insufficient permissions' };
      }

      // Get session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      const functionUrl = `${supabaseUrl}/functions/v1/upload-modpack-file`;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        console.log(`📤 Uploading screenshot ${i + 1}/${files.length}:`, file.name);

        // Create FormData
        const formData = new FormData();
        formData.append('file', file);
        formData.append('modpackId', modpackId);
        formData.append('fileType', 'screenshot');
        formData.append('sortOrder', i.toString());

        // Upload using Edge Function
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: formData
        });

        if (!response.ok) {
          console.error('Failed to upload screenshot');
          continue;
        }

        const result = await response.json();

        if (!result.success) {
          console.error('Screenshot upload failed:', result.error);
          continue;
        }

        // Insert into modpack_images
        await supabase
          .from('modpack_images')
          .insert({
            modpack_id: modpackId,
            image_path: result.filePath,
            image_url: result.fileUrl,
            sort_order: i,
            size_bytes: file.size
          } as any);
      }

      return { success: true };
    } catch (error) {
      console.error('Error uploading screenshots:', error);
      return { success: false, error: 'Failed to upload screenshots' };
    }
  }

  /**
   * Get user's modpacks
   * Cached for 2 minutes to reduce redundant fetches during navigation
   */
  async getUserModpacks(): Promise<any[]> {
    const cacheKey = 'user_modpacks';

    // Check cache first
    const cached = this.getCache<any[]>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return [];
      }

      // Get user profile to check role and partner
      const { data: profile } = await supabase
        .from('users')
        .select('role, partner_id')
        .eq('id', user.id)
        .single() as { data: any };

      if (!profile) {
        // Fallback to author_id filter if profile not found
        const { data, error } = await supabase
          .from('modpacks')
          .select('*')
          .eq('author_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error getting user modpacks:', error);
          return [];
        }

        const result = data || [];
        this.setCache(cacheKey, result, MODPACK_MGMT_CACHE_TTL.USER_MODPACKS);
        return result;
      }

      let query = supabase.from('modpacks').select('*');

      // Filter based on role
      if (profile.role === 'admin') {
        // Admins see only official modpacks
        query = query.eq('category', 'official');
      } else if (profile.role === 'partner' && profile.partner_id) {
        // Partners see only modpacks from their partner organization
        query = query.eq('partner_id', profile.partner_id);
      } else {
        // Community users see only their own modpacks
        query = query.eq('author_id', user.id);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.error('Error getting user modpacks:', error);
        return [];
      }

      const result = data || [];
      this.setCache(cacheKey, result, MODPACK_MGMT_CACHE_TTL.USER_MODPACKS);
      return result;
    } catch (error) {
      console.error('Error getting user modpacks:', error);
      return [];
    }
  }

  /**
   * Get features for a modpack
   */
  async getModpackFeatures(modpackId: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('modpack_features')
        .select('*')
        .eq('modpack_id', modpackId)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('Error fetching features:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data || [] };
    } catch (error) {
      console.error('Error fetching features:', error);
      return { success: false, error: 'Failed to fetch features' };
    }
  }

  /**
   * Get images for a modpack
   */
  async getModpackImages(modpackId: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('modpack_images')
        .select('*')
        .eq('modpack_id', modpackId)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('Error fetching images:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data || [] };
    } catch (error) {
      console.error('Error fetching images:', error);
      return { success: false, error: 'Failed to fetch images' };
    }
  }

  /**
   * Delete a modpack feature
   */
  async deleteModpackFeature(featureId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('modpack_features')
        .delete()
        .eq('id', featureId);

      if (error) {
        console.error('Error deleting feature:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting feature:', error);
      return { success: false, error: 'Failed to delete feature' };
    }
  }

  /**
   * Delete a modpack image
   */
  async deleteModpackImage(imageId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('modpack_images')
        .delete()
        .eq('id', imageId);

      if (error) {
        console.error('Error deleting image:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting image:', error);
      return { success: false, error: 'Failed to delete image' };
    }
  }

  /**
   * Delete a modpack version
   * Will also delete the associated file from R2 if it exists
   */
  async deleteModpackVersion(versionId: string, modpackId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🗑️ Deleting version:', versionId);

      // 0. Verify permissions first
      const permissionCheck = await this.verifyModpackOwnership(modpackId);
      if (!permissionCheck.hasPermission) {
        console.error('❌ Permission denied:', permissionCheck.error);
        return { success: false, error: permissionCheck.error || 'Insufficient permissions' };
      }

      // 1. Get the version to find the file URL
      const { data: version, error: versionError } = await supabase
        .from('modpack_versions')
        .select('file_url, version')
        .eq('id', versionId)
        .single() as { data: { file_url: string | null; version: string } | null; error: any };

      if (versionError) {
        console.error('Error fetching version:', versionError);
        return { success: false, error: versionError.message };
      }

      // 2. Delete the file from R2 if it exists
      if (version?.file_url) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const functionUrl = `${supabaseUrl}/functions/v1/delete-modpack-files`;

          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              modpackId,
              filePaths: [version.file_url]
            })
          });

          if (!response.ok) {
            console.warn('⚠️ Failed to delete file from R2 (continuing anyway)');
          } else {
            console.log('✅ File deleted from R2');
          }
        } catch (r2Error) {
          console.warn('⚠️ Error deleting file from R2 (continuing anyway):', r2Error);
        }
      }

      // 3. Delete the version from the database
      const { error: deleteError } = await supabase
        .from('modpack_versions')
        .delete()
        .eq('id', versionId);

      if (deleteError) {
        console.error('Error deleting version:', deleteError);
        return { success: false, error: deleteError.message };
      }

      console.log('✅ Version deleted successfully');
      return { success: true };
    } catch (error) {
      console.error('Error deleting version:', error);
      return { success: false, error: 'Failed to delete version' };
    }
  }

  /**
   * Delete a modpack and all its associated files from R2
   */
  async deleteModpack(modpackId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🗑️ Deleting modpack:', modpackId);

      // Get authenticated user from Supabase
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser) {
        console.error('❌ User not authenticated');
        return { success: false, error: 'User not authenticated' };
      }

      console.log('📊 Fetching modpack details...');

      // Get modpack details to verify ownership and get file paths
      // Note: file_url is in modpack_versions, not modpacks table
      const { data: modpack, error: modpackError } = await supabase
        .from('modpacks')
        .select(`
          id,
          author_id,
          category,
          logo_url,
          banner_url,
          modpack_versions (
            file_url
          )
        `)
        .eq('id', modpackId)
        .single() as { data: any; error: any };

      if (modpackError) {
        console.error('❌ Error fetching modpack:', modpackError);
        return { success: false, error: `Modpack query failed: ${modpackError.message}` };
      }

      if (!modpack) {
        console.error('❌ Modpack not found');
        return { success: false, error: 'Modpack not found' };
      }

      console.log('✅ Modpack found:', modpack.id);
      console.log('📊 Fetching user data...');

      // Get user ID from users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, role, partner_id')
        .eq('id', authUser.id)
        .single() as { data: any; error: any };

      if (userError) {
        console.error('❌ Error fetching user data:', userError);
        return { success: false, error: `User query failed: ${userError.message}` };
      }

      if (!userData) {
        console.error('❌ User profile not found');
        return { success: false, error: 'User profile not found' };
      }

      console.log('✅ User data found:', userData.id, 'Role:', userData.role, 'Partner:', userData.partner_id);

      // Get author's partner_id if they're a partner (to check if same partner)
      let authorPartnerId: string | null = null;
      if (modpack.category === 'partner') {
        const { data: authorData, error: authorError } = await supabase
          .from('users')
          .select('partner_id')
          .eq('id', modpack.author_id)
          .single() as { data: any; error: any };

        if (!authorError && authorData) {
          authorPartnerId = authorData.partner_id;
        }
      }

      // Check permissions:
      // - Owner can always delete their modpack
      // - Admins can delete any modpack
      // - Partners can delete modpacks from the same partner (if category is 'partner')
      const isOwner = modpack.author_id === userData.id;
      const isAdmin = userData.role === 'admin';
      const isSamePartner = modpack.category === 'partner' &&
        userData.partner_id &&
        authorPartnerId &&
        userData.partner_id === authorPartnerId;

      if (!isOwner && !isAdmin && !isSamePartner) {
        console.error('❌ Insufficient permissions. Author:', modpack.author_id, 'User:', userData.id, 'Category:', modpack.category);
        return { success: false, error: 'Insufficient permissions to delete this modpack' };
      }

      console.log('✅ Permissions verified, fetching images...');

      // Get all screenshot paths
      const { data: images, error: imagesError } = await supabase
        .from('modpack_images')
        .select('image_path')
        .eq('modpack_id', modpackId) as { data: any[] | null; error: any };

      if (imagesError) {
        console.warn('⚠️ Error fetching images (continuing anyway):', imagesError);
      }

      console.log('📸 Images found:', images?.length || 0);

      // Collect all file paths to delete
      const filePaths: string[] = [];

      // Get file_url from modpack versions (there could be multiple versions)
      if (modpack.modpack_versions && Array.isArray(modpack.modpack_versions)) {
        modpack.modpack_versions.forEach((version: any) => {
          if (version.file_url) {
            filePaths.push(version.file_url);
          }
        });
      }

      if (modpack.logo_url) {
        // Extract path from URL (e.g., "https://r2.example.com/bucket/modpacks/logo.png" -> "modpacks/logo.png")
        try {
          const logoPath = modpack.logo_url.split('/').slice(3).join('/');
          if (logoPath) filePaths.push(logoPath);
        } catch {
          console.warn('Failed to parse logo_url:', modpack.logo_url);
        }
      }
      if (modpack.banner_url) {
        // Extract path from URL
        try {
          const bannerPath = modpack.banner_url.split('/').slice(3).join('/');
          if (bannerPath) filePaths.push(bannerPath);
        } catch {
          console.warn('Failed to parse banner_url:', modpack.banner_url);
        }
      }
      if (images) {
        images.forEach(img => {
          if (img.image_path) filePaths.push(img.image_path);
        });
      }

      console.log('📁 Files to delete:', filePaths);
      console.log('📦 Modpack data:', { modpackId, versions_count: modpack.modpack_versions?.length || 0, logo_url: modpack.logo_url, banner_url: modpack.banner_url });

      // Delete files from R2 using Edge Function (only if there are files to delete)
      if (filePaths.length > 0) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const functionUrl = `${supabaseUrl}/functions/v1/delete-modpack-files`;

          const requestBody = {
            modpackId,
            filePaths
          };

          console.log('🌐 Calling Edge Function:', functionUrl);
          console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));

          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
          });

          console.log('📥 Response status:', response.status);

          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Failed to delete files from R2:', response.status, errorText);
            // Continue with database deletion even if R2 deletion fails
          } else {
            const responseData = await response.json();
            console.log('✅ Files deleted from R2:', responseData);
          }
        } catch (error) {
          console.error('❌ Error calling delete-modpack-files function:', error);
          // Continue with database deletion even if R2 deletion fails
        }
      } else {
        console.log('ℹ️ No files to delete from R2');
      }

      // Delete modpack from database (cascade will delete related records)
      const { error: deleteError } = await supabase
        .from('modpacks')
        .delete()
        .eq('id', modpackId);

      if (deleteError) {
        console.error('Error deleting modpack from database:', deleteError);
        return { success: false, error: deleteError.message };
      }

      console.log('✅ Modpack deleted successfully');
      return { success: true };
    } catch (error) {
      console.error('Error deleting modpack:', error);
      return { success: false, error: 'Failed to delete modpack' };
    }
  }

  /**
   * Validate if a modpack can be activated (Coming Soon → Active transition)
   */
  async validateActivation(modpackId: string): Promise<{ canActivate: boolean; error?: string }> {
    try {
      const { data: modpack } = await supabase
        .from('modpacks')
        .select('logo_url, banner_url, is_coming_soon')
        .eq('id', modpackId)
        .single();

      if (!modpack) {
        return { canActivate: false, error: 'Modpack not found' };
      }

      // Coming soon modpacks don't need a ZIP file
      if (!(modpack as any).is_coming_soon) {
        // For non-coming-soon modpacks, check if there's a modpack version with a file
        const { data: versions } = await supabase
          .from('modpack_versions')
          .select('file_url')
          .eq('modpack_id', modpackId)
          .limit(1);

        if (!versions || versions.length === 0 || !(versions[0] as any).file_url) {
          return { canActivate: false, error: 'ZIP file is required to activate modpack' };
        }
      }

      if (!(modpack as any).logo_url) {
        return { canActivate: false, error: 'Logo is required' };
      }
      if (!(modpack as any).banner_url) {
        return { canActivate: false, error: 'Banner is required' };
      }

      return { canActivate: true };
    } catch (error) {
      console.error('Error validating activation:', error);
      return { canActivate: false, error: 'Failed to validate activation' };
    }
  }
}

export default ModpackManagementService;
