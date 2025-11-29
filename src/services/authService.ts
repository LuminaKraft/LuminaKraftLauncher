import { invoke } from '@tauri-apps/api/core';
import type { MicrosoftAccount, DiscordAccount } from '../types/launcher';
import { supabase, updateUser, type Tables } from './supabaseClient';

class AuthService {
  private static instance: AuthService;
  private isSyncingDiscord: boolean = false; // Lock to prevent concurrent Discord data syncs
  private isSyncingRoles: boolean = false; // Lock to prevent concurrent Discord role syncs

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

      // Check if user already has an active session (e.g., Discord already linked)
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;

      if (currentUserId) {
        console.log('User already has active session, will link Microsoft to existing account:', currentUserId);
      }

      // Call Edge Function to create/update user and get session tokens
      const { data, error } = await supabase.functions.invoke('auth-with-microsoft', {
        body: {
          microsoft_id: microsoftAccount.xuid,
          minecraft_username: microsoftAccount.username,
          minecraft_uuid: microsoftAccount.uuid,
          email: '', // Lyceris doesn't provide email
          display_name: microsoftAccount.username,
          user_id: currentUserId || undefined // Send user_id if already logged in
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
   * Uses linkIdentity() if user is logged in, signInWithOAuth() otherwise
   * Opens Discord OAuth in external browser, redirects to luminakraft.com
   */
  async linkDiscordAccount(): Promise<boolean> {
    try {
      console.log('Initiating Discord OAuth...');

      const { supabase } = await import('./supabaseClient');

      // Check if user is already logged in
      const { data: { session } } = await supabase.auth.getSession();

      let data, error;

      if (session) {
        // User logged in → Link identity
        console.log('User logged in, linking Discord identity...');
        const result = await supabase.auth.linkIdentity({
          provider: 'discord',
          options: {
            redirectTo: 'https://luminakraft.com/auth-callback',
            scopes: 'identify guilds guilds.members.read',
            skipBrowserRedirect: true
          }
        });
        data = result.data;
        error = result.error;
      } else {
        // No session → Sign in with OAuth
        console.log('No active session, signing in with Discord...');
        const result = await supabase.auth.signInWithOAuth({
          provider: 'discord',
          options: {
            redirectTo: 'https://luminakraft.com/auth-callback',
            scopes: 'identify guilds guilds.members.read',
            skipBrowserRedirect: true
          }
        });
        data = result.data;
        error = result.error;
      }

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
   * @param providerToken Optional Discord OAuth access token for role sync
   * @param providerRefreshToken Optional Discord OAuth refresh token for future syncs
   */
  async syncDiscordData(providerToken?: string, providerRefreshToken?: string): Promise<boolean> {
    // Prevent concurrent syncs (race condition protection)
    if (this.isSyncingDiscord) {
      console.log('Discord sync already in progress, skipping duplicate call');
      return false;
    }

    this.isSyncingDiscord = true;

    try {
      // Get the fresh user data after setting session
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        // Check if this is a "user doesn't exist" error (happens after DB reset)
        if (userError?.message?.includes('JWT') || userError?.message?.includes('does not exist')) {
          console.warn('Session JWT is invalid (user does not exist in database). Clearing session...');
          await supabase.auth.signOut();
          return false;
        }

        console.error('Failed to get user after setting session:', userError);
        return false;
      }

      console.log('User data retrieved:', {
        userId: user.id,
        provider: user.app_metadata?.provider,
        hasUserMetadata: !!user.user_metadata,
        hasProviderMetadata: !!user.user_metadata?.provider_id,
        hasProviderToken: !!providerToken,
        hasProviderRefreshToken: !!providerRefreshToken
      });

      // Fetch Discord user data from API using provider_token
      let discordUser: any = null;

      if (providerToken) {
        console.log('Fetching Discord user data from API...');
        try {
          const response = await fetch('https://discord.com/api/users/@me', {
            headers: {
              'Authorization': `Bearer ${providerToken}`
            }
          });

          if (!response.ok) {
            console.error('Failed to fetch Discord user data:', response.status);
          } else {
            discordUser = await response.json();
            console.log('Discord user data fetched from API:', {
              id: discordUser.id,
              username: discordUser.username,
              global_name: discordUser.global_name,
              avatar: discordUser.avatar
            });
          }
        } catch (error) {
          console.error('Error fetching Discord user data:', error);
        }
      }

      // Fallback to user metadata if API fetch failed
      if (!discordUser) {
        console.log('Falling back to user metadata...');
        discordUser = {
          id: user.user_metadata?.provider_id,
          username: user.user_metadata?.username || user.user_metadata?.custom_claims?.username,
          global_name: user.user_metadata?.global_name || user.user_metadata?.custom_claims?.global_name,
          avatar_url: user.user_metadata?.avatar_url,
          avatar: user.user_metadata?.avatar
        };
      }

      if (!discordUser?.id) {
        console.error('No Discord ID found');
        return false;
      }

      console.log('Syncing Discord data from session...');
      console.log('Discord user data:', {
        provider_id: discordUser.id,
        username: discordUser.username,
        global_name: discordUser.global_name
      });

      // Update users table with Discord data
      // Note: username is the actual Discord username, global_name is the display name
      // Discord eliminated discriminators, so we don't save it anymore

      // Extract avatar hash
      // If from API: avatar is just the hash
      // If from metadata: avatar_url might be full URL
      let avatarHash = discordUser.avatar || null;
      if (discordUser.avatar_url && !avatarHash) {
        // URL format: https://cdn.discordapp.com/avatars/USER_ID/HASH.png
        const avatarMatch = discordUser.avatar_url.match(/avatars\/\d+\/([^.?]+)/);
        avatarHash = avatarMatch ? avatarMatch[1] : null;
      }

      // Clean username - remove discriminator if present (legacy format username#0000)
      let cleanUsername = discordUser.username || '';
      if (cleanUsername.includes('#')) {
        cleanUsername = cleanUsername.split('#')[0];
      }

      // Fetch current user data to calculate display_name with priority
      const { data: currentUser } = await supabase
        .from('users')
        .select('minecraft_username, email')
        .eq('id', user.id)
        .single();

      // Calculate display_name with priority: Discord global_name > Discord username > Minecraft username > Email > User
      const calculated_display_name =
        discordUser.global_name ||
        cleanUsername ||
        currentUser?.minecraft_username ||
        currentUser?.email?.split('@')[0] ||
        'User';

      const updateData = {
        discord_id: discordUser.id,
        discord_username: cleanUsername,
        discord_global_name: discordUser.global_name,
        discord_avatar: avatarHash,
        discord_linked_at: new Date().toISOString(), // Track when Discord was linked
        email: discordUser.email || currentUser?.email, // Use Discord email if available
        display_name: calculated_display_name
      };

      const { error: updateError } = await updateUser(user.id, updateData);

      if (updateError) {
        console.error('Failed to update user with Discord data:', updateError);
        return false;
      }

      console.log('Discord data updated in database, now syncing roles...');

      // Save provider refresh token in localStorage for future syncs
      if (providerRefreshToken) {
        localStorage.setItem('discord_provider_refresh_token', providerRefreshToken);
        console.log('Discord provider refresh token saved to localStorage');
      }

      // Trigger role sync with provider token if available
      const rolesSuccess = await this.syncDiscordRoles(providerToken, providerRefreshToken);

      if (rolesSuccess) {
        console.log('Discord data and roles synced successfully');
      } else {
        console.warn('Discord data synced but role sync failed');
      }

      return true;
    } catch (error) {
      console.error('Error syncing Discord data:', error);
      return false;
    } finally {
      // Always release the lock
      this.isSyncingDiscord = false;
    }
  }

  /**
   * Sync Discord roles from server
   * Calls sync-discord-roles Edge Function
   * @param providerToken Optional Discord OAuth access token
   * @param providerRefreshToken Optional Discord OAuth refresh token
   */
  async syncDiscordRoles(providerToken?: string, providerRefreshToken?: string): Promise<boolean> {
    // Prevent concurrent role syncs (race condition protection)
    if (this.isSyncingRoles) {
      console.log('Discord role sync already in progress, skipping duplicate call');
      return false;
    }

    this.isSyncingRoles = true;

    try {
      console.log('Syncing Discord roles...');

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('No session, cannot sync roles');
        return false;
      }

      // Get Discord access token from:
      // 1. Parameter (from initial login)
      // 2. Session provider_token (if available)
      let discordAccessToken = providerToken || session.provider_token;

      // Get refresh token from parameter or localStorage
      const refreshToken = providerRefreshToken || localStorage.getItem('discord_provider_refresh_token');

      if (!discordAccessToken) {
        console.log('No access token available, will use refresh token in Edge Function');
      }

      // If we don't have access token but have refresh token, Edge Function will handle it
      if (!discordAccessToken && !refreshToken) {
        console.error('No Discord access token or refresh token available');
        console.log('Please re-link your Discord account');
        return false;
      }

      console.log('=== Calling sync-discord-roles Edge Function ===');
      console.log('  User ID:', session.user.id);
      console.log('  Has Discord access token:', !!discordAccessToken);
      console.log('  Has Discord refresh token:', !!refreshToken);

      // Call Edge Function with access token OR refresh token
      const { data, error} = await supabase.functions.invoke('sync-discord-roles', {
        body: {
          userId: session.user.id,
          discordAccessToken: discordAccessToken || undefined,
          discordRefreshToken: refreshToken || undefined
        }
      });

      if (error) {
        console.error('Failed to sync Discord roles:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return false;
      }

      console.log('Discord roles synced successfully:', data);

      // Update refresh token if a new one was returned (token rotation)
      if (data.newRefreshToken) {
        localStorage.setItem('discord_provider_refresh_token', data.newRefreshToken);
        console.log('✅ New Discord refresh token saved for next sync');
      }

      return data.success;
    } catch (error) {
      console.error('Error syncing Discord roles:', error);
      return false;
    } finally {
      // Always release the lock
      this.isSyncingRoles = false;
    }
  }

  /**
   * Check if Discord roles need refresh
   * Returns true if last sync was more than 6 hours ago
   */
  async shouldSyncDiscordRoles(): Promise<boolean> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      // Handle invalid session (user doesn't exist in DB after reset)
      if (userError?.message?.includes('JWT') || userError?.message?.includes('does not exist')) {
        console.warn('Session JWT is invalid (user does not exist in database). Clearing session...');
        await supabase.auth.signOut();
        return false;
      }

      if (!user) return false;

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('last_discord_sync, discord_linked_at')
        .eq('id', user.id)
        .single<Pick<Tables<'users'>, 'last_discord_sync' | 'discord_linked_at'>>();

      // Handle 403 Forbidden (RLS policy blocking access)
      if (profileError && (profileError.code === 'PGRST301' || profileError.message?.includes('403'))) {
        console.warn('Access forbidden to user profile. Session may be invalid. Clearing session...');
        await supabase.auth.signOut();
        return false;
      }

      if (!profile || !profile.discord_linked_at) {
        return false; // No Discord linked (discord_linked_at is NULL)
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
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      // Handle invalid session (user doesn't exist in DB after reset)
      if (userError?.message?.includes('JWT') || userError?.message?.includes('does not exist')) {
        console.warn('Session JWT is invalid (user does not exist in database). Clearing session...');
        await supabase.auth.signOut();
        return null;
      }

      if (!user) return null;

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('discord_id, discord_username, discord_global_name, discord_avatar, discord_linked_at, is_discord_member, has_partner_role, partner_id, discord_roles, last_discord_sync')
        .eq('id', user.id)
        .single<Pick<Tables<'users'>, 'discord_id' | 'discord_username' | 'discord_global_name' | 'discord_avatar' | 'discord_linked_at' | 'is_discord_member' | 'has_partner_role' | 'partner_id' | 'discord_roles' | 'last_discord_sync'>>();

      // Handle 403 Forbidden (RLS policy blocking access)
      if (profileError && (profileError.code === 'PGRST301' || profileError.message?.includes('403'))) {
        console.warn('Access forbidden to user profile. Session may be invalid. Clearing session...');
        await supabase.auth.signOut();
        return null;
      }

      // Discord is linked only if discord_linked_at is NOT NULL
      if (!profile || !profile.discord_id || !profile.discord_linked_at) {
        return null;
      }

      return {
        id: profile.discord_id,
        username: profile.discord_username || '',
        globalName: profile.discord_global_name,
        discriminator: undefined, // Discord eliminated discriminators
        avatar: profile.discord_avatar || undefined,
        isMember: profile.is_discord_member || false,
        hasPartnerRole: profile.has_partner_role || false,
        partnerId: profile.partner_id,
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

      console.log('Unlinking Discord account...');

      // Remove refresh token from localStorage
      localStorage.removeItem('discord_provider_refresh_token');
      console.log('Removed Discord refresh token from localStorage');

      // Unlink Discord identity from Supabase Auth
      // Note: This may fail if manual linking is disabled in Supabase project settings
      // but we continue anyway to clean up the database
      try {
        const { data: identities } = await supabase.auth.getUserIdentities();
        console.log('User identities:', identities);

        const discordIdentity = identities?.identities?.find(
          (identity) => identity.provider === 'discord'
        );

        if (discordIdentity) {
          console.log('Attempting to unlink Discord identity:', discordIdentity.id);
          const { error: unlinkError } = await supabase.auth.unlinkIdentity(discordIdentity);

          if (unlinkError) {
            // Manual linking may be disabled in Supabase - this is not critical
            // The Discord data will still be cleaned from the database
            console.warn('Could not unlink Discord OAuth identity (manual linking may be disabled):', unlinkError.message);
          } else {
            console.log('Discord identity unlinked from Supabase Auth');
          }
        } else {
          console.log('No Discord identity found in Supabase Auth');
        }
      } catch (identityError) {
        console.warn('Error unlinking Discord identity (continuing with database cleanup):', identityError);
      }

      // Fetch current user data to recalculate display_name
      const { data: currentUser } = await supabase
        .from('users')
        .select('minecraft_username, email')
        .eq('id', user.id)
        .single();

      // Recalculate display_name without Discord (priority: Minecraft > Email > User)
      const calculated_display_name =
        (currentUser as any)?.minecraft_username ||
        (currentUser as any)?.email?.split('@')[0] ||
        'User';

      // Clear ALL Discord data in database
      const unlinkData = {
        discord_id: null,
        discord_username: null,
        discord_global_name: null,
        discord_avatar: null,
        discord_linked_at: null,
        display_name: calculated_display_name
      };

      console.log('Clearing Discord data from database and recalculating display_name...');
      const { error } = await updateUser(user.id, unlinkData);

      if (error) {
        console.error('Failed to update user in database:', error);
        return false;
      }

      console.log('Discord account unlinked successfully');
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