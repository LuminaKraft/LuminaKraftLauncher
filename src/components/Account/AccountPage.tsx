import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { User, Trash2 } from 'lucide-react';
import AuthService from '../../services/authService';
import ProfileEditor from '../Settings/ProfileEditor';
import { ConfirmDialog } from '../Common/ConfirmDialog';
import { LoadingModal } from '../Common/LoadingModal';
import type { DiscordAccount } from '../../types/launcher';
import toast from 'react-hot-toast';
import { supabase } from '../../services/supabaseClient';

const AccountPage: React.FC = () => {
  const { t } = useTranslation();
  const [luminaKraftUser, setLuminaKraftUser] = useState<any>(null);
  const [discordAccount, setDiscordAccount] = useState<DiscordAccount | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<{ provider: string; email?: string; id: string }[]>([]);
  const [isLoadingLuminaKraft, setIsLoadingLuminaKraft] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const hasLoadedUserRef = React.useRef(false);

  const canUnlink = (luminaKraftUser?.identities?.length || 0) > 1;

  // Load LuminaKraft account session and listen for changes
  useEffect(() => {

    const setupAuth = async () => {
      try {

        const fetchUserWithProfile = async (existingUser: any = null) => {
          let user = existingUser;

          if (!user) {
            // Use Promise.race to timeout getUser() if it takes too long
            const getUserPromise = supabase.auth.getUser();
            const timeoutPromise = new Promise<{ data: { user: null } }>((resolve) =>
              setTimeout(() => {
                resolve({ data: { user: null } });
              }, 3000)
            );
            const { data: { user: fetchedUser } } = await Promise.race([getUserPromise, timeoutPromise]);
            user = fetchedUser;
          }

          if (!user) {
            return { user: null, discord: null, providers: [] };
          }

          // CRITICAL: Clone user object to ensure React detects state change
          user = JSON.parse(JSON.stringify(user));

          // Helper to timeout promises
          // Note: <T,> syntax is required in TSX files
          const timeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
            return Promise.race([
              promise,
              new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
            ]);
          };

          // Parallelize fetches
          const authService = AuthService.getInstance();

          const [discord, providers, profileData]: [any, any, any] = await Promise.all([
            // 1. Discord Account - 3s timeout safe
            timeout(authService.getDiscordAccount(), 3000, null),
            // 2. Linked Providers - 3s timeout
            timeout(authService.getLinkedProviders(), 3000, []),
            // 3. Public Profile
            (async () => {
              try {
                const profilePromise = supabase
                  .from('users')
                  .select('display_name, avatar_url')
                  .eq('id', user.id)
                  .single();
                const { data } = await timeout(profilePromise as any, 3000, { data: null } as any);
                return data;
              } catch { return null; }
            })()
          ]);

          let dbDisplayName = null;

          // 1. Prioritize DB Profile Data
          if (profileData) {
            dbDisplayName = (profileData as any).display_name;
            user.user_metadata = {
              ...user.user_metadata,
              display_name: dbDisplayName || user.user_metadata.display_name, // Only overwrite if DB has value
              avatar_url: (profileData as any).avatar_url || user.user_metadata.avatar_url,
              full_name: dbDisplayName || user.user_metadata.full_name
            };
          }

          // 2. Fallback logic: Only override if we DON'T have a valid display_name from DB or current metadata
          const currentName = user.user_metadata.display_name;
          const isGenericOrEmpty = !currentName || currentName === 'User';

          // Only apply fallback if we really need it (empty or "User") AND we didn't just get a valid one from DB
          if (isGenericOrEmpty) {
            let betterName = discord?.global_name || discord?.username;
            let betterAvatar = null;

            if (!betterName) {
              const targetIdentity = user.identities?.find((id: any) => id.provider === 'discord' || id.provider === 'google' || id.provider === 'azure') || user.identities?.[0];

              if (targetIdentity?.identity_data) {
                const data = targetIdentity.identity_data;
                betterName = data.global_name || data.full_name || data.name || data.user_name || data.display_name;
                betterAvatar = data.avatar_url || data.picture || data.avatar;
              }
            }

            if (betterName) {
              user.user_metadata = {
                ...user.user_metadata,
                display_name: betterName,
                full_name: betterName, // Sync full_name too
                avatar_url: user.user_metadata.avatar_url || betterAvatar
              };
            }
          }

          return { user, discord, providers };
        };

        const { user: initialUser, discord: initialDiscord, providers: initialProviders } = await fetchUserWithProfile();

        setLuminaKraftUser(initialUser);
        setDiscordAccount(initialDiscord);
        setLinkedProviders(initialProviders);

        if (initialUser) hasLoadedUserRef.current = true;
        setIsLoadingLuminaKraft(false);

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            // IGNORE TOKEN_REFRESHED to prevent flicker. 
            if (event === 'TOKEN_REFRESHED') {
              return;
            }

            if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
              // Only show loader if we haven't loaded a user yet
              if (!hasLoadedUserRef.current) {
                setIsLoadingLuminaKraft(true);
              }

              const currentUser = session?.user;

              const { user: updatedUser, discord: updatedDiscord, providers: updatedProviders } =
                await fetchUserWithProfile(currentUser);

              if (updatedUser) {
                setLuminaKraftUser(updatedUser);
                hasLoadedUserRef.current = true;

                // Persistence logic: Only update if valid, or if we are sure it's gone.
                // If update fetch failed (null) but user has identity, keep old one?
                // Actually, fetchUserWithProfile returns null discord if timeout.
                // If we have a user identity for discord, but discord obj is null, implies fetch error/timeout.
                // In that case, DO NOT clear the existing discord state.

                const hasDiscordIdentity = updatedUser.identities?.some((id: any) => id.provider === 'discord');

                if (updatedDiscord) {
                  setDiscordAccount(updatedDiscord);
                } else if (!hasDiscordIdentity) {
                  // Only clear if user genuinely doesn't have discord linked anymore
                  setDiscordAccount(null);
                }
                // If hashDiscordIdentity is true but updatedDiscord is null (timeout), we Keep existing state (do nothing)

                if (updatedProviders && updatedProviders.length > 0) {
                  setLinkedProviders(updatedProviders);
                }
                // For providers, it's harder to check "hasIdentity" for all, but same principle applies.
                // If empty list mainly due to timeout?
                // Safest: always update providers if NOT empty. If empty, check if we timed out?
                // For now, let's assume empty list is valid unlinking unless it was timeout.
                // But we don't know if it was timeout returned from fetchUserWithProfile easily without flag.
                // Simplification: If we have an authenticated user, we trust the providers list unless it's empty AND we had ones before?
                // Let's stick to standard behavior for providers for now, usually it loads fast.
                if (updatedProviders && updatedProviders.length === 0 && (linkedProviders.length > 0)) {
                  // Only clear if we really think it's unlinked. 
                  // Without clearer signal, we might just accept the clear.
                  // But for Discord specifically (the icon), the logic above handles it.
                } else {
                  setLinkedProviders(updatedProviders);
                }

              } else {
                // Update failed or user null?
              }

              setIsLoadingLuminaKraft(false);
              setIsSigningIn(false);
            } else if (event === 'SIGNED_OUT') {
              setLuminaKraftUser(null);
              hasLoadedUserRef.current = false;
              setDiscordAccount(null);
              setLinkedProviders([]);
              setIsSigningIn(false);
            }
          }
        );

        // Listen for custom profile update events (triggered by authService after sync)
        const handleProfileUpdateEvent = async () => {
          try {
            // Update silently without showing loader
            // setIsLoadingLuminaKraft(true); // Commented out to prevent flicker

            // Try to get cached session first to avoid network calls/timeouts
            const { data: { session } } = await supabase.auth.getSession();
            const currentUser = session?.user;

            const { user: updatedUser, discord: updatedDiscord, providers: updatedProviders } =
              await fetchUserWithProfile(currentUser);

            if (updatedUser) {
              setLuminaKraftUser(updatedUser);
              // Also update hasLoadedUserRef to ensure subsequent auth events don't trigger loader
              hasLoadedUserRef.current = true;

              // CRITICAL FIX: Also update linked accounts (Discord, Providers)
              if (updatedDiscord) {
                setDiscordAccount(updatedDiscord);
              }

              if (updatedProviders) {
                setLinkedProviders(updatedProviders);
              }
            }

            // setIsLoadingLuminaKraft(false);
          } catch (error) {
            console.error('Error updating user from profile event:', error);
            // setIsLoadingLuminaKraft(false);
          }
        };
        window.addEventListener('luminakraft:profile-updated', handleProfileUpdateEvent);

        // Cleanup subscription on unmount
        return () => {
          subscription.unsubscribe();
          window.removeEventListener('luminakraft:profile-updated', handleProfileUpdateEvent);
        };
      } catch (error) {
        console.error('Error loading LuminaKraft session:', error);
        setIsLoadingLuminaKraft(false);
      }
    };

    const cleanup = setupAuth();
    return () => {
      cleanup?.then(fn => fn && fn());
    };
  }, []);

  const handleSignInToLuminaKraft = async () => {
    setIsSigningIn(true);
    const authService = AuthService.getInstance();
    await authService.signInToLuminaKraftAccount();
  };

  const handleSignUpToLuminaKraft = async () => {
    setIsSigningIn(true);
    const authService = AuthService.getInstance();
    await authService.signUpLuminaKraftAccount();
  };

  const handleSignOutFromLuminaKraft = async () => {
    setShowSignOutConfirm(true);
  };

  const performSignOut = async () => {
    try {
      const authService = AuthService.getInstance();
      await authService.signOutSupabase();
      // Force state update to ensure UI reflects sign out immediately
      setLuminaKraftUser(null);
      setDiscordAccount(null);
      setLinkedProviders([]);
    } catch (error) {
      console.error('Sign out error:', error);
      toast.error('Failed to sign out');
    }
  };

  const handleProfileUpdate = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setLuminaKraftUser(user);
  };

  const handleLinkDiscord = async () => {
    setIsSigningIn(true);
    const authService = AuthService.getInstance();
    await authService.linkDiscordAccount();
  };

  const handleLinkProvider = async (provider: 'github' | 'google' | 'azure') => {
    setIsSigningIn(true);
    const authService = AuthService.getInstance();
    await authService.linkProvider(provider);
  };

  const handleUnlinkProvider = async (provider: 'github' | 'google' | 'azure' | 'discord') => {
    if (!canUnlink) {
      toast.error(t('auth.cannotUnlinkOnlyProvider') || 'Cannot unlink your only provider');
      return;
    }

    const authService = AuthService.getInstance();
    const success = await authService.unlinkProvider(provider);

    if (success) {
      toast.success(`${provider.charAt(0).toUpperCase() + provider.slice(1)} account unlinked`);
      // Reload providers after unlinking
      const providers = await authService.getLinkedProviders();
      setLinkedProviders(providers);
      if (provider === 'discord') {
        setDiscordAccount(null);
      }
    } else {
      toast.error(`Failed to unlink ${provider} account`);
    }
  };

  const handleDeleteAccount = () => {
    setShowDeleteConfirm(true);
  };

  const performDeleteAccount = async () => {
    try {
      const authService = AuthService.getInstance();
      const success = await authService.deleteAccount();

      if (success) {
        toast.success('Account deleted successfully');
        setLuminaKraftUser(null);
      } else {
        toast.error('Failed to delete account');
      }
    } catch (error) {
      console.error('Delete account error:', error);
      toast.error('Failed to delete account');
    }
  };

  if (isLoadingLuminaKraft) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-lumina-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={performDeleteAccount}
        title={t('settings.deleteAccount')}
        message={t('auth.confirmDeleteAccount')}
        confirmText={t('settings.deleteAccount')}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        onConfirm={performSignOut}
        title={t('auth.signOut')}
        message={t('auth.confirmSignOut')}
        confirmText={t('auth.signOut')}
      />

      <h1 className="text-3xl font-bold text-white mb-6">Account</h1>

      {/* LuminaKraft Account Section */}
      <div className="bg-dark-900 rounded-lg p-6 border border-dark-700 mb-6">
        <div className="flex items-center space-x-3 mb-6">
          <User className="w-6 h-6 text-lumina-500" />
          <h2 className="text-white text-xl font-semibold">{t('settings.luminakraftAccount')}</h2>
        </div>

        {isLoadingLuminaKraft ? (
          <div className="flex flex-col items-center justify-center p-12 bg-dark-700 rounded-lg border border-dark-600">
            <div className="relative w-12 h-12 mb-4">
              <div className="absolute inset-0 rounded-full border-2 border-dark-600"></div>
              <div className="absolute inset-0 rounded-full border-2 border-t-primary-500 animate-spin"></div>
            </div>
            <p className="text-dark-400 text-sm">{t('common.loading')}</p>
          </div>
        ) : luminaKraftUser ? (
          <>
            <ProfileEditor
              luminaKraftUser={luminaKraftUser}
              discordAccount={discordAccount || null}
              onUpdate={handleProfileUpdate}
            />

            <div className="mt-6">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('settings.linkedAccounts')}</h3>

              <div className="space-y-2">
                {/* Discord */}
                {discordAccount ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg border border-dark-600">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-[#5865F2] flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 3.42 3.42 0 0 0-.623 1.281 18.346 18.346 0 0 0-5.462 0 2.79 2.79 0 0 0-.623-1.281.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-white">Discord</p>
                          <p className="text-xs text-gray-400">{discordAccount.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {discordAccount.isMember ? (
                          <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">{t('auth.discordMemberYes')}</span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400">{t('auth.discordMemberNo')}</span>
                        )}
                        <button
                          onClick={() => handleUnlinkProvider('discord')}
                          disabled={!canUnlink}
                          title={!canUnlink ? (t('auth.cannotUnlinkOnlyProvider') || 'Cannot unlink only provider') : ''}
                          className={`text-sm font-medium px-3 py-1 rounded transition-colors ${canUnlink
                            ? 'text-red-400 hover:text-red-300 hover:bg-red-400/10'
                            : 'text-gray-600 cursor-not-allowed'
                            }`}
                        >
                          Unlink
                        </button>
                      </div>
                    </div>
                    {/* Join Discord Server button for non-members */}
                    {!discordAccount.isMember && (
                      <button
                        onClick={async () => {
                          try {
                            await invoke('open_url', { url: 'https://discord.gg/UJZRrcUFMj' });
                          } catch (error) {
                            console.warn('Tauri command not available, using fallback:', error);
                            window.open('https://discord.gg/UJZRrcUFMj', '_blank', 'noopener,noreferrer');
                          }
                        }}
                        className="w-full p-3 bg-[#5865F2] hover:bg-[#4752C4] rounded-lg transition-colors flex items-center justify-center gap-2 group"
                      >
                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 3.42 3.42 0 0 0-.623 1.281 18.346 18.346 0 0 0-5.462 0 2.79 2.79 0 0 0-.623-1.281.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419z" />
                        </svg>
                        <span className="text-white font-medium">{t('auth.joinDiscordServer')}</span>
                        <span className="text-xs text-white/70">(50 downloads/h)</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handleLinkDiscord}
                    className="w-full p-3 border border-dashed border-dark-600 rounded-lg hover:border-dark-500 hover:bg-dark-700/50 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-[#5865F2]/20 group-hover:bg-[#5865F2]/30 flex items-center justify-center transition-colors">
                        <svg className="w-5 h-5 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 3.42 3.42 0 0 0-.623 1.281 18.346 18.346 0 0 0-5.462 0 2.79 2.79 0 0 0-.623-1.281.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419z" />
                        </svg>
                      </div>
                      <span className="text-dark-300 group-hover:text-white transition-colors font-medium">Discord</span>
                    </div>
                    <span className="text-xs text-gray-500">Not linked</span>
                  </button>
                )}

                {/* GitHub */}
                {linkedProviders.find(p => p.provider === 'github') ? (
                  <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg border border-dark-600">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.137 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-white">GitHub</p>
                        <p className="text-xs text-gray-400">{linkedProviders.find(p => p.provider === 'github')?.email || 'Connected'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnlinkProvider('github')}
                      disabled={!canUnlink}
                      title={!canUnlink ? (t('auth.cannotUnlinkOnlyProvider') || 'Cannot unlink only provider') : ''}
                      className={`text-sm font-medium px-3 py-1 rounded transition-colors ${canUnlink
                        ? 'text-red-400 hover:text-red-300 hover:bg-red-400/10'
                        : 'text-gray-600 cursor-not-allowed'
                        }`}
                    >
                      Unlink
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleLinkProvider('github')}
                    className="w-full p-3 border border-dashed border-dark-600 rounded-lg hover:border-dark-500 hover:bg-dark-700/50 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-gray-900/20 group-hover:bg-gray-900/30 flex items-center justify-center transition-colors">
                        <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.137 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                        </svg>
                      </div>
                      <span className="text-dark-300 group-hover:text-white transition-colors font-medium">GitHub</span>
                    </div>
                    <span className="text-xs text-gray-500">Not linked</span>
                  </button>
                )}

                {/* Google */}
                {linkedProviders.find(p => p.provider === 'google') ? (
                  <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg border border-dark-600">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-white">Google</p>
                        <p className="text-xs text-gray-400">{linkedProviders.find(p => p.provider === 'google')?.email || 'Connected'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnlinkProvider('google')}
                      disabled={!canUnlink}
                      title={!canUnlink ? (t('auth.cannotUnlinkOnlyProvider') || 'Cannot unlink only provider') : ''}
                      className={`text-sm font-medium px-3 py-1 rounded transition-colors ${canUnlink
                        ? 'text-red-400 hover:text-red-300 hover:bg-red-400/10'
                        : 'text-gray-600 cursor-not-allowed'
                        }`}
                    >
                      Unlink
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleLinkProvider('google')}
                    className="w-full p-3 border border-dashed border-dark-600 rounded-lg hover:border-dark-500 hover:bg-dark-700/50 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-white/20 group-hover:bg-white/30 flex items-center justify-center transition-colors">
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                      </div>
                      <span className="text-dark-300 group-hover:text-white transition-colors font-medium">Google</span>
                    </div>
                    <span className="text-xs text-gray-500">Not linked</span>
                  </button>
                )}

                {/* Microsoft/Azure */}
                {linkedProviders.find(p => p.provider === 'azure') ? (
                  <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg border border-dark-600">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-[#00A4EF] flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" viewBox="0 0 23 23" fill="currentColor">
                          <path d="M0 0h10.377v10.377H0zm12.623 0H23v10.377H12.623zM0 12.623h10.377V23H0zm12.623 0H23V23H12.623z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-white">Microsoft</p>
                        <p className="text-xs text-gray-400">{linkedProviders.find(p => p.provider === 'azure')?.email || 'Connected'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnlinkProvider('azure')}
                      disabled={!canUnlink}
                      title={!canUnlink ? (t('auth.cannotUnlinkOnlyProvider') || 'Cannot unlink only provider') : ''}
                      className={`text-sm font-medium px-3 py-1 rounded transition-colors ${canUnlink
                        ? 'text-red-400 hover:text-red-300 hover:bg-red-400/10'
                        : 'text-gray-600 cursor-not-allowed'
                        }`}
                    >
                      Unlink
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleLinkProvider('azure')}
                    className="w-full p-3 border border-dashed border-dark-600 rounded-lg hover:border-dark-500 hover:bg-dark-700/50 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-[#00A4EF]/20 group-hover:bg-[#00A4EF]/30 flex items-center justify-center transition-colors">
                        <svg className="w-5 h-5 text-[#00A4EF]" viewBox="0 0 23 23" fill="currentColor">
                          <path d="M0 0h10.377v10.377H0zm12.623 0H23v10.377H12.623zM0 12.623h10.377V23H0zm12.623 0H23V23H12.623z" />
                        </svg>
                      </div>
                      <span className="text-dark-300 group-hover:text-white transition-colors font-medium">Microsoft</span>
                    </div>
                    <span className="text-xs text-gray-500">Not linked</span>
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-dark-700 flex flex-col gap-2">
              <button onClick={handleSignOutFromLuminaKraft} className="w-full btn-secondary text-sm">
                {t('auth.signOut')}
              </button>

              <div className="pt-2">
                <h3 className="text-xs font-bold text-red-400/70 uppercase tracking-wider mb-2">{t('settings.dangerZone')}</h3>
                <button onClick={handleDeleteAccount} className="text-sm text-red-400 hover:text-red-300 transition-colors flex items-center space-x-2">
                  <Trash2 className="w-4 h-4" />
                  <span>{t('settings.deleteAccount')}</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 bg-dark-700 rounded-lg border border-dark-600">
            <User className="w-12 h-12 text-dark-400 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">{t('settings.accountAccess')}</h3>
            <p className="text-dark-400 text-center mb-6 max-w-sm">
              {t('settings.luminakraftAccountHelp')}
            </p>
            <div className="flex space-x-4 w-full max-w-xs">
              <button
                onClick={handleSignInToLuminaKraft}
                className="flex-1 btn-primary"
              >
                {t('auth.signIn')}
              </button>
              <button
                onClick={handleSignUpToLuminaKraft}
                className="flex-1 btn-secondary"
              >
                {t('auth.signUp')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Loading Modal */}
      <LoadingModal
        isOpen={isSigningIn}
        message={t('auth.authenticating')}
        submessage={t('auth.pleaseWaitAuth')}
        onCancel={() => {
          invoke('stop_oauth_server').catch(console.error);
          setIsSigningIn(false);
        }}
      />
    </div>
  );
};

export default AccountPage;
