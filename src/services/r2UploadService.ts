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


      // Upload using the Edge Function
      // Edge Function handles AWS4 signing, R2 upload, and database registration
      const formData = new FormData();
      formData.append('file', file);
      formData.append('modpackId', modpackId);
      formData.append('fileType', fileType);
      formData.append('fileSha256', fileSha256);

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

}

export default R2UploadService.getInstance();
