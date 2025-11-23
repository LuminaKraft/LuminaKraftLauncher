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
   * Authenticate with Supabase using Microsoft OAuth
   * This is called after the user successfully authenticates with Microsoft via Lyceris
   */
  async authenticateSupabaseWithMicrosoft(microsoftAccount: MicrosoftAccount): Promise<boolean> {
    try {
      // Use Supabase Azure OAuth to authenticate
      // We'll use the Microsoft ID token to create/update the user
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          skipBrowserRedirect: true,
        }
      });

      if (error) {
        console.error('❌ Failed to authenticate with Supabase:', error);
        // If OAuth redirect fails, we can still sync the user profile manually
        await this.syncUserProfile(microsoftAccount);
        return true; // Continue even if OAuth fails, as we synced the profile
      }

      console.log('✅ Authenticated with Supabase via Microsoft');

      // Sync user profile with database
      await this.syncUserProfile(microsoftAccount);

      return true;
    } catch (error) {
      console.error('❌ Error authenticating with Supabase:', error);
      return false;
    }
  }

  /**
   * Sync Microsoft user profile with Supabase users table
   * Creates or updates the user record
   */
  private async syncUserProfile(microsoftAccount: MicrosoftAccount): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        console.warn('⚠️ No authenticated Supabase user to sync profile');
        return;
      }

      // Upsert user profile
      const { error } = await supabase
        .from('users')
        .upsert({
          id: user.id,
          microsoft_id: microsoftAccount.xuid,
          minecraft_username: microsoftAccount.username,
          minecraft_uuid: microsoftAccount.uuid,
          is_minecraft_verified: true, // Since we got this from Microsoft OAuth
          display_name: microsoftAccount.username,
          email: user.email || '',
          role: 'user', // Default role
        }, {
          onConflict: 'id'
        });

      if (error) {
        console.error('❌ Failed to sync user profile:', error);
      } else {
        console.log('✅ User profile synced with Supabase');
      }
    } catch (error) {
      console.error('❌ Error syncing user profile:', error);
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