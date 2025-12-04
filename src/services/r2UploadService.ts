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

      const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks
      const isLargeFile = file.size >= CHUNK_SIZE;

      if (isLargeFile) {
        // Large file: Use chunked multipart upload
        return await this.uploadLargeFileMultipart(file, modpackId, fileType, session.access_token, onProgress);
      } else {
        // Small file: Use simple upload
        return await this.uploadSmallFile(file, modpackId, fileType, session.access_token, onProgress);
      }
    } catch (error) {
      console.error('❌ Upload failed:', error);
      throw error;
    }
  }

  /**
   * Upload small file (< 50MB) directly
   */
  private async uploadSmallFile(
    file: File,
    modpackId: string,
    fileType: string,
    accessToken: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ fileUrl: string; fileSize: number; fileSha256?: string }> {
    // Calculate SHA256 hash of file
    console.log('🔐 Calculating file hash...');
    const fileBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    console.log('✅ Hash calculated:', fileSha256);

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
        Authorization: `Bearer ${accessToken}`,
        'X-File-Sha256': fileSha256,
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
  }

  /**
   * Upload large file (>= 50MB) using multipart
   */
  private async uploadLargeFileMultipart(
    file: File,
    modpackId: string,
    fileType: string,
    accessToken: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ fileUrl: string; fileSize: number; fileSha256?: string }> {
    const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    console.log(`📦 Large file detected (${(file.size / 1024 / 1024).toFixed(2)}MB), using multipart with ${totalChunks} chunks`);

    // Step 1: Initiate multipart upload
    console.log('🔵 Initiating multipart upload...');
    const initiateResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-modpack-file`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'initiate-multipart',
        modpackId,
        fileType,
        fileName: file.name,
        fileSize: file.size,
      }),
    });

    if (!initiateResponse.ok) {
      throw new Error('Failed to initiate multipart upload');
    }

    const { uploadId, fileKey } = await initiateResponse.json();
    console.log(`✅ Multipart upload initiated with ID: ${uploadId}`);

    // Step 2: Upload chunks
    const chunks: Array<{ partNumber: number; eTag?: string }> = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      console.log(`📤 Reading chunk ${i + 1}/${totalChunks}...`);
      const chunkBuffer = await chunk.arrayBuffer();

      // Calculate SHA256 of chunk
      const chunkHash = await crypto.subtle.digest('SHA-256', chunkBuffer);
      const chunkHashArray = Array.from(new Uint8Array(chunkHash));
      const chunkSha256 = chunkHashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Upload chunk
      console.log(`📤 Uploading chunk ${i + 1}/${totalChunks}... (${(chunk.size / 1024 / 1024).toFixed(2)}MB)`);
      const chunkFormData = new FormData();
      chunkFormData.append('action', 'upload-chunk');
      chunkFormData.append('chunk', chunk);
      chunkFormData.append('uploadId', uploadId);
      chunkFormData.append('partNumber', String(i + 1));
      chunkFormData.append('sha256', chunkSha256);
      chunkFormData.append('fileKey', fileKey);

      const chunkResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-modpack-file`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: chunkFormData,
      });

      if (!chunkResponse.ok) {
        throw new Error(`Failed to upload chunk ${i + 1}`);
      }

      const chunkResult = await chunkResponse.json();
      if (!chunkResult.eTag) {
        throw new Error(`No eTag returned for chunk ${i + 1}`);
      }

      // Update chunks array with eTag instead of sha256
      chunks[i] = { partNumber: i + 1, eTag: chunkResult.eTag };

      console.log(`✅ Chunk ${i + 1}/${totalChunks} uploaded with ETag: ${chunkResult.eTag}`);

      // Report progress
      if (onProgress) {
        onProgress({
          loaded: end,
          total: file.size,
          percent: Math.round((end / file.size) * 100),
        });
      }
    }

    // Step 3: Complete multipart upload
    console.log('🔵 Completing multipart upload...');
    const completeResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-modpack-file`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'complete-multipart',
        uploadId,
        modpackId,
        fileType,
        fileKey,
        chunks,
      }),
    });

    if (!completeResponse.ok) {
      throw new Error('Failed to complete multipart upload');
    }

    const result = await completeResponse.json();
    console.log('✅ File uploaded to R2:', result.fileUrl);

    return {
      fileUrl: result.fileUrl,
      fileSize: file.size,
      fileSha256: chunks[0]?.sha256, // Not using full file hash for large files
    };
  }

}

export default R2UploadService.getInstance();
