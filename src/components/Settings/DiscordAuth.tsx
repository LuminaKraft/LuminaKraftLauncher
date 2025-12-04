import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon, XCircleIcon, RefreshCw, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthService from '../../services/authService';
import type { DiscordAccount } from '../../types/launcher';
import { supabase } from '../../services/supabaseClient';

interface DiscordAuthProps {
  onAuthSuccess: (account: DiscordAccount) => void;
  onAuthClear: () => void;
  onError: (error: string) => void;
}

export default function DiscordAuth({
  onAuthSuccess,
  onAuthClear,
  onError
}: DiscordAuthProps) {
  const { t } = useTranslation();
  const [discordAccount, setDiscordAccount] = useState<DiscordAccount | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [isProcessingManual, setIsProcessingManual] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const authService = AuthService.getInstance();

  const SYNC_COOLDOWN_MS = 30000; // 30 seconds cooldown

  // Load Discord account on mount
  useEffect(() => {
    loadDiscordAccount();
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (lastSyncTime === 0) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastSyncTime;
      const remaining = Math.max(0, SYNC_COOLDOWN_MS - elapsed);
      setCooldownRemaining(remaining);

      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [lastSyncTime]);

  const loadDiscordAccount = async () => {
    setIsLoading(true);
    const account = await authService.getDiscordAccount();
    setDiscordAccount(account);
    setIsLoading(false);
  };

  const handleLinkDiscord = async () => {
    try {
      const success = await authService.linkDiscordAccount();
      if (success) {
        // Show info toast that OAuth was opened in browser
        toast('Autoriza Discord en tu navegador. El launcher se abrirá automáticamente después.', {
          duration: 5000,
        });
        setShowManualInput(true);
      } else {
        onError(t('auth.discordLinkFailed'));
      }
      // OAuth will redirect, callback will be handled by App.tsx
    } catch (error) {
      console.error('Discord link error:', error);
      onError(t('auth.discordLinkFailed'));
    }
  };

  const handleManualUrlSubmit = async () => {
    if (!manualUrl) return;

    setIsProcessingManual(true);
    try {
      // Extract hash from URL
      const hashPart = manualUrl.split('#')[1];
      if (!hashPart) {
        toast.error(t('errors.invalidUrlNoToken'));
        return;
      }

      // Parse tokens
      const params = new URLSearchParams(hashPart);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const providerToken = params.get('provider_token');
      const providerRefreshToken = params.get('provider_refresh_token');

      console.log('Tokens extracted from manual URL:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        hasProviderToken: !!providerToken,
        hasProviderRefreshToken: !!providerRefreshToken
      });

      if (!accessToken || !refreshToken) {
        toast.error(t('errors.invalidUrlMissingTokens'));
        return;
      }

      // Set session
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (sessionError) {
        toast.error(t('errors.failedSetSession'));
        console.error(sessionError);
        return;
      }

      // Sync Discord data with both tokens
      const success = await authService.syncDiscordData(
        providerToken || undefined,
        providerRefreshToken || undefined
      );
      if (success) {
        toast.success(t('auth.discordLinked'));
        setShowManualInput(false);
        setManualUrl('');
        await loadDiscordAccount();
      } else {
        toast.error(t('auth.discordLinkFailed'));
      }
    } catch (error) {
      console.error('Manual auth error:', error);
      toast.error(t('errors.errorProcessingUrl'));
    } finally {
      setIsProcessingManual(false);
    }
  };

  const handleSyncRoles = async () => {
    // Check cooldown
    if (cooldownRemaining > 0) {
      toast.error(t('errors.discord.syncCooldown', { seconds: Math.ceil(cooldownRemaining / 1000) }));
      return;
    }

    setIsSyncing(true);
    try {
      const success = await authService.syncDiscordRoles();
      if (success) {
        setLastSyncTime(Date.now());
        await loadDiscordAccount(); // Reload account data
        const updatedAccount = await authService.getDiscordAccount();
        if (updatedAccount) {
          setDiscordAccount(updatedAccount);
          onAuthSuccess(updatedAccount);
        }
        // Silently succeed for background sync operation
      } else {
        // Sync failed - suggest relinking Discord account
        toast.error(t('auth.discordSyncFailed'), {
          duration: 6000,
        });
      }
    } catch (error) {
      console.error('Sync error:', error);
      // Error during sync - suggest relinking Discord account
      toast.error(t('auth.discordSyncFailed'), {
        duration: 6000,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUnlinkDiscord = async () => {
    if (!confirm(t('auth.confirmUnlinkDiscord'))) return;

    const success = await authService.unlinkDiscordAccount();
    if (success) {
      setDiscordAccount(null);
      onAuthClear();
      await loadDiscordAccount(); // Force reload to confirm unlink
      toast.success(t('auth.discordUnlinked'));
    } else {
      toast.error(t('auth.discordUnlinkFailed'));
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-gray-600 dark:text-gray-400 text-center">
          {t('common.loading')}...
        </p>
      </div>
    );
  }

  // If Discord is linked
  if (discordAccount) {
    const needsSync = discordAccount.lastSync
      ? new Date(discordAccount.lastSync) < new Date(Date.now() - 6 * 60 * 60 * 1000)
      : true;

    return (
      <div className="space-y-4">
        {/* Discord Account Info */}
        <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center space-x-3">
            {discordAccount.avatar ? (
              <img
                src={`https://cdn.discordapp.com/avatars/${discordAccount.id}/${discordAccount.avatar}.webp?size=40`}
                alt="Discord avatar"
                className="w-10 h-10 rounded-full"
                onError={(e) => {
                  // Fallback to PNG if WebP fails
                  const target = e.target as HTMLImageElement;
                  if (target.src.includes('.webp')) {
                    target.src = `https://cdn.discordapp.com/avatars/${discordAccount.id}/${discordAccount.avatar}.png?size=40`;
                  }
                }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                {discordAccount.username.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-medium text-indigo-800 dark:text-indigo-200">
                {discordAccount.globalName || discordAccount.username}
              </p>
              <p className="text-sm text-indigo-600 dark:text-indigo-400">
                @{discordAccount.username}
              </p>
            </div>
          </div>
          <button
            onClick={handleUnlinkDiscord}
            className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
          >
            {t('auth.unlinkDiscord')}
          </button>
        </div>

        {/* Server Membership Status */}
        <div className={`p-4 rounded-lg border ${
          discordAccount.isMember
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {discordAccount.isMember ? (
                <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <XCircleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              )}
              <div>
                <p className={`font-medium ${
                  discordAccount.isMember
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-yellow-800 dark:text-yellow-200'
                }`}>
                  {discordAccount.isMember
                    ? t('auth.discordMemberYes')
                    : t('auth.discordMemberNo')}
                </p>
                {!discordAccount.isMember && (
                  <div className="mt-1">
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">
                      {t('auth.discordJoinRequired')}
                    </p>
                    <a
                      href="https://discord.gg/UJZRrcUFMj"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-yellow-700 dark:text-yellow-300 underline hover:text-yellow-900 dark:hover:text-yellow-100 mt-1 inline-block"
                    >
                      {t('auth.joinDiscordServer')}
                    </a>
                  </div>
                )}
              </div>
            </div>
            {discordAccount.isMember && (
              <button
                onClick={handleSyncRoles}
                disabled={isSyncing || cooldownRemaining > 0}
                className="flex items-center gap-2 px-3 py-1 text-sm bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing
                  ? t('auth.syncing')
                  : cooldownRemaining > 0
                    ? `${Math.ceil(cooldownRemaining / 1000)}s`
                    : t('auth.syncRoles')
                }
              </button>
            )}
          </div>
        </div>

        {/* Partner Role Status */}
        {discordAccount.isMember && discordAccount.hasPartnerRole && (
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="flex items-center space-x-3">
              <CheckCircleIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <div>
                <p className="font-medium text-purple-800 dark:text-purple-200">
                  {t('auth.partnerRole')}
                </p>
                <p className="text-sm text-purple-600 dark:text-purple-400">
                  {t('auth.canPublishPartnerModpacks')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sync Warning */}
        {needsSync && discordAccount.isMember && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                {t('auth.rolesNeedSync')}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // If Discord not linked
  return (
    <div className="space-y-4">
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          {t('auth.discordLinkDescription')}
        </p>
        <button
          onClick={handleLinkDiscord}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 71 55" fill="currentColor">
            <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"/>
          </svg>
          <span>{t('auth.linkDiscord')}</span>
        </button>

        {/* Manual URL input for development/fallback */}
        {showManualInput && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
              Si no se abrió el launcher automáticamente, pega aquí la URL completa de auth-callback:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://luminakraft.com/auth-callback#access_token=..."
                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-yellow-300 dark:border-yellow-700 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
              <button
                onClick={handleManualUrlSubmit}
                disabled={isProcessingManual || !manualUrl}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isProcessingManual ? 'Procesando...' : 'Vincular'}
              </button>
            </div>
            <button
              onClick={() => {
                setShowManualInput(false);
                setManualUrl('');
              }}
              className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 hover:underline"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
          {t('auth.whyLinkDiscord')}
        </p>
        <ul className="space-y-1 text-sm text-blue-700 dark:text-blue-300">
          <li>• {t('auth.discordBenefit1')}</li>
          <li>• {t('auth.discordBenefit2')}</li>
          <li>• {t('auth.discordBenefit3')}</li>
        </ul>
      </div>
    </div>
  );
}
