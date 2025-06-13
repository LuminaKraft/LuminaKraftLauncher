import { invoke } from '@tauri-apps/api/core';
import type { MicrosoftAccount } from '../types/launcher';

class AuthService {
  private static instance: AuthService;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Creates a Microsoft authentication link
   */
  async createMicrosoftAuthLink(): Promise<string> {
    try {
      return await invoke<string>('create_microsoft_auth_link');
    } catch (error) {
      throw new Error(`Failed to create Microsoft auth link: ${error}`);
    }
  }

  /**
   * Authenticates with Microsoft using the authorization code
   */
  async authenticateMicrosoft(code: string): Promise<MicrosoftAccount> {
    try {
      return await invoke<MicrosoftAccount>('authenticate_microsoft', { code });
    } catch (error) {
      throw new Error(`Failed to authenticate with Microsoft: ${error}`);
    }
  }

  /**
   * Refreshes the Microsoft token
   */
  async refreshMicrosoftToken(refreshToken: string): Promise<MicrosoftAccount> {
    try {
      return await invoke<MicrosoftAccount>('refresh_microsoft_token', { 
        refreshToken 
      });
    } catch (error) {
      throw new Error(`Failed to refresh Microsoft token: ${error}`);
    }
  }

  /**
   * Validates if the Microsoft token is still valid
   */
  async validateMicrosoftToken(exp: number): Promise<boolean> {
    try {
      return await invoke<boolean>('validate_microsoft_token', { exp });
    } catch (error) {
      throw new Error(`Failed to validate Microsoft token: ${error}`);
    }
  }

  /**
   * Checks if the current Microsoft account needs token refresh
   */
  async checkAndRefreshToken(account: MicrosoftAccount): Promise<MicrosoftAccount | null> {
    try {
      const isValid = await this.validateMicrosoftToken(account.exp);
      
      if (!isValid) {
        console.log('Microsoft token expired, refreshing...');
        return await this.refreshMicrosoftToken(account.refreshToken);
      }
      
      return account;
    } catch (error) {
      console.error('Failed to refresh Microsoft token:', error);
      return null;
    }
  }

  /**
   * Opens Microsoft authentication and returns the auth URL
   */
  async openMicrosoftAuthAndGetUrl(): Promise<string> {
    try {
      const authUrl = await invoke<string>('open_microsoft_auth_and_get_url');
      // Open URL in browser using Tauri's opener
      await invoke('open_url', { url: authUrl });
      return authUrl;
    } catch (error) {
      throw new Error(`Failed to open Microsoft authentication: ${error}`);
    }
  }

  /**
   * Extracts authorization code from a redirect URL
   */
  async extractCodeFromUrl(url: string): Promise<string> {
    try {
      return await invoke<string>('extract_code_from_redirect_url', { url });
    } catch (error) {
      throw new Error(`Failed to extract code: ${error}`);
    }
  }

  /**
   * Opens Microsoft authentication in a modal window and completes the flow automatically
   * (Similar to how Modrinth does it)
   */
  async authenticateWithMicrosoftModal(): Promise<MicrosoftAccount> {
    try {
      // Step 1: Open modal window and wait for auth code
      const authCode = await invoke<string>('open_microsoft_auth_modal');
      
      // Step 2: Complete authentication with the code
      const account = await invoke<MicrosoftAccount>('authenticate_microsoft', { code: authCode });
      
      return account;
    } catch (error) {
      console.error('Error during Microsoft authentication:', error);
      throw new Error(`Authentication failed: ${error}`);
    }
  }
}

export default AuthService; 