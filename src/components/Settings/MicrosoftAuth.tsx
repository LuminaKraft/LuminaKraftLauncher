import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UserIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react';
import AuthService from '../../services/authService';
import type { MicrosoftAccount, UserSettings } from '../../types/launcher';

interface MicrosoftAuthProps {
  userSettings: UserSettings;
  onAuthSuccess: (_account: MicrosoftAccount) => void;
  onAuthClear: () => void;
  onError: (_error: string) => void;
  onAuthStart?: () => void;
  onAuthStop?: () => void;
}

export default function MicrosoftAuth({ 
  userSettings, 
  onAuthSuccess, 
  onAuthClear, 
  onError,
  onAuthStart,
  onAuthStop
}: MicrosoftAuthProps) {
  const { t } = useTranslation();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const authService = AuthService.getInstance();

  // Trigger automatic authentication when requested from sidebar
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('triggerMicrosoftAuth') === '1') {
      localStorage.removeItem('triggerMicrosoftAuth');
      void startMicrosoftAuthModal();
    }
  }, []);

  const startMicrosoftAuthModal = async () => {
    try {
      setIsAuthenticating(true);
      onAuthStart?.();

      // Use the modal-based authentication
      const account = await authService.authenticateWithMicrosoftModal();

      // Update ModpackManagementService with Microsoft account
      const { ModpackManagementService } = await import('../../services/modpackManagementService');
      ModpackManagementService.getInstance().setMicrosoftAccount(account);

      onAuthSuccess(account);

    } catch (error) {
      // Determine type of error and message
      let errorMessage = t('auth.authFailed');

      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('timeout')) {
          errorMessage = t('auth.authTimeout');
        } else if (msg.includes('closed') || msg.includes('cancel')) {
          errorMessage = t('auth.authCanceled');
        } else {
          errorMessage = error.message;
        }
      }

      onError(errorMessage);
    } finally {
      setIsAuthenticating(false);
      onAuthStop?.();
    }
  };


  const handleRefreshToken = async () => {
    if (!userSettings.microsoftAccount) return;

    try {
      setIsAuthenticating(true);
      onAuthStart?.();
      
      const refreshedAccount = await authService.refreshMicrosoftToken(
        userSettings.microsoftAccount.refreshToken
      );
      
      onAuthSuccess(refreshedAccount);
    } catch (error) {
      console.error('Failed to refresh token:', error);
      onError(t('auth.refreshFailed'));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    // Confirm with user before signing out
    const confirmSignOut = window.confirm(
      t('auth.confirmSignOutMicrosoft') ||
      'Are you sure you want to sign out? Your Microsoft account data will be removed.'
    );

    if (!confirmSignOut) {
      return;
    }

    try {
      // Sign out from Supabase (this will clean Microsoft data and remove provider)
      await authService.signOutSupabase();
      onAuthClear();
    } catch (error) {
      console.error('Error signing out:', error);
      onError(t('auth.signOutFailed') || 'Failed to sign out');
    }
  };

  // If user is already authenticated with Microsoft
  if (userSettings.authMethod === 'microsoft' && userSettings.microsoftAccount) {
    const account = userSettings.microsoftAccount;
    const isTokenExpired = account.exp < Math.floor(Date.now() / 1000);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center space-x-3">
            <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">
                {t('auth.authenticated')}
              </p>
              <p className="text-sm text-green-600 dark:text-green-400">
                {account.username} ({account.uuid})
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
          >
            {t('auth.signOut')}
          </button>
        </div>

        {isTokenExpired && (
          <div className="flex items-center justify-between p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center space-x-3">
              <XCircleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  {t('auth.tokenExpired')}
                </p>
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  {t('auth.tokenExpiredDescription')}
                </p>
              </div>
            </div>
            <button
              onClick={handleRefreshToken}
              disabled={isAuthenticating}
              className="px-3 py-1 text-sm bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 rounded hover:bg-yellow-200 dark:hover:bg-yellow-900/40 transition-colors disabled:opacity-50"
            >
              {isAuthenticating ? t('auth.refreshing') : t('auth.refresh')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={startMicrosoftAuthModal}
      disabled={isAuthenticating}
      className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
    >
      <UserIcon className="w-4 h-4" />
      <span>
        {isAuthenticating ? t('auth.signing') : t('auth.signInMicrosoft')}
      </span>
    </button>
  );
} 