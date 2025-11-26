import { invoke } from '@tauri-apps/api/core';
import type { MicrosoftAccount, DiscordAccount } from '../types/launcher';
import { supabase, updateUser, type Tables } from './supabaseClient';

class AuthService {
  private static instance: AuthService;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Check if user has an active Supabase session
   * Returns session info if exists
   */
  async checkSession(): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        console.log('Active Supabase session:', session.user.is_anonymous ? 'anonymous' : 'authenticated');
        return true;
      }

      console.log('No active Supabase session');
      return false;
    } catch (error) {
      console.error('Error checking session:', error);
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
      console.log('Authenticating Microsoft account with Supabase...');

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
        console.error('Failed to authenticate Microsoft account with Supabase:', error);
        return false;
      }

      if (!data.success) {
        console.error('Authentication failed:', data.error);
        return false;
      }

      // Exchange hashed_token for authenticated session
      if (data.hashed_token) {
        const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
          token_hash: data.hashed_token,
          type: 'recovery'
        });

        if (sessionError) {
          console.error('Failed to verify OTP token:', sessionError);
          return false;
        }

        console.log('Authenticated Supabase session established');
        console.log('   Session user ID:', sessionData.session?.user.id);
        console.log('   Is anonymous:', sessionData.session?.user.is_anonymous);

        // Verify the session is now authenticated
        const { data: { session } } = await supabase.auth.getSession();
        console.log('   Current session role:', session?.user.role);
        console.log('   Current session aud:', session?.user.aud);
      } else {
        console.warn('No hashed_token returned from Edge Function');
        console.log('   Response data:', data);
      }

      console.log('Microsoft account authenticated with Supabase');
      console.log(`   User ID: ${data.user.id}`);
      console.log(`   Role: ${data.user.role}`);
      console.log(`   Display Name: ${data.user.display_name}`);

      return true;
    } catch (error) {
      console.error('Error authenticating Microsoft account with Supabase:', error);
      return false;
    }
  }


  /**
   * Get the current Supabase session access token
   * Returns null if no session exists
   */
  async getSupabaseAccessToken(): Promise<string | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch (error) {
      console.error('Error getting Supabase access token:', error);
      return null;
    }
  }

  /**
   * Sign out from Supabase
   */
  async signOutSupabase(): Promise<void> {
    try {
      await supabase.auth.signOut();
      console.log('Signed out from Supabase');
    } catch (error) {
      console.error('Error signing out from Supabase:', error);
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
   * Opens Microsoft authentication in a modal window and completes the flow automatically
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

  // ============================================================================
  // DISCORD AUTHENTICATION METHODS
  // ============================================================================

  /**
   * Link Discord account using OAuth
   * Opens Discord OAuth in external browser, redirects to luminakraft.com
   * User must manually return to the app after authorization
   */
  async linkDiscordAccount(): Promise<boolean> {
    try {
      console.log('Initiating Discord OAuth...');

      // Get OAuth URL without automatic redirect
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: 'https://luminakraft.com/auth-callback',
          scopes: 'identify guilds guilds.members.read',
          skipBrowserRedirect: true
        }
      });

      if (error || !data?.url) {
        console.error('Discord OAuth error:', error);
        return false;
      }

      // Open OAuth URL in external browser using Tauri command
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_url', { url: data.url });

      console.log('Discord OAuth opened in browser');
      console.log('User will be redirected to https://luminakraft.com/auth-callback after authorization');
      console.log('The web page will automatically trigger the launcher to open via deep link');
      return true;
    } catch (error) {
      console.error('Error linking Discord account:', error);
      return false;
    }
  }

  /**
   * Sync Discord data from Supabase session to database
   * Call this after user returns from OAuth authorization
   */
  async syncDiscordData(): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.log('No session found');
        return false;
      }

      // Check if this is a Discord OAuth session
      const discordUser = session.user.user_metadata;
      if (!discordUser?.provider_id || session.user.app_metadata?.provider !== 'discord') {
        console.log('Not a Discord OAuth session');
        return false;
      }

      console.log('Syncing Discord data from session...');

      // Update users table with Discord data
      // Note: username is the actual Discord username, global_name is the display name
      const updateData = {
        discord_id: discordUser.provider_id,
        discord_username: discordUser.custom_claims?.username || discordUser.name,
        discord_global_name: discordUser.custom_claims?.global_name,
        discord_discriminator: discordUser.custom_claims?.discriminator || '0',
        discord_avatar: discordUser.avatar_url,
        linked_at: new Date().toISOString()
      };

      const { error: updateError } = await updateUser(session.user.id, updateData);

      if (updateError) {
        console.error('Failed to update user with Discord data:', updateError);
        return false;
      }

      // Trigger role sync
      await this.syncDiscordRoles();

      console.log('Discord data synced successfully');
      return true;
    } catch (error) {
      console.error('Error syncing Discord data:', error);
      return false;
    }
  }

  /**
   * Sync Discord roles from server
   * Calls sync-discord-roles Edge Function
   */
  async syncDiscordRoles(): Promise<boolean> {
    try {
      console.log('Syncing Discord roles...');

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('No session, cannot sync roles');
        return false;
      }

      // Get Discord access token from session
      const discordAccessToken = session.provider_token; // Discord OAuth token

      if (!discordAccessToken) {
        console.error('No Discord access token in session');
        console.log('Session details:', {
          hasUser: !!session.user,
          hasProviderToken: !!session.provider_token,
          hasProviderRefreshToken: !!session.provider_refresh_token
        });
        return false;
      }

      console.log('Calling sync-discord-roles Edge Function...');

      // Call Edge Function
      const { data, error } = await supabase.functions.invoke('sync-discord-roles', {
        body: {
          userId: session.user.id,
          discordAccessToken
        }
      });

      if (error) {
        console.error('Failed to sync Discord roles:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return false;
      }

      console.log('Discord roles synced successfully:', data);
      return data.success;
    } catch (error) {
      console.error('Error syncing Discord roles:', error);
      return false;
    }
  }

  /**
   * Check if Discord roles need refresh
   * Returns true if last sync was more than 6 hours ago
   */
  async shouldSyncDiscordRoles(): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return false;

      const { data: profile } = await supabase
        .from('users')
        .select('last_discord_sync, discord_id')
        .eq('id', user.id)
        .single<Pick<Tables<'users'>, 'last_discord_sync' | 'discord_id'>>();

      if (!profile || !profile.discord_id) {
        return false; // No Discord linked
      }

      if (!profile.last_discord_sync) {
        return true; // Never synced
      }

      const lastSync = new Date(profile.last_discord_sync);
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

      return lastSync < sixHoursAgo;
    } catch (error) {
      console.error('Error checking sync status:', error);
      return false;
    }
  }

  /**
   * Get Discord account info from database
   */
  async getDiscordAccount(): Promise<DiscordAccount | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return null;

      const { data: profile } = await supabase
        .from('users')
        .select('discord_id, discord_username, discord_global_name, discord_discriminator, discord_avatar, is_discord_member, has_partner_role, partner_role_id, discord_roles, last_discord_sync')
        .eq('id', user.id)
        .single<Pick<Tables<'users'>, 'discord_id' | 'discord_username' | 'discord_global_name' | 'discord_discriminator' | 'discord_avatar' | 'is_discord_member' | 'has_partner_role' | 'partner_role_id' | 'discord_roles' | 'last_discord_sync'>>();

      if (!profile || !profile.discord_id) {
        return null;
      }

      return {
        id: profile.discord_id,
        username: profile.discord_username || '',
        globalName: profile.discord_global_name,
        discriminator: profile.discord_discriminator || '0',
        avatar: profile.discord_avatar,
        isMember: profile.is_discord_member || false,
        hasPartnerRole: profile.has_partner_role || false,
        partnerRoleId: profile.partner_role_id,
        roles: Array.isArray(profile.discord_roles) ? profile.discord_roles as string[] : [],
        lastSync: profile.last_discord_sync
      };
    } catch (error) {
      console.error('Error getting Discord account:', error);
      return null;
    }
  }

  /**
   * Unlink Discord account
   */
  async unlinkDiscordAccount(): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return false;

      const unlinkData = {
        discord_id: null,
        discord_username: null,
        discord_global_name: null,
        discord_discriminator: null,
        discord_avatar: null,
        is_discord_member: false,
        discord_member_since: null,
        last_discord_sync: null,
        discord_roles: [],
        has_partner_role: false,
        partner_role_id: null,
        linked_at: null
      };
      const { error } = await updateUser(user.id, unlinkData);

      if (error) {
        console.error('Failed to unlink Discord account:', error);
        return false;
      }

      console.log('Discord account unlinked');
      return true;
    } catch (error) {
      console.error('Error unlinking Discord account:', error);
      return false;
    }
  }

  // ============================================================================
  // MINECRAFT USERNAME MANAGEMENT
  // ============================================================================

  /**
   * Update Minecraft username in database
   * Only works for authenticated users (Microsoft/Discord)
   * Maintains history of username changes with timestamps
   */
  async updateMinecraftUsername(newUsername: string): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('No session, cannot update username');
        return false;
      }

      if (session.user.is_anonymous) {
        console.log('Anonymous users cannot update username in database');
        return false;
      }

      // Get current user data
      const { data: currentUser } = await supabase
        .from('users')
        .select('minecraft_username, minecraft_username_history')
        .eq('id', session.user.id)
        .single<Pick<Tables<'users'>, 'minecraft_username' | 'minecraft_username_history'>>();

      // If username hasn't changed, skip update
      if (currentUser?.minecraft_username === newUsername) {
        console.log('Username unchanged, skipping update');
        return true;
      }

      const now = new Date().toISOString();
      const history = Array.isArray(currentUser?.minecraft_username_history)
        ? currentUser.minecraft_username_history as Array<{ username: string; from: string; to: string | null }>
        : [];

      // Close previous entry if exists
      if (currentUser?.minecraft_username) {
        const updatedHistory = history.map((entry) =>
          entry.to === null
            ? { ...entry, to: now }
            : entry
        );

        // Add new entry
        updatedHistory.push({
          username: newUsername,
          from: now,
          to: null
        });

        const updateData = {
          minecraft_username: newUsername,
          minecraft_username_history: updatedHistory,
          updated_at: now
        };
        const { error } = await updateUser(session.user.id, updateData);

        if (error) {
          console.error('Failed to update username with history:', error);
          return false;
        }
      } else {
        // First username for authenticated user
        const firstUpdateData = {
          minecraft_username: newUsername,
          minecraft_username_history: [{
            username: newUsername,
            from: now,
            to: null
          }],
          updated_at: now
        };
        const { error } = await updateUser(session.user.id, firstUpdateData);

        if (error) {
          console.error('Failed to set initial username:', error);
          return false;
        }
      }

      console.log('Minecraft username updated with history:', newUsername);
      return true;
    } catch (error) {
      console.error('Error updating Minecraft username:', error);
      return false;
    }
  }
}

export default AuthService; 