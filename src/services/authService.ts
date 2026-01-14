import { invoke } from '@tauri-apps/api/core';
import type { MicrosoftAccount, DiscordAccount } from '../types/launcher';
import { supabase, updateUser, type Tables } from './supabaseClient';
import { listen } from '@tauri-apps/api/event';

// Cache TTL constants for auth-related data
const AUTH_CACHE_TTL = {
  DISCORD_ACCOUNT: 5 * 60 * 1000, // 5 minutes - Discord profile rarely changes
  DISCORD_ROLES: 30 * 60 * 1000, // 30 minutes - roles change infrequently
} as const;

interface AuthCacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class AuthService {
  // In-memory cache for auth data
  private cache: Map<string, AuthCacheEntry<unknown>> = new Map();
  private static instance: AuthService;
  private isSyncingDiscord: boolean = false; // Lock to prevent concurrent Discord data syncs
  private isSyncingRoles: boolean = false; // Lock to prevent concurrent Discord role syncs

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  // ============================================================================
  // CACHE METHODS
  // ============================================================================

  /**
   * Get cached data if valid (not expired)
   */
  private getCache<T>(key: string): T | null {
    const entry = this.cache.get(key) as AuthCacheEntry<T> | undefined;
    if (!entry) return null;

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cache entry with TTL
   */
  private setCache<T>(key: string, data: T, ttl: number): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl
    });
  }

  /**
   * Clear all auth-related caches (call after auth state changes)
   */
  public clearPermissionCache(): void {
    this.cache.clear();
    console.log('🗑️ Auth permission cache cleared');
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
   * Sign out from LuminaKraft Account (Supabase session)
   * Note: This does NOT affect Microsoft Minecraft account (stored locally)
   */
  async signOutSupabase(): Promise<void> {
    try {
      await supabase.auth.signOut();

      // Clean up Discord provider tokens from localStorage
      localStorage.removeItem('discord_provider_refresh_token');

      // Clear cached permission data
      this.clearPermissionCache();

      console.log('✅ Signed out from LuminaKraft Account');
    } catch (error) {
      console.error('Error signing out from Supabase:', error);
      throw error;
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
   * Sign in to LuminaKraft Account using web-based OAuth flow
   * Opens browser to /auth/sign-in with HTTP server callback
   */
  async signInToLuminaKraftAccount(): Promise<boolean> {
    try {
      // 1. Start HTTP server and get port
      const port = await invoke<number>('start_oauth_server');

      // 2. Set up event listener for oauth callback
      const unlisten = await listen<{
        access_token: string;
        refresh_token: string;
        provider_token?: string;
        provider_refresh_token?: string;
      }>(
        'oauth-callback',
        async (event) => {
          try {
            const { access_token, refresh_token, provider_token, provider_refresh_token } = event.payload;

            // 3. Establish Supabase session with received tokens
            // Don't await - let it process in background
            supabase.auth.setSession({
              access_token,
              refresh_token
            }).catch(err => {
              console.error('SetSession error:', err);
            });

            // Focus the launcher window immediately
            try {
              await invoke('focus_window');
            } catch (focusError) {
              console.warn('Failed to focus window:', focusError);
            }

            // Wait a bit for session to be processed, then emit update event
            await new Promise(resolve => setTimeout(resolve, 500));

            // Emit profile update event (listeners will handle fetching user)
            this.emitProfileUpdate();

            // Run sync operations in background (don't block)
            setTimeout(async () => {
              try {
                const { data: { user } } = await supabase.auth.getUser();

                if (!user) {
                  return;
                }

                const identities = user.identities || [];
                const discordIdentity = identities.find((id: any) => id.provider === 'discord');
                const currentProvider = user.app_metadata.provider;

                if (currentProvider === 'discord' && provider_token) {
                  try {
                    await this.syncDiscordData(provider_token, provider_refresh_token);
                  } catch (err) {
                    console.error('SyncDiscordData failed:', err);
                  }
                } else if (discordIdentity) {
                  try {
                    await this.syncDiscordData();
                  } catch (err) {
                    console.error('Background SyncDiscordData failed:', err);
                  }
                }

                // Sync Microsoft data if available locally
                await this.syncMicrosoftData();
              } catch (err) {
                console.error('Background sync error:', err);
              }
            }, 1000);
          } catch (e) {
            console.error('Error in oauth-callback listener:', e);
          } finally {
            unlisten();
          }
        }
      );

      // 4. Open browser to sign in page
      const url = `https://luminakraft.com/auth/sign-in?launcher=true&port=${port}`;
      await invoke('open_url', { url });

      return true;
    } catch (error) {
      console.error('OAuth flow failed:', error);
      return false;
    }
  }

  /**
   * Sign up for LuminaKraft Account using web-based OAuth flow
   * Opens browser to /auth/sign-up with HTTP server callback
   */
  async signUpLuminaKraftAccount(): Promise<boolean> {
    try {
      console.log('Starting LuminaKraft Account sign up flow...');

      // 1. Start HTTP server and get port
      const port = await invoke<number>('start_oauth_server');
      console.log(`OAuth server started on port ${port}`);

      // 2. Set up event listener for oauth callback
      const unlisten = await listen<{
        access_token: string;
        refresh_token: string;
        provider_token?: string;
        provider_refresh_token?: string;
      }>(
        'oauth-callback',
        async (event) => {
          console.log('OAuth callback received (signup) - Raw Payload:', JSON.stringify(event.payload, null, 2));
          try {
            const { access_token, refresh_token, provider_token, provider_refresh_token } = event.payload;

            // 3. Establish Supabase session with received tokens
            const timeoutPromise = new Promise<{ data: { session: null }, error: Error }>((_, reject) =>
              setTimeout(() => reject(new Error('SetSession timeout')), 10000)
            );

            const setSessionPromise = supabase.auth.setSession({
              access_token,
              refresh_token
            });

            const { data, error } = await Promise.race([setSessionPromise, timeoutPromise]) as any;

            console.log('SetSession result (signup):', { error, hasSession: !!data?.session });

            if (error) {
              console.error('Failed to set Supabase session:', error);
            } else {
              console.log('✅ LuminaKraft account created and authenticated');

              // Force refresh user
              const { data: { user } } = await supabase.auth.getUser();

              // NEW: Auto-detect and sync Discord data
              if (user) {
                const identities = user.identities || [];
                const discordIdentity = identities.find(id => id.provider === 'discord');
                const currentProvider = user.app_metadata.provider;

                if (currentProvider === 'discord' && provider_token) {
                  console.log('Discord provider detected, auto-syncing data...');
                  try {
                    await this.syncDiscordData(provider_token, provider_refresh_token);
                  } catch (err) {
                    console.error('SyncDiscordData failed:', err);
                  }
                } else if (discordIdentity) {
                  console.log('Discord identity found (linked), attempting background sync...');
                  try {
                    await this.syncDiscordData();
                  } catch (err) {
                    console.error('Background SyncDiscordData failed:', err);
                  }
                }

                // Sync Microsoft data if available locally
                await this.syncMicrosoftData();
              }

              // Focus the launcher window
              try {
                await invoke('focus_window');
                console.log('Launcher window focused');
              } catch (focusError) {
                console.warn('Failed to focus window:', focusError);
              }
            }
          } catch (e) {
            console.error('Error in oauth-callback listener:', e);
          } finally {
            unlisten();
          }
        }
      );

      // 4. Open browser to sign up page
      const url = `https://luminakraft.com/auth/sign-up?launcher=true&port=${port}`;
      await invoke('open_url', { url });
      console.log(`Opened browser to ${url}`);

      return true;
    } catch (error) {
      console.error('OAuth flow failed:', error);
      return false;
    }
  }

  /**
   * Sync Microsoft/Minecraft data to LuminaKraft account if both are available
   * Called after successful login to either service.
   * 
   * IMPORTANT: This method strictly uses the LOCAL Minecraft authentication data (from localStorage)
   * to update the user's profile. It does NOT use the Supabase Auth provider data (Azure/Microsoft)
   * to fill these columns, as they represent distinct identities (Platform Login vs Game Profile).
   */
  async syncMicrosoftData(microsoftAccount?: MicrosoftAccount): Promise<void> {
    try {
      console.log('Attempting to sync LOCAL Minecraft data to LuminaKraft account...');

      // 1. Get Microsoft Data (either passed or from local storage)
      let account = microsoftAccount;
      if (!account) {
        const saved = localStorage.getItem('LuminaKraftLauncher_settings');
        if (saved) {
          const settings = JSON.parse(saved);
          if (settings.authMethod === 'microsoft' && settings.microsoftAccount) {
            account = settings.microsoftAccount;
          }
        }
      }

      // Validate we have a valid Minecraft account structure (xuid is critical)
      // This ensures we are not using partial data or confusing it with Supabase provider data.
      if (!account || !account.xuid || !account.uuid) {
        console.log('No valid local Minecraft account data found to sync (missing XUID/UUID).');
        return;
      }

      // 2. Get Supabase Session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No active LuminaKraft session. Skipping sync.');
        return;
      }

      console.log('Syncing Minecraft profile data:', {
        username: account.username,
        uuid: account.uuid,
        xuid: account.xuid,
        userId: session.user.id
      });

      // 3. Update Database
      // We use the Minecraft Profile UUID for minecraft_uuid
      // We use the Xbox User ID (xuid) for microsoft_id (as it's the stable account ID)
      const { error } = await updateUser(session.user.id, {
        microsoft_id: account.xuid,
        minecraft_username: account.username,
        minecraft_uuid: account.uuid,
        is_minecraft_verified: true,
        microsoft_linked_at: new Date().toISOString()
      });

      if (error) {
        console.error('Failed to sync Microsoft data to DB:', error);
      } else {
        console.log('✅ Minecraft profile data synced to LuminaKraft account successfully');
        this.emitProfileUpdate();
      }

    } catch (error) {
      console.error('Error syncing Microsoft data:', error);
    }
  }

  /**
   * Authenticate Microsoft account for Minecraft premium only (local storage)
   * This does NOT create a LuminaKraft account - use signInToLuminaKraftAccount() for that
   */
  async authenticateMicrosoftMinecraft(): Promise<MicrosoftAccount> {
    const account = await this.authenticateWithMicrosoftModal();
    console.log('Microsoft account authenticated for Minecraft (local only)');
    // Data is stored in UserSettings by the caller, not in Supabase
    return account;
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

      // Sync with LuminaKraft account if logged in
      await this.syncMicrosoftData(account);

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
      console.log('Linking/Signing in with Discord account...');

      // Check if user is already logged in
      const { data: { session } } = await supabase.auth.getSession();

      // Allow both scenarios:
      // 1. No session → Sign up/Sign in with Discord (creates new account or logs in)
      // 2. Has session → Link Discord to existing account

      // 1. Start HTTP server and get port
      const port = await invoke<number>('start_oauth_server');
      console.log(`OAuth server started on port ${port}`);

      // Construct redirect URL with port
      const redirectUrl = `https://luminakraft.com/auth-callback?launcher=true&port=${port}`;

      // 2. Set up event listener for oauth callback
      const unlisten = await listen<{
        access_token: string;
        refresh_token: string;
        provider_token?: string;
        provider_refresh_token?: string;
      }>(
        'oauth-callback',
        async (event) => {
          try {
            const { access_token, refresh_token, provider_token, provider_refresh_token } = event.payload;

            // Update session with new identity - don't await
            supabase.auth.setSession({
              access_token,
              refresh_token
            }).catch(err => {
              console.error('SetSession error:', err);
            });

            // Focus the launcher window immediately
            try {
              await invoke('focus_window');
            } catch (focusError) {
              console.warn('Failed to focus window:', focusError);
            }

            // Wait a bit for session to be processed
            await new Promise(resolve => setTimeout(resolve, 500));

            // Run Discord and Microsoft sync in background
            setTimeout(async () => {
              try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user && provider_token) {
                  await this.syncDiscordData(provider_token, provider_refresh_token);
                }
                // Sync Microsoft data if available locally (for new accounts created via Discord)
                await this.syncMicrosoftData();

                // CRITICAL: Emit profile update AFTER sync is done so UI fetches fresh data
                this.emitProfileUpdate();
              } catch (err) {
                console.error('Background sync failed:', err);
              }
            }, 100); // Reduced delay since we want this to happen relatively fast
          } catch (e) {
            console.error('Error in oauth-callback listener (link):', e);
          } finally {
            unlisten();
          }
        }
      );

      let data, error;

      // 3. Initiate OAuth flow
      if (session) {
        // User logged in → Link identity
        console.log('User logged in, linking Discord identity...');
        const result = await supabase.auth.linkIdentity({
          provider: 'discord',
          options: {
            redirectTo: redirectUrl,
            scopes: 'identify guilds guilds.members.read',
            skipBrowserRedirect: true // This returns the URL instead of redirecting
          }
        });
        data = result.data;
        error = result.error;
      } else {
        // Fallback: No session → Sign in with OAuth
        console.log('No active session, signing in with Discord...');
        const result = await supabase.auth.signInWithOAuth({
          provider: 'discord',
          options: {
            redirectTo: redirectUrl,
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

      // 4. Open OAuth URL in external browser
      await invoke('open_url', { url: data.url });

      console.log(`Discord OAuth opened. Redirecting to: ${redirectUrl}`);
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
        // CRITICAL: Only use metadata if the current provider IS Discord.
        // Otherwise we risk using Microsoft metadata for Discord fields if logged in via Microsoft.
        if (user.app_metadata.provider === 'discord') {
          console.log('Falling back to user metadata...');
          discordUser = {
            id: user.user_metadata?.provider_id,
            username: user.user_metadata?.username || user.user_metadata?.custom_claims?.username,
            global_name: user.user_metadata?.global_name || user.user_metadata?.custom_claims?.global_name,
            avatar_url: user.user_metadata?.avatar_url,
            avatar: user.user_metadata?.avatar
          };
        } else {
          console.log('Current provider is not Discord, and no API token provided. Skipping Discord profile update.');
        }
      }

      if (!discordUser?.id) {
        console.log('No Discord user data available to sync profile.');
      } else {
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
          .select('minecraft_username, email, display_name')
          .eq('id', user.id)
          .single<{
            minecraft_username: string | null;
            email: string | null;
            display_name: string | null;
          }>();

        // Calculate display_name with priority: DB display_name > Discord global_name > Discord username > Minecraft username > Email > User
        const currentDisplayName = currentUser?.display_name;
        // Only overwrite if current display_name is missing, empty, or "User"
        // If user has set a custom display_name via ProfileEditor, KEEP IT.
        const shouldOverwrite = !currentDisplayName || currentDisplayName === 'User' || currentDisplayName === '';

        const calculated_display_name = shouldOverwrite
          ? (discordUser.global_name ||
            cleanUsername ||
            currentUser?.minecraft_username ||
            currentUser?.email?.split('@')[0] ||
            'User')
          : currentDisplayName;

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

        console.log('Discord data updated in database');
      }

      // Capture anonymous username from localStorage if applicable
      // This should happen ONLY if:
      // 1. User does NOT have Microsoft linked (microsoft_id is null)
      // 2. minecraft_username is currently null (no username set yet)
      const { data: currentUserData } = await supabase
        .from('users')
        .select('microsoft_id, minecraft_username')
        .eq('id', user.id)
        .single<{
          microsoft_id: string | null;
          minecraft_username: string | null;
        }>();

      const hasMicrosoft = !!currentUserData?.microsoft_id;
      const hasMinecraftUsername = !!currentUserData?.minecraft_username;

      if (!hasMicrosoft && !hasMinecraftUsername) {
        // User is Discord-only with no username → Try to capture from localStorage
        const savedUsername = this.getAnonymousUsernameFromLocalStorage();

        if (savedUsername && savedUsername !== 'Player') {
          console.log('📝 Capturing anonymous username from localStorage:', savedUsername);

          const now = new Date().toISOString();
          const captureData = {
            minecraft_username: savedUsername,
            minecraft_username_history: [{
              username: savedUsername,
              from: now,
              to: null
            }]
          };

          const { error: captureError } = await updateUser(user.id, captureData);

          if (captureError) {
            console.error('Failed to capture anonymous username:', captureError);
          } else {
            console.log('✅ Anonymous username captured and history initialized');
          }
        } else {
          console.log('ℹ️ No anonymous username to capture (using default "Player")');
        }
      }

      // Save provider refresh token in localStorage for future syncs
      if (providerRefreshToken) {
        localStorage.setItem('discord_provider_refresh_token', providerRefreshToken);
        console.log('Discord provider refresh token saved to localStorage');
      }

      console.log('Now syncing Discord roles...');

      // Trigger role sync with provider token if available
      const rolesSuccess = await this.syncDiscordRoles(providerToken, providerRefreshToken);

      if (rolesSuccess) {
        console.log('Discord data and roles synced successfully');
        // Note: syncDiscordRoles() already emits profile-updated event after successful sync
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

      console.log('Token Check:', {
        hasParamToken: !!providerToken,
        hasSessionToken: !!session.provider_token,
        tokenPreview: discordAccessToken ? discordAccessToken.substring(0, 5) + '...' : 'none',
        hasRefreshToken: !!refreshToken
      });

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
      const { data, error } = await supabase.functions.invoke('sync-discord-roles', {
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

      // Wait a bit to ensure the edge function has finished writing to the database
      // The edge function updates the display_name, so we need to give it time before
      // components refresh their data
      if (data.success) {
        await new Promise(resolve => setTimeout(resolve, 500));
        this.emitProfileUpdate();
        console.log('✅ Profile update event emitted (display_name updated by edge function)');
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
   * Cached for 5 minutes to reduce redundant network calls during navigation
   */
  async getDiscordAccount(): Promise<DiscordAccount | null> {
    const cacheKey = 'discord_account';

    // Check cache first
    const cached = this.getCache<DiscordAccount | null>(cacheKey);
    if (cached !== null) {
      return cached;
    }

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
        // Cache null result too to avoid repeated checks
        this.setCache(cacheKey, null, AUTH_CACHE_TTL.DISCORD_ACCOUNT);
        return null;
      }

      const result: DiscordAccount = {
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

      // Cache the result
      this.setCache(cacheKey, result, AUTH_CACHE_TTL.DISCORD_ACCOUNT);
      return result;
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
        .single<{
          minecraft_username: string | null;
          email: string | null;
        }>();

      // Recalculate display_name without Discord (priority: Minecraft > Email > User)
      const calculated_display_name =
        currentUser?.minecraft_username ||
        currentUser?.email?.split('@')[0] ||
        'User';

      // Clear ALL Discord data in database (including roles and partner status)
      const unlinkData: any = {
        discord_id: null,
        discord_username: null,
        discord_global_name: null,
        discord_avatar: null,
        discord_linked_at: null,
        is_discord_member: false,
        has_partner_role: false,
        partner_id: null,
        discord_roles: null,
        last_discord_sync: null,
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

  /**
   * Link any OAuth provider (GitHub, Google, Azure, etc.)
   */
  async linkProvider(provider: 'github' | 'google' | 'azure'): Promise<boolean> {
    try {
      console.log(`Linking ${provider} account...`);

      // Check if user is already logged in
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('No active session. User must sign in first.');
        return false;
      }

      // 1. Start HTTP server and get port
      const port = await invoke<number>('start_oauth_server');
      console.log(`OAuth server started on port ${port}`);

      // Construct redirect URL with port
      const redirectUrl = `https://luminakraft.com/auth-callback?launcher=true&port=${port}`;

      // 2. Set up event listener for oauth callback
      const unlisten = await listen<{
        access_token: string;
        refresh_token: string;
        provider_token?: string;
        provider_refresh_token?: string;
      }>(
        'oauth-callback',
        async (event) => {
          try {
            const { access_token, refresh_token } = event.payload;

            // Update session with new identity - don't await
            supabase.auth.setSession({
              access_token,
              refresh_token
            }).catch(err => {
              console.error('SetSession error:', err);
            });

            // Focus the launcher window immediately
            try {
              await invoke('focus_window');
            } catch (focusError) {
              console.warn('Failed to focus window:', focusError);
            }

            // Wait a bit for session to be processed, then emit update event
            await new Promise(resolve => setTimeout(resolve, 500));

            // Emit profile update event (listeners will handle fetching user)
            this.emitProfileUpdate();
          } catch (e) {
            console.error(`Error in oauth-callback listener (${provider} link):`, e);
          } finally {
            unlisten();
          }
        }
      );

      // 3. Link identity
      console.log(`User logged in, linking ${provider} identity...`);
      const { data, error } = await supabase.auth.linkIdentity({
        provider: provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true
        }
      });

      if (error || !data?.url) {
        console.error(`${provider} OAuth error:`, error);
        return false;
      }

      // 4. Open OAuth URL in external browser
      await invoke('open_url', { url: data.url });

      console.log(`${provider} OAuth opened. Redirecting to: ${redirectUrl}`);
      return true;
    } catch (error) {
      console.error(`Error linking ${provider} account:`, error);
      return false;
    }
  }

  /**
   * Unlink any OAuth provider (GitHub, Google, Azure, etc.)
   */
  async unlinkProvider(provider: 'github' | 'google' | 'azure' | 'discord'): Promise<boolean> {
    try {
      // Discord requires special handling to clean up database
      if (provider === 'discord') {
        return await this.unlinkDiscordAccount();
      }

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return false;

      console.log(`Unlinking ${provider} account...`);

      // Get user identities
      const { data: identities } = await supabase.auth.getUserIdentities();
      console.log('User identities:', identities);

      const identity = identities?.identities?.find(
        (id) => id.provider === provider
      );

      if (!identity) {
        console.log(`No ${provider} identity found`);
        return false;
      }

      console.log(`Attempting to unlink ${provider} identity:`, identity.id);
      const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);

      if (unlinkError) {
        console.error(`Failed to unlink ${provider}:`, unlinkError);
        return false;
      }

      console.log(`${provider} account unlinked successfully`);
      return true;
    } catch (error) {
      console.error(`Error unlinking ${provider} account:`, error);
      return false;
    }
  }

  /**
   * Get all linked providers for the current user
   */
  async getLinkedProviders(): Promise<{ provider: string; email?: string; id: string }[]> {
    try {
      const { data: identities } = await supabase.auth.getUserIdentities();

      if (!identities?.identities) {
        return [];
      }

      return identities.identities.map(identity => ({
        provider: identity.provider,
        email: identity.identity_data?.email,
        id: identity.id
      }));
    } catch (error) {
      console.error('Error getting linked providers:', error);
      return [];
    }
  }

  /**
   * Delete the user's account
   * Calls the delete-account Edge Function to remove data from auth and public tables
   */
  async deleteAccount(): Promise<boolean> {
    try {
      console.log('Initiating account deletion...');
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('No session, cannot delete account');
        return false;
      }

      const { error } = await supabase.functions.invoke('delete-account', {
        body: { userId: session.user.id }
      });

      if (error) {
        console.error('Failed to delete account:', error);
        throw error;
      }

      // Sign out after successful deletion
      await this.signOutSupabase();
      return true;
    } catch (error) {
      console.error('Error deleting account:', error);
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
        .select('minecraft_username, minecraft_username_history, microsoft_id')
        .eq('id', session.user.id)
        .single<{
          minecraft_username: string | null;
          minecraft_username_history: any;
          microsoft_id: string | null;
        }>();

      // PROTECTION: Don't allow username changes if user has Microsoft linked
      if (currentUser?.microsoft_id) {
        console.error('Cannot change username: Microsoft account is linked (username comes from Microsoft)');
        return false;
      }

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

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get anonymous username from localStorage
   * Used when linking Discord to preserve user's chosen username
   */
  private getAnonymousUsernameFromLocalStorage(): string | null {
    try {
      const saved = localStorage.getItem('LuminaKraftLauncher_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        return settings.username || null;
      }
    } catch (error) {
      console.error('Error reading username from localStorage:', error);
    }
    return null;
  }

  private emitProfileUpdate() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('luminakraft:profile-updated'));
    }
  }
}

export default AuthService; 