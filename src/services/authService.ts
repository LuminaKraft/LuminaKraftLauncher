import { invoke } from '@tauri-apps/api/core';
import type { MicrosoftAccount } from '../types/launcher';
import { supabase } from './supabaseClient';

class AuthService {
  private static instance: AuthService;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Initialize anonymous session in Supabase
   * This allows users to browse and download modpacks without logging in
   */
  async initializeAnonymousSession(): Promise<boolean> {
    try {
      // Check if already has a session
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        console.log('✅ Already has Supabase session:', session.user.is_anonymous ? 'anonymous' : 'authenticated');
        return true;
      }

      // Create anonymous session
      const { data, error } = await supabase.auth.signInAnonymously();

      if (error) {
        console.error('❌ Failed to create anonymous session:', error);
        return false;
      }

      console.log('✅ Anonymous Supabase session created');
      return true;
    } catch (error) {
      console.error('❌ Error initializing anonymous session:', error);
      return false;
    }
  }

  /**
   * Authenticate with Supabase using Microsoft account from Lyceris
   * This calls the auth-with-microsoft Edge Function to create/update user profile
   * and establishes an authenticated Supabase session
   */
  async authenticateSupabaseWithMicrosoft(microsoftAccount: MicrosoftAccount): Promise<boolean> {
    try {
      console.log('🔗 Authenticating Microsoft account with Supabase...');

      // Call Edge Function to create/update user and get session tokens
      const { data, error } = await supabase.functions.invoke('auth-with-microsoft', {
        body: {
          microsoft_id: microsoftAccount.xuid,
          minecraft_username: microsoftAccount.username,
          minecraft_uuid: microsoftAccount.uuid,
          email: '', // Lyceris doesn't provide email
          display_name: microsoftAccount.username
        }
      });

      if (error) {
        console.error('❌ Failed to authenticate Microsoft account with Supabase:', error);
        return false;
      }

      if (!data.success) {
        console.error('❌ Authentication failed:', data.error);
        return false;
      }

      // Set authenticated session with tokens from Edge Function
      if (data.session && data.session.access_token && data.session.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        });

        if (sessionError) {
          console.error('❌ Failed to set session:', sessionError);
          return false;
        }

        console.log('✅ Authenticated Supabase session established');
      } else {
        console.warn('⚠️ No session tokens returned from Edge Function');
      }

      console.log('✅ Microsoft account authenticated with Supabase');
      console.log(`   User ID: ${data.user.id}`);
      console.log(`   Role: ${data.user.role}`);
      console.log(`   Display Name: ${data.user.display_name}`);

      return true;
    } catch (error) {
      console.error('❌ Error authenticating Microsoft account with Supabase:', error);
      return false;
    }
  }


  /**
   * Sign out from Supabase and return to anonymous session
   */
  async signOutSupabase(): Promise<void> {
    try {
      await supabase.auth.signOut();
      // Re-initialize anonymous session
      await this.initializeAnonymousSession();
      console.log('✅ Signed out from Supabase, anonymous session restored');
    } catch (error) {
      console.error('❌ Error signing out from Supabase:', error);
    }
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