import axios from 'axios';
import { CurseForgeModInfo, ProxyResponse, CurseForgeFileInfo } from '../types/curseforge';

// Importamos LauncherService como default y luego lo referenciamos
import LauncherService from './launcherService';

export class CurseForgeService {
  private static instance: CurseForgeService;
  private readonly launcherService: LauncherService;
  private readonly requestTimeout = 30000; // 30 segundos para descargas

  private constructor() {
    this.launcherService = LauncherService.getInstance();
    this.setupAxiosDefaults();
  }

  public static getInstance(): CurseForgeService {
    if (!CurseForgeService.instance) {
      CurseForgeService.instance = new CurseForgeService();
    }
    return CurseForgeService.instance;
  }

  private setupAxiosDefaults(): void {
    axios.defaults.timeout = this.requestTimeout;
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
      const response = await axios.get<ProxyResponse>(url);
      
      if (response.data.status === 200 && response.data.data) {
        return response.data.data;
      }
      
      console.error('Error fetching mod info:', response.data.message);
      return null;
    } catch (error) {
      console.error('Error fetching mod info:', error);
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
} 