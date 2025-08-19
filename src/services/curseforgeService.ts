import axios from 'axios';
import { CurseForgeModInfo, ProxyResponse, CurseForgeFileInfo } from '../types/curseforge';

// Importamos LauncherService como default y luego lo referenciamos
import LauncherService from './launcherService';

export class CurseForgeService {
  private static instance: CurseForgeService;
  private readonly launcherService: LauncherService;

  private constructor() {
    this.launcherService = LauncherService.getInstance();
    // No need to setup axios defaults here since LauncherService already handles it
    // this.setupAxiosDefaults();
  }

  public static getInstance(): CurseForgeService {
    if (!CurseForgeService.instance) {
      CurseForgeService.instance = new CurseForgeService();
    }
    return CurseForgeService.instance;
  }


  private getProxyBaseUrl(): string {
    const settings = this.launcherService.getUserSettings();
    const baseUrl = settings.launcherDataUrl.replace('/v1/launcher_data.json', '');
    return `${baseUrl}/v1/curseforge`;
  }

  /**
   * Obtiene información de un mod específico a través del proxy
   */
  async getModInfo(modId: number): Promise<CurseForgeModInfo | null> {
    try {
      const url = `${this.getProxyBaseUrl()}/mods/${modId}`;
      console.log(`[CurseForgeService] Making request to: ${url}`);
      const response = await axios.get<ProxyResponse>(url);
      
      if (response.data.status === 200 && response.data.data) {
        return response.data.data;
      }
      
      console.error('Error fetching mod info:', response.data.message);
      return null;
    } catch (error: any) {
      console.error('Error fetching mod info:', error);
      if (error.response?.status === 401) {
        console.error('[CurseForgeService] 401 Unauthorized - authentication headers may be missing');
        console.error('[CurseForgeService] Request headers:', error.config?.headers);
      }
      return null;
    }
  }

  /**
   * Obtiene información sobre un archivo específico de un mod
   */
  async getModFileInfo(modId: number, fileId: number): Promise<CurseForgeFileInfo | null> {
    try {
      const url = `${this.getProxyBaseUrl()}/mods/${modId}/files/${fileId}`;
      const response = await axios.get<ProxyResponse>(url);
      
      if (response.data.status === 200 && response.data.data) {
        const fileInfo = response.data.data;
        
        // La API de CurseForge devuelve información completa incluyendo hashes
        // fileName, downloadUrl, y hashes están disponibles directamente
        console.log(`Información obtenida para archivo ${fileId}: ${fileInfo.fileName || fileInfo.displayName}`);
        
        return fileInfo;
      }
      
      console.error('Error fetching mod file info:', response.data.message);
      return null;
    } catch (error) {
      console.error('Error fetching mod file info:', error);
      return null;
    }
  }

  /**
   * Obtiene información de varios mods en lote
   */
  async getBatchModInfo(modIds: number[]): Promise<CurseForgeModInfo[]> {
    try {
      const url = `${this.getProxyBaseUrl()}/mods`;
      const response = await axios.post<ProxyResponse>(url, { modIds });
      
      if (response.data.status === 200 && Array.isArray(response.data.data)) {
        return response.data.data;
      }
      
      console.error('Error fetching batch mod info:', response.data.message);
      return [];
    } catch (error) {
      console.error('Error fetching batch mod info:', error);
      return [];
    }
  }

  /**
   * Obtiene información de varios archivos de mods en lote
   */
  async getBatchFileInfo(modFiles: { modId: number, fileId: number }[]): Promise<CurseForgeFileInfo[]> {
    try {
      const url = `${this.getProxyBaseUrl()}/mods/files`;
      const response = await axios.post<ProxyResponse>(url, { fileIds: modFiles.map(mf => mf.fileId) });
      
      if (response.data.status === 200 && Array.isArray(response.data.data)) {
        return response.data.data;
      }
      
      console.error('Error fetching batch file info:', response.data.message);
      return [];
    } catch (error) {
      console.error('Error fetching batch file info:', error);
      return [];
    }
  }

  /**
   * Obtiene la URL de descarga de un archivo específico
   */
  async getDownloadUrl(modId: number, fileId: number): Promise<string | null> {
    try {
      const fileInfo = await this.getModFileInfo(modId, fileId);
      return fileInfo?.downloadUrl || null;
    } catch (error) {
      console.error('Error getting download URL:', error);
      return null;
    }
  }

  /**
   * Debug method to test authentication with the proxy
   */
  async testAuthentication(): Promise<boolean> {
    try {
      const url = `${this.getProxyBaseUrl()}/test`;
      console.log(`[CurseForgeService] Testing authentication with: ${url}`);
      const response = await axios.get(url);
      console.log('[CurseForgeService] Authentication test successful:', response.data);
      return true;
    } catch (error: any) {
      console.error('[CurseForgeService] Authentication test failed:', error);
      if (error.response?.status === 401) {
        console.error('[CurseForgeService] 401 Unauthorized - authentication headers missing or invalid');
        console.error('[CurseForgeService] Request headers:', error.config?.headers);
      }
      return false;
    }
  }
} 