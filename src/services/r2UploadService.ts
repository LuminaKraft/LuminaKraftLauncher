import { supabase } from './supabaseClient';

interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

/**
 * Direct upload to Cloudflare R2 bucket
 * Uses presigned URLs from the backend for secure, fast uploads
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

      // Step 1: Get presigned URL from backend
      console.log('🔗 Getting presigned URL from backend...');
      const presignedUrlResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-r2-presigned-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modpackId,
          filename: file.name,
          fileType,
        }),
      });

      if (!presignedUrlResponse.ok) {
        const error = await presignedUrlResponse.json();
        throw new Error(error.error || 'Failed to get presigned URL');
      }

      const { url, signedHeaders, publicUrl, fileKey } = await presignedUrlResponse.json();
      console.log('✅ Signed request obtained');

      // Step 2: Upload file directly to R2 using signed headers
      console.log('📤 Uploading file to R2...');

      // Report progress start
      if (onProgress) {
        onProgress({ loaded: 0, total: file.size, percent: 0 });
      }

      const fileBuffer = await file.arrayBuffer();
      const uploadResponse = await fetch(url, {
        method: 'PUT',
        headers: {
          ...signedHeaders,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: fileBuffer,
      });

      if (!uploadResponse.ok) {
        throw new Error(`R2 upload failed: ${uploadResponse.statusText}`);
      }

      console.log('✅ File uploaded to R2');

      // Report progress completion
      if (onProgress) {
        onProgress({ loaded: file.size, total: file.size, percent: 100 });
      }

      // Step 3: Register upload in database
      console.log('💾 Registering upload in database...');
      const registerResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-modpack-upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modpackId,
          fileType,
          fileUrl: publicUrl,
          fileKey,
          fileSize: file.size,
        }),
      });

      if (!registerResponse.ok) {
        const error = await registerResponse.json();
        throw new Error(error.error || 'Failed to register upload');
      }

      console.log('✅ Upload registered in database');
      console.log('✅ File uploaded to R2:', publicUrl);

      return {
        fileUrl: publicUrl,
        fileSize: file.size,
      };
    } catch (error) {
      console.error('❌ Upload failed:', error);
      throw error;
    }
  }
}

export default R2UploadService.getInstance();
