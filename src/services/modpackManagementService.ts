import { supabase } from './supabaseClient';
import type { MicrosoftAccount } from '../types/launcher';

/**
 * Service for managing modpack creation and updates
 * Used by partners and community members
 */
export class ModpackManagementService {
  private static instance: ModpackManagementService;
  private microsoftAccount: MicrosoftAccount | null = null;

  public static getInstance(): ModpackManagementService {
    if (!ModpackManagementService.instance) {
      ModpackManagementService.instance = new ModpackManagementService();
    }
    return ModpackManagementService.instance;
  }

  /**
   * Set the Microsoft account for the current session
   * This should be called after Microsoft authentication
   */
  public setMicrosoftAccount(account: MicrosoftAccount | null): void {
    this.microsoftAccount = account;
  }

  /**
   * Check if the current user can create/edit modpacks
   * Requires Microsoft authentication
   */
  async canManageModpacks(microsoftAccount?: MicrosoftAccount | null): Promise<{
    canManage: boolean;
    role: 'admin' | 'partner' | 'user' | null;
  }> {
    try {
      // Use provided account or stored account
      const account = microsoftAccount || this.microsoftAccount;

      // User must be authenticated with Microsoft
      if (!account) {
        return { canManage: false, role: null };
      }

      // Look up user by microsoft_id
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('microsoft_id', account.xuid)
        .single();

      if (!profile) {
        return { canManage: false, role: null };
      }

      const role = profile.role as 'admin' | 'partner' | 'user';

      // Only admin, partner, and authenticated users (community) can manage
      const canManage = ['admin', 'partner', 'user'].includes(role);

      return { canManage, role };
    } catch (error) {
      console.error('Error checking user permissions:', error);
      return { canManage: false, role: null };
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
    gamemode?: string;
    serverIp?: string;
    primaryColor?: string;
  }): Promise<{ success: boolean; modpackId?: string; error?: string }> {
    try {
      if (!this.microsoftAccount) {
        return { success: false, error: 'User not authenticated with Microsoft' };
      }

      // Check permissions
      const { canManage, role } = await this.canManageModpacks();
      if (!canManage) {
        return { success: false, error: 'Insufficient permissions' };
      }

      // Get user ID from users table
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('microsoft_id', this.microsoftAccount.xuid)
        .single();

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

      const { data, error } = await supabase
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
          gamemode: modpackData.gamemode || null,
          server_ip: modpackData.serverIp || null,
          primary_color: modpackData.primaryColor || null,
          author_id: userData.id,
          upload_status: 'pending',
          is_active: false, // Activate after uploading files
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creating modpack:', error);
        return { success: false, error: error.message };
      }

      return { success: true, modpackId: data.id };
    } catch (error) {
      console.error('Error creating modpack:', error);
      return { success: false, error: 'Failed to create modpack' };
    }
  }

  /**
   * Upload modpack ZIP file to R2
   */
  async uploadModpackFile(
    modpackId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; fileUrl?: string; error?: string }> {
    try {
      // Step 1: Generate presigned URL
      const { data: urlData, error: urlError } = await supabase.functions.invoke(
        'generate-r2-upload-url',
        {
          body: {
            modpackId,
            fileName: file.name,
            fileSize: file.size,
            contentType: 'application/zip'
          }
        }
      );

      if (urlError || !urlData) {
        console.error('Error generating upload URL:', urlError);
        return { success: false, error: 'Failed to generate upload URL' };
      }

      // Step 2: Upload to R2
      const xhr = new XMLHttpRequest();

      return new Promise((resolve) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            const percentComplete = (e.loaded / e.total) * 100;
            onProgress(percentComplete);
          }
        });

        xhr.addEventListener('load', async () => {
          if (xhr.status === 200) {
            // Step 3: Complete upload
            const { data: completeData, error: completeError } = await supabase.functions.invoke(
              'complete-modpack-upload',
              {
                body: {
                  modpackId,
                  sha256: await this.calculateSHA256(file),
                  actualSize: file.size
                }
              }
            );

            if (completeError) {
              console.error('Error completing upload:', completeError);
              resolve({ success: false, error: 'Failed to complete upload' });
            } else {
              resolve({
                success: true,
                fileUrl: completeData.downloadUrl
              });
            }
          } else {
            resolve({ success: false, error: `Upload failed with status ${xhr.status}` });
          }
        });

        xhr.addEventListener('error', () => {
          resolve({ success: false, error: 'Upload failed' });
        });

        xhr.open('PUT', urlData.presignedUrl);
        xhr.setRequestHeader('Content-Type', 'application/zip');
        xhr.send(file);
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
    }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
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
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

      const { error } = await supabase
        .from('modpacks')
        .update(updateData)
        .eq('id', modpackId);

      if (error) {
        console.error('Error updating modpack:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating modpack:', error);
      return { success: false, error: 'Failed to update modpack' };
    }
  }

  /**
   * Get user's modpacks
   */
  async getUserModpacks(): Promise<any[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return [];
      }

      const { data, error } = await supabase
        .from('modpacks')
        .select('*')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting user modpacks:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error getting user modpacks:', error);
      return [];
    }
  }
}

export default ModpackManagementService;
