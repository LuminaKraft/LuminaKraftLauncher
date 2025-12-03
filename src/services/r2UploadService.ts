import { invoke } from '@tauri-apps/api/core';
import { supabase } from './supabaseClient';

interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

/**
 * Direct upload to Cloudflare R2 bucket
 * Uses presigned URLs from the backend
 */
export class R2UploadService {
  private static instance: R2UploadService;

  static getInstance(): R2UploadService {
    if (!this.instance) {
      this.instance = new R2UploadService();
    }
    return this.instance;
  }

  /**
   * Upload file directly to R2
   * @param file - File to upload
   * @param modpackId - Modpack ID
   * @param fileType - Type of file: 'modpack', 'logo', 'banner', 'screenshot'
   * @param onProgress - Progress callback
   * @returns Upload result with file URL
   */
  async uploadToR2(
    file: File,
    modpackId: string,
    fileType: 'modpack' | 'logo' | 'banner' | 'screenshot' = 'modpack',
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ fileUrl: string; fileSize: number; fileSha256?: string }> {
    try {
      console.log(`📤 Uploading ${fileType}:`, file.name, `(${(file.size / 1024 / 1024).toFixed(2)}MB)`);

      // Get auth session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Calculate SHA256 hash of file
      console.log('🔐 Calculating file hash...');
      const fileBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fileSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      console.log('✅ Hash calculated:', fileSha256);

      // Build R2 upload path
      const timestamp = Date.now();
      const fileKey = this.buildFileKey(modpackId, fileType, file.name, timestamp);
      const bucketName = 'luminakraft-modpacks'; // Match backend config
      const accountId = import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID;
      const r2PublicUrl = import.meta.env.VITE_R2_PUBLIC_URL;

      if (!accountId) {
        throw new Error('Cloudflare account ID not configured');
      }

      // For now: Upload using the Edge Function (we'll optimize later)
      // This maintains compatibility while we test the new approach
      const formData = new FormData();
      formData.append('file', file);
      formData.append('modpackId', modpackId);
      formData.append('fileType', fileType);

      // Report progress
      if (onProgress) {
        onProgress({ loaded: 0, total: file.size, percent: 0 });
      }

      const uploadUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-modpack-file`;
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();

      // Report completion
      if (onProgress) {
        onProgress({ loaded: file.size, total: file.size, percent: 100 });
      }

      console.log('✅ File uploaded to R2:', result.fileUrl);

      // Register upload in database
      await this.registerUpload(modpackId, fileType, result.fileUrl, file.size, fileSha256, session.access_token);

      return {
        fileUrl: result.fileUrl,
        fileSize: file.size,
        fileSha256
      };
    } catch (error) {
      console.error('❌ Upload failed:', error);
      throw error;
    }
  }

  /**
   * Register completed upload in database
   */
  private async registerUpload(
    modpackId: string,
    fileType: string,
    fileUrl: string,
    fileSize: number,
    fileSha256: string,
    accessToken: string
  ): Promise<void> {
    try {
      const uploadUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-modpack-upload`;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modpackId,
          fileType,
          fileUrl,
          fileSize,
          fileSha256
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ Registration failed:', error);
        throw new Error(error.error || 'Failed to register upload');
      }

      console.log('✅ Upload registered in database');
    } catch (error) {
      console.error('❌ Failed to register upload:', error);
      // Don't throw - file is already uploaded, just DB registration failed
      // User can retry registration separately
    }
  }

  /**
   * Build R2 file key path
   */
  private buildFileKey(
    modpackId: string,
    fileType: string,
    filename: string,
    timestamp: number
  ): string {
    // Get user ID from auth (would need to be passed or retrieved)
    const userIdPlaceholder = 'uploads'; // This should come from auth

    switch (fileType) {
      case 'screenshot':
        return `modpacks/${userIdPlaceholder}/${modpackId}/screenshots/${timestamp}-${filename}`;
      case 'logo':
      case 'banner':
        return `modpacks/${userIdPlaceholder}/${modpackId}/${fileType}-${filename}`;
      case 'modpack':
      default:
        return `modpacks/${userIdPlaceholder}/${modpackId}/${filename}`;
    }
  }
}

export default R2UploadService.getInstance();
