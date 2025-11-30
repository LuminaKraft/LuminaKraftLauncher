import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, HardDrive, Save, Wifi, WifiOff, RefreshCw, Trash2, Server, Languages, Shield, XCircle, Zap, CheckCircle as CheckCircleIcon } from 'lucide-react';
import { useLauncher } from '../../contexts/LauncherContext';
import LauncherService from '../../services/launcherService';
import AuthService from '../../services/authService';
import MetaStorageSettings from './MetaStorageSettings';
import ProfileEditor from './ProfileEditor';
import { ConfirmDialog } from '../Common/ConfirmDialog';
import type { MicrosoftAccount, DiscordAccount } from '../../types/launcher';
import toast from 'react-hot-toast';

interface SettingsPageProps {
  onNavigationBlocked?: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigationBlocked }) => {
  const { t } = useTranslation();
  const { userSettings, updateUserSettings, currentLanguage, changeLanguage, setIsAuthenticating, hasActiveOperations } = useLauncher();
  
  const [formData, setFormData] = useState(userSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [shakeAttempts, setShakeAttempts] = useState(0);
  const [isShaking, setIsShaking] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('LK_lastApiStatus') : null;
    return saved === 'online' || saved === 'offline' ? saved : 'offline';
  });
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('LK_lastApiCheckAt') : null;
    return saved ? Number(saved) : null;
  });
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [luminaKraftUser, setLuminaKraftUser] = useState<any>(null);
  const [discordAccount, setDiscordAccount] = useState<DiscordAccount | null>(null);
  const [isLoadingLuminaKraft, setIsLoadingLuminaKraft] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  // Java runtime handled internally by Lyceris; no user-facing settings.

  useEffect(() => {
    setFormData(userSettings);
  }, [userSettings]);

  useEffect(() => {
    const isDifferent = JSON.stringify(formData) !== JSON.stringify(userSettings);
    setHasChanges(isDifferent);
  }, [formData, userSettings]);

  // Load LuminaKraft account session and listen for changes
  useEffect(() => {
    const setupAuth = async () => {
      try {
        const { supabase } = await import('../../services/supabaseClient');

        const fetchUserWithProfile = async (retries = 3) => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            setDiscordAccount(null);
            return null;
          }

          // Fetch Discord account status
          const authService = AuthService.getInstance();
          const discord = await authService.getDiscordAccount();
          setDiscordAccount(discord);

          // Fetch public profile to get up-to-date display_name
          // We implement a retry mechanism because on new sign-ups, the trigger
          // creating the public.users record might have a slight delay.
          for (let i = 0; i < retries; i++) {
            const { data: profile, error } = await supabase
              .from('users')
              .select('display_name, avatar_url')
              .eq('id', user.id)
              .single();

            if (profile) {
              // Merge DB profile into user metadata for UI consistency
              user.user_metadata = {
                ...user.user_metadata,
                display_name: profile.display_name,
                avatar_url: profile.avatar_url
              };
              return user;
            }

            if (i < retries - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          // If still no profile after retries, return user as is (fallback)
          return user;
        };

        // Load initial session
        const user = await fetchUserWithProfile(1); // No need to retry heavily on initial load
        setLuminaKraftUser(user);
        setIsLoadingLuminaKraft(false);

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, _session) => {
            console.log('Auth state changed:', event);
            // Retry fetching profile on sign-in to ensure DB trigger has finished
            // Fire-and-forget to avoid blocking the auth flow
            fetchUserWithProfile(event === 'SIGNED_IN' ? 5 : 1).then(updatedUser => {
              setLuminaKraftUser(updatedUser);
            });
          }
        );

        // Cleanup subscription on unmount
        return () => {
          subscription.unsubscribe();
        };
      } catch (error) {
        console.error('Error loading LuminaKraft session:', error);
        setIsLoadingLuminaKraft(false);
      }
    };

    const cleanup = setupAuth();
    return () => {
      cleanup.then(unsub => unsub?.());
    };
  }, []);

  const checkAPIStatus = async () => {
    setApiStatus('checking');
    try {
      const isHealthy = await LauncherService.getInstance().checkAPIHealth();
      const status: 'online' | 'offline' = isHealthy ? 'online' : 'offline';
      setApiStatus(status);
      const now = Date.now();
      setLastCheckedAt(now);
      if (typeof window !== 'undefined') {
        localStorage.setItem('LK_lastApiStatus', status);
        localStorage.setItem('LK_lastApiCheckAt', String(now));
      }
    } catch (_error) {
      const status: 'online' | 'offline' = 'offline';
      setApiStatus(status);
      const now = Date.now();
      setLastCheckedAt(now);
      if (typeof window !== 'undefined') {
        localStorage.setItem('LK_lastApiStatus', status);
        localStorage.setItem('LK_lastApiCheckAt', String(now));
      }
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    if (field === 'username') {
      const trimmed = value.trim();
      if (trimmed === '') {
        setUsernameError(t('settings.usernameRequired'));
      } else if (trimmed.length > 16) {
        setUsernameError(t('settings.usernameTooLong'));
      } else {
        setUsernameError(null);
      }
    }
  };

  const handleLanguageChange = async (language: string) => {
    try {
      await changeLanguage(language);
      toast.success(t('settings.saved'));
    } catch (_error) {
      console.error('Error changing language:', _error);
    }
  };

  const handleSave = () => {
    if (usernameError) {
      toast.error(t('settings.usernameInvalidToast'));
      return;
    }
    updateUserSettings(formData);
    setHasChanges(false);
    toast.success(t('settings.saved'));
  };

  const handleDiscard = () => {
    setFormData(userSettings);
    setHasChanges(false);
    toast(t('settings.changesDiscarded'));
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    await checkAPIStatus();
    setIsTestingConnection(false);
  };

  const handleClearCache = () => {
    LauncherService.getInstance().clearCache();
    toast.success(t('settings.saved'));
  };

  const handleAuthError = (error: string) => {
    setAuthError(error);
    setIsAuthenticating(false);
    setTimeout(() => setAuthError(null), 5000);
  };

  const handleAuthStart = () => {
    setIsAuthenticating(true);
    setAuthError(null);
  };

  const handleAuthStop = () => {
    setIsAuthenticating(false);
  };

  const handleSignInToLuminaKraft = async () => {
    try {
      const authService = AuthService.getInstance();
      await authService.signInToLuminaKraftAccount();
      // The auth state change listener will update the UI automatically
    } catch (error) {
      console.error('Sign in error:', error);
      toast.error('Failed to sign in to LuminaKraft Account');
    }
  };

  const handleSignUpToLuminaKraft = async () => {
    try {
      const authService = AuthService.getInstance();
      await authService.signUpLuminaKraftAccount();
      // The auth state change listener will update the UI automatically
    } catch (error) {
      console.error('Sign up error:', error);
      toast.error('Failed to create LuminaKraft Account');
    }
  };

  const handleSignOutFromLuminaKraft = async () => {
    setShowSignOutConfirm(true);
  };

  const performSignOut = async () => {
    try {
      const authService = AuthService.getInstance();
      await authService.signOutSupabase();
      // state updates via listener
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
    const authService = AuthService.getInstance();
    await authService.linkDiscordAccount();
  };

  const handleUnlinkDiscord = async () => {
    setShowUnlinkConfirm(true);
  };

  const performUnlinkDiscord = async () => {
    const authService = AuthService.getInstance();
    const success = await authService.unlinkDiscordAccount();
    
    if (success) {
      toast.success('Discord account unlinked');
      // Refresh user data
      const { supabase } = await import('../../services/supabaseClient');
      const { data: { user } } = await supabase.auth.getUser();
      setLuminaKraftUser(user);
      
      // Update local settings
      const newSettings = {
        ...formData,
        discordAccount: undefined
      };
      setFormData(newSettings);
      updateUserSettings(newSettings);
    } else {
      toast.error('Failed to unlink Discord account');
    }
  };

  const handleDeleteAccount = async () => {
    setShowDeleteConfirm(true);
  };

  const performDeleteAccount = async () => {
    const authService = AuthService.getInstance();
    const success = await authService.deleteAccount();
    
    if (success) {
      toast.success(t('auth.accountDeleted') || 'Account deleted successfully');
      setLuminaKraftUser(null);
      setFormData(prev => ({
        ...prev,
        discordAccount: undefined
      }));
    } else {
      toast.error(t('auth.deleteAccountFailed') || 'Failed to delete account');
    }
  };

  const triggerShake = () => {
    if (isShaking) return; // Prevent multiple simultaneous shakes
    
    setShakeAttempts(prev => prev + 1);
    setIsShaking(true);
    
    // Reset shake after animation completes
    setTimeout(() => {
      setIsShaking(false);
    }, 600); // Animation duration
    
    // Reset attempts after 3 seconds of no attempts
    setTimeout(() => {
      setShakeAttempts(0);
    }, 3000);
  };

  // Expose the navigation blocking function
  React.useEffect(() => {
    if (hasChanges && onNavigationBlocked) {
      (window as any).blockNavigation = () => {
        triggerShake();
        return false; // Block navigation
      };
    } else {
      (window as any).blockNavigation = null;
    }
    
    return () => {
      (window as any).blockNavigation = null;
    };
  }, [hasChanges, onNavigationBlocked]);

  const MIN_RAM = 1;
  const MAX_RAM = 64;
  
  const handleRamSliderChange = (value: number) => {
    const clampedValue = Math.max(MIN_RAM, Math.min(MAX_RAM, value));
    handleInputChange('allocatedRam', clampedValue);
  };

  const handleRamTextChange = (value: string) => {
    // Allow empty string for better UX while typing
    if (value === '') {
      return;
    }
    
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(MIN_RAM, Math.min(MAX_RAM, numValue));
      const roundedValue = Math.round(clampedValue * 2) / 2; // Round to nearest 0.5
      handleInputChange('allocatedRam', roundedValue);
    }
  };

  const handleRamTextBlur = (value: string) => {
    // On blur, ensure we have a valid value
    const numValue = parseFloat(value);
    if (isNaN(numValue) || value === '') {
      // Reset to current value if invalid
      const input = document.querySelector('input[type="number"]') as HTMLInputElement;
      if (input) {
        input.value = formData.allocatedRam.toString();
      }
    }
  };

  const languageOptions = [
    { value: 'es', label: 'Español', name: 'Español' },
    { value: 'en', label: 'English', name: 'English' }
  ];

  const getStatusIcon = () => {
    switch (apiStatus) {
      case 'checking':
        return <RefreshCw className="w-5 h-5 text-yellow-500 animate-spin" />;
      case 'online':
        return <Wifi className="w-5 h-5 text-green-500" />;
      case 'offline':
        return <WifiOff className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusText = () => {
    let base = '';
    switch (apiStatus) {
      case 'checking':
        base = t('settings.checking');
        break;
      case 'online':
        base = t('settings.connected');
        break;
      case 'offline':
        base = t('settings.disconnected');
        break;
    }
    if (apiStatus !== 'checking' && lastCheckedAt) {
      const time = new Date(lastCheckedAt).toLocaleString();
      return `${base} (${time})`;
    }
    return base;
  };

  const getStatusColor = () => {
    switch (apiStatus) {
      case 'checking':
        return 'text-yellow-400';
      case 'online':
        return 'text-green-400';
      case 'offline':
        return 'text-red-400';
    }
  };

  // Java runtime handled internally by Lyceris; no user-facing settings.

  const isSaveDisabled = !!usernameError;

  const getShakeClass = () => {
    if (!isShaking) return '';
    if (shakeAttempts === 1) return 'shake-light';
    if (shakeAttempts === 2) return 'shake-medium';
    if (shakeAttempts === 3) return 'shake-heavy';
    return 'shake-extreme';
  };

  return (
    <div className={`h-full overflow-auto ${getShakeClass()}`}>
      <div className="p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-white text-2xl font-bold mb-2">{t('settings.title')}</h1>
          <p className="text-dark-400">
            {t('settings.settingsDescription')}
          </p>
        </div>

        {/* Error notification */}
        {authError && (
          <div className="mb-6 p-4 bg-red-600/20 border border-red-600/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="text-red-400 font-medium">
                {authError}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-8">
          {/* Language Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Languages className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.language')}</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-dark-300 text-sm font-medium mb-2">
                  {t('settings.selectLanguage')}
                </label>
                <div className="relative">
                  <select
                    value={currentLanguage}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    disabled={hasActiveOperations}
                    className={`input-field w-full appearance-none pr-10 ${
                      hasActiveOperations 
                        ? 'cursor-not-allowed opacity-50' 
                        : 'cursor-pointer'
                    }`}
                  >
                    {languageOptions.map(option => (
                      <option key={option.value} value={option.value} className="bg-dark-800 text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <Languages className={`w-5 h-5 ${hasActiveOperations ? 'text-dark-500' : 'text-dark-400'}`} />
                  </div>
                </div>
                {hasActiveOperations ? (
                  <div className="mt-2 p-3 bg-orange-600/20 border border-orange-600/30 rounded-lg">
                    <p className="text-orange-400 text-sm">
                      {t('settings.languageDisabledDuringOperations')}
                    </p>
                  </div>
                ) : (
                  <p className="text-dark-400 text-sm mt-2">
                    {t('settings.currentLanguage', { language: languageOptions.find(l => l.value === currentLanguage)?.name })}
                  </p>
                )}
                <p className="text-dark-400 text-xs mt-1">
                  {t('settings.languageDescription')}
                </p>
              </div>
            </div>
          </div>

          {/* Minecraft Account - REDIRECT TO SIDEBAR */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-6 h-6 text-lumina-500">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm2 4v12h12V6H6zm3 3h6v6H9V9zm1 1v4h4v-4h-4z"/>
                </svg>
              </div>
              <h2 className="text-white text-xl font-semibold">Minecraft Account</h2>
            </div>
            <div className="p-4 bg-blue-600/10 border border-blue-600/20 rounded-lg">
              <p className="text-blue-300 text-sm leading-relaxed mb-3">
                <strong className="text-blue-200">Manage your gameplay identity</strong><br />
                Your Minecraft account (Premium or Offline) is managed directly from the sidebar. Click your player head/avatar in the sidebar to switch accounts or login.
              </p>
            </div>
          </div>

          {/* Account Management */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <User className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.luminakraftAccount')}</h2>
            </div>

            {luminaKraftUser ? (
              <>
                <ProfileEditor
                  luminaKraftUser={luminaKraftUser}
                  discordAccount={discordAccount || null}
                  onUpdate={handleProfileUpdate}
                />

                <div className="mt-6">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('settings.linkedAccounts')}</h3>
                  
                  {discordAccount ? (
                    <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg border border-dark-600">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-[#5865F2] flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 3.42 3.42 0 0 0-.623 1.281 18.346 18.346 0 0 0-5.462 0 2.79 2.79 0 0 0-.623-1.281.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-white">{discordAccount.username}</p>
                          <p className="text-xs text-green-400">{t('settings.connected')}</p>
                        </div>
                      </div>
                      <button
                        onClick={handleUnlinkDiscord}
                        className="text-red-400 hover:text-red-300 text-sm font-medium px-3 py-1 rounded hover:bg-red-400/10 transition-colors"
                      >
                        {t('auth.unlinkDiscord')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleLinkDiscord}
                      className="w-full p-3 border border-dashed border-dark-600 rounded-lg hover:border-dark-500 hover:bg-dark-700/50 transition-colors flex items-center justify-center space-x-2 group"
                    >
                      <div className="w-6 h-6 rounded-full bg-[#5865F2]/20 group-hover:bg-[#5865F2]/30 flex items-center justify-center transition-colors">
                         <svg className="w-4 h-4 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 3.42 3.42 0 0 0-.623 1.281 18.346 18.346 0 0 0-5.462 0 2.79 2.79 0 0 0-.623-1.281.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419z"/>
                         </svg>
                      </div>
                      <span className="text-dark-300 group-hover:text-white transition-colors font-medium">{t('auth.linkDiscord')}</span>
                    </button>
                  )}
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
                    className="flex-1 btn-primary py-2"
                  >
                    {t('settings.signIn')}
                  </button>
                  <button 
                    onClick={handleSignUpToLuminaKraft}
                    className="flex-1 btn-secondary py-2"
                  >
                    {t('settings.signUp')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* API Status */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Server className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.api')}</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-dark-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getStatusIcon()}
                  <div>
                    <p className={`font-medium ${getStatusColor()}`}>
                      {getStatusText()}
                    </p>
                    <p className="text-dark-400 text-sm">
                      Servicios de LuminaKraft
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                  className="btn-secondary inline-flex items-center space-x-2"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isTestingConnection ? 'animate-spin' : ''}`} />
                  {t('settings.testConnection')}
                </button>
              </div>

              {/* Description & separate version box removed per design update */}

              <div className="flex items-center space-x-4">
                <button
                  onClick={handleClearCache}
                  className="btn-secondary inline-flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t('settings.clearCache')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* User Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <User className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.general')}</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-dark-300 text-sm font-medium mb-2">
                  {t('settings.username')}
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder={t('settings.usernamePlaceholder')}
                  className="input-field w-full"
                  disabled={formData.authMethod === 'microsoft'}
                  maxLength={16}
                />
                <p className="text-dark-400 text-xs mt-1">
                  {formData.authMethod === 'microsoft' 
                    ? t('auth.usernameFromMicrosoft')
                    : t('settings.usernameDescription')
                  }
                </p>
                {usernameError && (
                  <p className="text-red-500 text-xs mt-1 flex items-center"><XCircle className="w-4 h-4 mr-1" /> {usernameError}</p>
                )}
              </div>
            </div>
          </div>

          {/* Performance Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <HardDrive className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.performance')}</h2>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-dark-300 text-sm font-medium mb-2">
                  {t('settings.ramAllocationLabel')}
                </label>
                
                {/* RAM allocation display with inline editing */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      min={MIN_RAM}
                      max={MAX_RAM}
                      step="0.5"
                      value={formData.allocatedRam}
                      onChange={(e) => handleRamTextChange(e.target.value)}
                      onBlur={(e) => handleRamTextBlur(e.target.value)}
                      className="bg-transparent border-0 text-white text-lg font-medium w-16 text-center focus:outline-none focus:bg-dark-700 rounded px-1"
                    />
                    <span className="text-white text-lg font-medium">GB</span>
                  </div>
                  <div className="text-dark-400 text-sm">
                    <p>{t('settings.ramRecommended')}</p>
                  </div>
                </div>

                {/* Slider */}
                <div className="mb-4">
                  <input
                    type="range"
                    min={MIN_RAM}
                    max={MAX_RAM}
                    step="0.5"
                    value={formData.allocatedRam}
                    onChange={(e) => handleRamSliderChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-dark-600 rounded-lg appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((formData.allocatedRam - MIN_RAM) / (MAX_RAM - MIN_RAM)) * 100}%, #374151 ${((formData.allocatedRam - MIN_RAM) / (MAX_RAM - MIN_RAM)) * 100}%, #374151 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs text-dark-400 mt-1">
                    <span>{MIN_RAM} GB</span>
                    <span>{MAX_RAM} GB</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Animation Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Zap className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.animations')}</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="block text-dark-300 text-sm font-medium mb-1">
                    {t('settings.enableAnimations')}
                  </label>
                  <p className="text-dark-400 text-xs">
                    {t('settings.enableAnimationsDesc')}
                  </p>
                </div>
                <div className="flex items-center">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enableAnimations !== false}
                      onChange={(e) => handleInputChange('enableAnimations', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-lumina-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-lumina-600"></div>
                  </label>
                </div>
              </div>
              
              <div className={`p-3 rounded-lg ${formData.enableAnimations !== false ? 'bg-green-600/20 border border-green-600/30' : 'bg-orange-600/20 border border-orange-600/30'}`}>
                <p className={`text-sm ${formData.enableAnimations !== false ? 'text-green-300' : 'text-orange-300'}`}>
                  {formData.enableAnimations !== false ? t('settings.animationsEnabled') : t('settings.animationsDisabled')}
                </p>
              </div>
            </div>
          </div>

          {/* Meta Storage Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <HardDrive className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('metaStorage.title')}</h2>
            </div>
            
            <MetaStorageSettings />
          </div>

          {/* Prereleases Settings */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <Shield className="w-6 h-6 text-lumina-500" />
              <h2 className="text-white text-xl font-semibold">{t('settings.prereleases')}</h2>
            </div>
            
            <div className="space-y-4">
              <label className="flex items-center space-x-3 p-3 rounded-lg border border-dark-600 hover:border-dark-500 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enablePrereleases || false}
                  onChange={(e) => setFormData(prev => ({ ...prev, enablePrereleases: e.target.checked }))}
                  className="w-5 h-5 text-lumina-600 bg-dark-700 border-dark-600 rounded focus:ring-lumina-500 focus:ring-2"
                />
                <div className="flex-1">
                  <div className="text-white font-medium">{t('settings.enablePrereleases')}</div>
                  <div className="text-dark-300 text-sm">{t('settings.enablePrereleasesDesc')}</div>
                </div>
              </label>
            </div>
          </div>

          {/* Save Button */}
          {hasChanges && (
            <div className={`sticky bottom-0 bg-dark-900 border-t border-dark-700 p-4 -mx-6 ${isShaking ? 'unsaved-changes-pulse' : ''}`}>
              <div className="flex justify-between items-center">
                <p className="text-dark-400 text-sm">
                  {t('settings.unsavedChanges')}
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={handleDiscard}
                    className="btn-secondary inline-flex items-center space-x-2"
                  >
                    {t('settings.discardChanges')}
                  </button>
                  <button
                    onClick={handleSave}
                    className={`btn-primary inline-flex items-center space-x-2 ${isSaveDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={isSaveDisabled}
                  >
                    <Save className="w-4 h-4" />
                    <span>{t('settings.saveChanges')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={performDeleteAccount}
        title={t('settings.deleteAccount')}
        message={t('auth.confirmDeleteAccount')}
        confirmText={t('app.delete')}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showUnlinkConfirm}
        onClose={() => setShowUnlinkConfirm(false)}
        onConfirm={performUnlinkDiscord}
        title={t('auth.unlinkDiscord')}
        message={t('auth.confirmUnlinkDiscord')}
        confirmText={t('auth.unlinkDiscord')}
        variant="warning"
      />

      <ConfirmDialog
        isOpen={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        onConfirm={performSignOut}
        title={t('auth.signOut')}
        message="Are you sure you want to sign out from your LuminaKraft account?"
        confirmText={t('auth.signOut')}
        variant="info"
      />
    </div>
  );
};

export default SettingsPage;
