import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Trash2 } from 'lucide-react';
import AuthService from '../../services/authService';
import ProfileEditor from '../Settings/ProfileEditor';
import { ConfirmDialog } from '../Common/ConfirmDialog';
import { LoadingModal } from '../Common/LoadingModal';
import type { DiscordAccount } from '../../types/launcher';
import toast from 'react-hot-toast';

const AccountPage: React.FC = () => {
  const { t } = useTranslation();
  const [luminaKraftUser, setLuminaKraftUser] = useState<any>(null);
  const [discordAccount, setDiscordAccount] = useState<DiscordAccount | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<{ provider: string; email?: string; id: string }[]>([]);
  const [isLoadingLuminaKraft, setIsLoadingLuminaKraft] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const canUnlink = (luminaKraftUser?.identities?.length || 0) > 1;

  // Load LuminaKraft account session and listen for changes
  useEffect(() => {
    const setupAuth = async () => {
      try {
        const { supabase } = await import('../../services/supabaseClient');

        const fetchUserWithProfile = async (retries = 3) => {
          // Use Promise.race to timeout getUser() if it takes too long
          const getUserPromise = supabase.auth.getUser();
          const timeoutPromise = new Promise<{ data: { user: null } }>((resolve) =>
            setTimeout(() => {
              resolve({ data: { user: null } });
            }, 3000)
          );

          const { data: { user } } = await Promise.race([getUserPromise, timeoutPromise]);

          if (!user) {
            setDiscordAccount(null);
            return null;
          }

          // Fetch Discord account status
          const authService = AuthService.getInstance();
          const discord = await authService.getDiscordAccount();
          setDiscordAccount(discord);

          // Fetch all linked providers
          const providers = await authService.getLinkedProviders();
          setLinkedProviders(providers);

          // Fetch public profile to get up-to-date display_name
          for (let i = 0; i < retries; i++) {
            const { data: profile } = await supabase
              .from('users')
              .select('display_name, avatar_url')
              .eq('id', user.id)
              .single();

            if (profile) {
              // Merge DB profile into user metadata for UI consistency
              user.user_metadata = {
                ...user.user_metadata,
                display_name: (profile as any).display_name,
                avatar_url: (profile as any).avatar_url
              };
              return user;
            }

            if (i < retries - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }

          return user;
        };

        const initialUser = await fetchUserWithProfile();
        setLuminaKraftUser(initialUser);
        setIsLoadingLuminaKraft(false);

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event) => {
            if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
              // Show loading state while fetching user profile
              setIsLoadingLuminaKraft(true);

              // Small delay to allow Supabase client to fully process the session
              await new Promise(resolve => setTimeout(resolve, 200));
              const updatedUser = await fetchUserWithProfile();
              setLuminaKraftUser(updatedUser);

              setIsLoadingLuminaKraft(false);
              // Hide loading modal when sign-in completes
              setIsSigningIn(false);
            } else if (event === 'SIGNED_OUT') {
              setLuminaKraftUser(null);
              setDiscordAccount(null);
              setLinkedProviders([]);
              setIsSigningIn(false);
            }
          }
        );

        // Listen for custom profile update events (triggered by authService after sync)
        const handleProfileUpdateEvent = async () => {
          try {
            setIsLoadingLuminaKraft(true);
            const updatedUser = await fetchUserWithProfile(1);
            setLuminaKraftUser(updatedUser);
            setIsLoadingLuminaKraft(false);
          } catch (error) {
            console.error('Error updating user from profile event:', error);
            setIsLoadingLuminaKraft(false);
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
    const { supabase } = await import('../../services/supabaseClient');
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
                  <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg border border-dark-600">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-[#5865F2] flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 3.42 3.42 0 0 0-.623 1.281 18.346 18.346 0 0 0-5.462 0 2.79 2.79 0 0 0-.623-1.281.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419z"/>
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-white">Discord</p>
                        <p className="text-xs text-gray-400">{discordAccount.username}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnlinkProvider('discord')}
                      disabled={!canUnlink}
                      title={!canUnlink ? (t('auth.cannotUnlinkOnlyProvider') || 'Cannot unlink only provider') : ''}
                      className={`text-sm font-medium px-3 py-1 rounded transition-colors ${
                        canUnlink
                          ? 'text-red-400 hover:text-red-300 hover:bg-red-400/10'
                          : 'text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      Unlink
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleLinkDiscord}
                    className="w-full p-3 border border-dashed border-dark-600 rounded-lg hover:border-dark-500 hover:bg-dark-700/50 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-[#5865F2]/20 group-hover:bg-[#5865F2]/30 flex items-center justify-center transition-colors">
                        <svg className="w-5 h-5 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 3.42 3.42 0 0 0-.623 1.281 18.346 18.346 0 0 0-5.462 0 2.79 2.79 0 0 0-.623-1.281.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419z"/>
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
                          <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.137 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
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
                      className={`text-sm font-medium px-3 py-1 rounded transition-colors ${
                        canUnlink
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
                          <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.137 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
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
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
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
                      className={`text-sm font-medium px-3 py-1 rounded transition-colors ${
                        canUnlink
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
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
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
                          <path d="M0 0h10.377v10.377H0zm12.623 0H23v10.377H12.623zM0 12.623h10.377V23H0zm12.623 0H23V23H12.623z"/>
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
                      className={`text-sm font-medium px-3 py-1 rounded transition-colors ${
                        canUnlink
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
                          <path d="M0 0h10.377v10.377H0zm12.623 0H23v10.377H12.623zM0 12.623h10.377V23H0zm12.623 0H23V23H12.623z"/>
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
      />
    </div>
  );
};

export default AccountPage;
