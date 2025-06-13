import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserIcon, ExternalLinkIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react';
import AuthService from '../../services/authService';
import type { MicrosoftAccount, UserSettings } from '../../types/launcher';

interface MicrosoftAuthProps {
  userSettings: UserSettings;
  onAuthSuccess: (account: MicrosoftAccount) => void;
  onAuthClear: () => void;
  onError: (error: string) => void;
}

export default function MicrosoftAuth({ 
  userSettings, 
  onAuthSuccess, 
  onAuthClear, 
  onError 
}: MicrosoftAuthProps) {
  const { t } = useTranslation();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authStep, setAuthStep] = useState<'idle' | 'waiting_for_url'>('idle');
  const [redirectUrl, setRedirectUrl] = useState('');
  
  const authService = AuthService.getInstance();

  const startMicrosoftAuthModal = async () => {
    try {
      setIsAuthenticating(true);
      
      // Use the new modal-based authentication (like Modrinth)
      const account = await authService.authenticateWithMicrosoftModal();
      onAuthSuccess(account);
      
    } catch (error) {
      // Show more detailed error information
      let errorMessage = t('auth.authFailed');
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMessage = t('auth.authTimeout');
        } else if (error.message.includes('closed')) {
          errorMessage = t('auth.authCanceled');
        } else {
          errorMessage = error.message;
        }
      }
      
      onError(errorMessage);
      
      // Automatically switch to alternative method if modal fails
      setTimeout(() => {
        setAuthStep('waiting_for_url');
      }, 1000);
      
    } finally {
      setIsAuthenticating(false);
    }
  };

  const startMicrosoftAuth = async () => {
    try {
      setIsAuthenticating(true);
      
      // Open browser and get auth URL
      await authService.openMicrosoftAuthAndGetUrl();
      
      // Show URL input step
      setAuthStep('waiting_for_url');
      
    } catch (error) {
      console.error('Failed to start Microsoft authentication:', error);
      onError(error instanceof Error ? error.message : t('auth.authFailed'));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const submitRedirectUrl = async () => {
    if (!redirectUrl.trim()) {
      onError(t('auth.enterUrl'));
      return;
    }

    try {
      setIsAuthenticating(true);
      
      // Extract code from URL
      const code = await authService.extractCodeFromUrl(redirectUrl);
      
      // Authenticate with the code
      const account = await authService.authenticateMicrosoft(code);
      onAuthSuccess(account);
      
      // Reset state
      setAuthStep('idle');
      setRedirectUrl('');
      
    } catch (error) {
      console.error('Failed to authenticate with URL:', error);
      onError(error instanceof Error ? error.message : t('auth.authFailed'));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleRefreshToken = async () => {
    if (!userSettings.microsoftAccount) return;

    try {
      setIsAuthenticating(true);
      
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

  const handleSignOut = () => {
    setAuthStep('idle');
    setRedirectUrl('');
    onAuthClear();
  };

  const cancelAuth = () => {
    setAuthStep('idle');
    setRedirectUrl('');
    setIsAuthenticating(false);
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
    <div className="space-y-4">
      {authStep === 'idle' && (
        <div className="space-y-4">
          <div className="flex items-center space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <UserIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="font-medium text-blue-800 dark:text-blue-200">
                {t('auth.microsoftAuth')}
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-400">
                {t('auth.microsoftDescription')}
              </p>
            </div>
          </div>
          
          <div className="space-y-3">
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
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                  {t('auth.or')}
                </span>
              </div>
            </div>

            <button
              onClick={startMicrosoftAuth}
              disabled={isAuthenticating}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <ExternalLinkIcon className="w-4 h-4" />
              <span>
                {t('auth.useAlternativeMethod')}
              </span>
            </button>
          </div>
        </div>
      )}

      {authStep === 'waiting_for_url' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
              {t('auth.step2Title')}
            </h3>
            <p className="text-sm text-blue-600 dark:text-blue-400 mb-4">
              {t('auth.step2DescriptionUrl')}
            </p>
            <div className="p-3 bg-blue-100 dark:bg-blue-800/30 rounded-lg mb-4">
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                <strong>{t('app.note')}:</strong> {t('auth.blankPageExpected')}
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-300">
                {t('auth.copyFullUrl')}
              </p>
              <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                Ejemplo: https://login.live.com/oauth20_desktop.srf?code=...&state=...
              </p>
            </div>
            
            <div className="space-y-3">
              <input
                type="text"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                placeholder={t('auth.urlPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              
              <div className="flex space-x-2">
                <button
                  onClick={submitRedirectUrl}
                  disabled={isAuthenticating || !redirectUrl.trim()}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isAuthenticating ? t('auth.verifying') : t('auth.verifyUrl')}
                </button>
                
                <button
                  onClick={cancelAuth}
                  disabled={isAuthenticating}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {t('auth.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 