import { createContext, useContext, useReducer, useEffect, ReactNode, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ModpacksData,
  ModpackState,
  UserSettings,
  ProgressInfo,
  FailedMod,
  ModpackStatus,
  MicrosoftAccount
} from '../types/launcher';
import { IntegrityError } from '../services/IntegrityError';
import { IntegrityErrorModal } from '../components/Modpacks/IntegrityErrorModal';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';

// Define LauncherState here since it is missing from types
interface LauncherState {
  modpacksData: ModpacksData | null;
  modpackStates: { [id: string]: ModpackState };
  userSettings: UserSettings;
  currentLanguage: string;
  isLoading: boolean;
  error: string | null;
  isOnline: boolean;
}
import LauncherService from '../services/launcherService';
import { FailedModsDialog } from '../components/FailedModsDialog';
import AuthService from '../services/authService';
import JSZip from 'jszip';
import { ModpackManagementService } from '../services/modpackManagementService';
import { listen } from '@tauri-apps/api/event';
import { supabase, getUserProfile } from '../services/supabaseClient';
import RateLimitDialog from '../components/RateLimitDialog';

interface LauncherContextType {
  modpacksData: ModpacksData | null;
  modpackStates: { [id: string]: ModpackState };
  userSettings: UserSettings;
  currentLanguage: string;
  isLoading: boolean;
  error: string | null;
  isAuthenticating: boolean;
  hasActiveOperations: boolean;
  setIsAuthenticating: (_value: boolean) => void;
  updateUserSettings: (_settings: Partial<UserSettings>) => Promise<void>;
  refreshData: () => Promise<void>;
  installModpack: (_id: string) => Promise<boolean>;
  installModpackFromZip: (_filePath: string) => Promise<void>;
  updateModpack: (_id: string) => Promise<boolean>;
  launchModpack: (_id: string) => Promise<boolean>;
  repairModpack: (_id: string) => Promise<boolean>;
  stopInstance: (_id: string) => Promise<boolean>;
  changeLanguage: (_language: string) => Promise<void>;
  removeModpack: (_id: string) => Promise<void>;
  showUsernameDialog: boolean;
  setShowUsernameDialog: (_value: boolean) => void;
  isOnline: boolean;
}

type LauncherAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_MODPACKS_DATA'; payload: ModpacksData }
  | { type: 'SET_LANGUAGE'; payload: string }
  | { type: 'SET_USER_SETTINGS'; payload: UserSettings }
  | { type: 'SET_MODPACK_STATE'; payload: { id: string; state: ModpackState } }
  | { type: 'UPDATE_MODPACK_PROGRESS'; payload: { id: string; progress: ProgressInfo } }
  | { type: 'SET_ONLINE'; payload: boolean };

// Load settings synchronously from launcherService to ensure onboardingCompleted 
// and other persisted settings are available immediately on app start
const launcherService = LauncherService.getInstance();
const loadedSettings = launcherService.getUserSettings();

const initialState: LauncherState = {
  modpacksData: null,
  modpackStates: {},
  userSettings: loadedSettings, // Use loaded settings instead of defaultSettings
  currentLanguage: loadedSettings.language || 'en',
  isLoading: false,
  error: null,
  isOnline: navigator.onLine,
};

function launcherReducer(state: LauncherState, action: LauncherAction): LauncherState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'SET_ONLINE':
      return { ...state, isOnline: action.payload };
    case 'SET_MODPACKS_DATA':
      return { ...state, modpacksData: action.payload, isLoading: false };
    case 'SET_LANGUAGE':
      return { ...state, currentLanguage: action.payload };
    case 'SET_USER_SETTINGS':
      return { ...state, userSettings: action.payload };
    case 'SET_MODPACK_STATE':
      return {
        ...state,
        modpackStates: {
          ...state.modpackStates,
          [action.payload.id]: action.payload.state,
        },
      };
    case 'UPDATE_MODPACK_PROGRESS':
      const currentProgress = state.modpackStates[action.payload.id]?.progress;
      const newProgress = action.payload.progress;

      // Calcular tiempo estimado
      const currentTime = Date.now();
      const currentState = state.modpackStates[action.payload.id];
      let eta = '';
      let progressHistory = currentState?.progressHistory || [];

      // Add new entry to history (keep last 20 entries for better stability)
      progressHistory = [...progressHistory.slice(-19), {
        percentage: newProgress.percentage,
        timestamp: currentTime
      }];

      // Calculate ETA only if we have enough data and progress is between 10% and 95%
      if (progressHistory.length >= 5 && newProgress.percentage > 10 && newProgress.percentage < 95) {
        // Use larger window for better stability - last 10 points if available
        const windowSize = Math.min(10, progressHistory.length);
        const windowStart = progressHistory.length - windowSize;
        const window = progressHistory.slice(windowStart);

        const oldest = window[0];
        const newest = window[window.length - 1];

        const timeElapsed = (newest.timestamp - oldest.timestamp) / 1000; // seconds
        const progressMade = newest.percentage - oldest.percentage;

        if (progressMade > 0.5 && timeElapsed > 2) { // More restrictive to avoid jumps
          const remainingProgress = 100 - newProgress.percentage;
          let estimatedTimeRemaining = (remainingProgress * timeElapsed) / progressMade;

          // Smooth ETA using moving average with previous ETA
          if (currentState?.lastEtaSeconds) {
            const weight = 0.7; // 70% previous value, 30% new value (smoother)
            estimatedTimeRemaining = (currentState.lastEtaSeconds * weight) + (estimatedTimeRemaining * (1 - weight));
          }

          // Only show if reasonable (less than 30 minutes)
          if (estimatedTimeRemaining < 1800) {
            const minutes = Math.floor(estimatedTimeRemaining / 60);
            const seconds = Math.floor(estimatedTimeRemaining % 60);
            eta = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
          }

          // Guardar el valor en segundos para suavizado futuro (solo si currentState existe)
          if (currentState) {
            currentState.lastEtaSeconds = estimatedTimeRemaining;
          }
        }
      }

      // Prevenir que el porcentaje baje (excepto cuando se reinicia al 0-5% o durante mod downloads)
      let finalPercentage = newProgress.percentage;
      if (currentProgress && newProgress.percentage > 5) {
        // Allow backwards progress if we're in mod download phase (75-95% range)
        const isModDownloadPhase = newProgress.step?.includes('downloading_mod') ||
          newProgress.step?.includes('preparing_mod_downloads') ||
          newProgress.generalMessage?.includes('downloadingMods') ||
          (newProgress.percentage >= 75 && newProgress.percentage <= 95);

        if (!isModDownloadPhase) {
          finalPercentage = Math.max(currentProgress.percentage, newProgress.percentage);
        } else {
          finalPercentage = newProgress.percentage; // Allow backwards progress during mod downloads
        }
      }

      // Keep last general message and ETA if new one doesn't have one (avoid visual jumps)
      const finalProgress = {
        ...newProgress,
        percentage: finalPercentage,
        eta: eta || currentProgress?.eta || '', // Preserve previous ETA if no new one
        generalMessage: newProgress.generalMessage || currentProgress?.generalMessage || '',
        detailMessage: newProgress.detailMessage || ''
      };

      return {
        ...state,
        modpackStates: {
          ...state.modpackStates,
          [action.payload.id]: {
            ...state.modpackStates[action.payload.id],
            progress: finalProgress,
            progressHistory: progressHistory
          },
        },
      };
    default:
      return state;
  }
}

const LauncherContext = createContext<LauncherContextType | undefined>(undefined);

// Helper function to create a complete ModpackState object
const createModpackState = (
  status: ModpackStatus,
  overrides: Partial<ModpackState> = {}
): ModpackState => {
  const defaultProgress: ProgressInfo = {
    percentage: 0,
    downloaded: 0,
    total: 0,
    speed: 0,
    currentFile: '',
    downloadSpeed: '',
    eta: '',
    step: '',
    generalMessage: '',
    detailMessage: ''
  };

  return {
    installed: ['installed', 'outdated'].includes(status),
    downloading: ['installing', 'updating', 'launching'].includes(status),
    progress: defaultProgress,
    status,
    ...overrides
  };
};

export function LauncherProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(launcherReducer, initialState);
  const [failedMods, setFailedMods] = useState<FailedMod[]>([]);
  const [showFailedModsDialog, setShowFailedModsDialog] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showUsernameDialog, setShowUsernameDialog] = useState(false);
  const [rateLimitDialog, setRateLimitDialog] = useState<{
    isOpen: boolean;
    errorCode: string;
    limit: number;
    resetAt: string;
  }>({ isOpen: false, errorCode: '', limit: 0, resetAt: '' });
  const [integrityErrorDialog, setIntegrityErrorDialog] = useState<{
    isOpen: boolean;
    modpackId: string;
    issues: string[];
    modpackName?: string;
    title?: string;
  }>({ isOpen: false, modpackId: '', issues: [] });
  const refreshDataRef = useRef<(() => Promise<void>) | null>(null);
  const launcherService = LauncherService.getInstance();
  const { i18n, t } = useTranslation();

  // Load user configuration on initialization
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const settings = launcherService.getUserSettings();
        const authService = AuthService.getInstance();

        dispatch({ type: 'SET_USER_SETTINGS', payload: settings });
        dispatch({ type: 'SET_LANGUAGE', payload: settings.language });

        // Synchronize language with react-i18next
        await i18n.changeLanguage(settings.language);

        // If user has Microsoft account, set it in modpack management service (for Minecraft launching)
        if (settings.authMethod === 'microsoft' && settings.microsoftAccount) {
          // Set Microsoft account in modpack management service
          ModpackManagementService.getInstance().setMicrosoftAccount(settings.microsoftAccount);
        }

        // Sync Discord roles if needed (last sync > 6 hours ago)
        const shouldSyncDiscord = await authService.shouldSyncDiscordRoles();
        if (shouldSyncDiscord) {
          console.log('🔄 Syncing Discord roles on app launch...');
          await authService.syncDiscordRoles();
        }

        // Load initial data - cache will be used if valid (TTL-based)
        await refreshData();
      } catch (error) {
        console.error('Error initializing app:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Error initializing application' });
      }
    };

    initializeApp();
  }, []);

  // Listen for online/offline status
  useEffect(() => {
    const handleOnline = () => dispatch({ type: 'SET_ONLINE', payload: true });
    const handleOffline = () => dispatch({ type: 'SET_ONLINE', payload: false });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Helper to refresh user profile from Supabase and update local settings
  const refreshUserProfile = async () => {
    try {
      const profile = await getUserProfile() as any;
      if (profile) {
        // Map profile to DiscordAccount
        const discordAccount: any = {
          id: profile.discord_id || '',
          username: profile.discord_username || '',
          globalName: profile.discord_global_name || null,
          discriminator: undefined,
          avatar: profile.discord_avatar,
          isMember: profile.is_discord_member || false,
          hasPartnerRole: profile.has_partner_role || false,
          partnerId: profile.partner_id,
          roles: profile.discord_roles || [],
          lastSync: profile.last_discord_sync
        };

        // Update userSettings with new Discord info
        // IMPORTANT: Use launcherService.getUserSettings() to get the LATEST saved settings
        // This avoids stale closure issues where state.userSettings might be outdated
        const currentSettings = launcherService.getUserSettings();
        const existingClientToken = currentSettings.clientToken;

        const newSettings = {
          ...currentSettings, // Use fresh settings, not potentially stale state
          clientToken: existingClientToken, // Ensure clientToken is never lost
          discordAccount: discordAccount
        };

        // Save to local storage via service
        launcherService.saveUserSettings(newSettings);

        // Update state
        dispatch({ type: 'SET_USER_SETTINGS', payload: newSettings });
        console.log('✅ User settings updated with latest profile data (clientToken preserved)');
      }
    } catch (error) {
      console.error('Error refreshing user profile:', error);
    }
  };

  // Listen for profile updates (e.g. after Discord sync)
  useEffect(() => {
    const handleProfileUpdate = () => {
      console.log('🔄 Profile updated event received, refreshing settings...');
      setIsAuthenticating(false);
      refreshUserProfile();
    };

    window.addEventListener('luminakraft:profile-updated', handleProfileUpdate);

    // Also refresh on mount if we might have a session
    refreshUserProfile();

    return () => {
      window.removeEventListener('luminakraft:profile-updated', handleProfileUpdate);
    };
  }, []);

  // Load modpack states when data is loaded
  useEffect(() => {
    if (state.modpacksData) {
      loadModpackStates().catch(error => {
        console.error('Error loading modpack states:', error);
      });
    }
  }, [state.modpacksData]);

  // ---------------------------------------------------------------------------
  // Periodic data refresh (every 5 minutes) - uses stale-while-revalidate pattern
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Set up interval to refresh data every 5 minutes
    // The cache TTL handles staleness - no need to clear cache
    const refreshInterval = setInterval(() => {
      console.log('🔄 Periodic data refresh (cache TTL handles staleness)...');
      refreshData().catch(error => {
        console.error('Error in periodic data refresh:', error);
      });
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      clearInterval(refreshInterval);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Automatic Microsoft token refresh
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const { authMethod, microsoftAccount } = state.userSettings;

    // Only handle automatic refresh for Microsoft accounts
    if (authMethod !== 'microsoft' || !microsoftAccount) {
      return;
    }

    const authService = AuthService.getInstance();

    // Helper that performs the refresh call and updates settings
    const doRefresh = async () => {
      try {
        const refreshedAccount = await authService.refreshMicrosoftToken(microsoftAccount.refreshToken);
        if (refreshedAccount) {
          // Persist the new tokens and expiration
          updateUserSettings({
            authMethod: 'microsoft',
            microsoftAccount: refreshedAccount,
            username: refreshedAccount.username,
          });
        }
      } catch (error) {
        console.error('Automatic Microsoft token refresh failed:', error);
      }
    };

    // Determine when to refresh (2 minutes before expiration)
    const nowSec = Math.floor(Date.now() / 1000);
    const bufferSec = 120;
    const secsUntilExpiry = microsoftAccount.exp - nowSec;
    const secsUntilRefresh = Math.max(0, secsUntilExpiry - bufferSec);

    // If already expired (or about to), refresh immediately; else schedule
    if (secsUntilRefresh === 0) {
      void doRefresh();
      return; // Effect cleanup will be handled on re-render after state update
    }

    const timeoutId = setTimeout(() => {
      void doRefresh();
    }, secsUntilRefresh * 1000);

    // Cleanup when component unmounts or dependencies change
    return () => {
      clearTimeout(timeoutId);
    };
  }, [state.userSettings.authMethod, state.userSettings.microsoftAccount?.exp]);

  // ---------------------------------------------------------------------------
  // Listen for Microsoft token refresh events from backend
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const setupTokenRefreshListener = async () => {
      try {
        const unlisten = await listen<MicrosoftAccount>('microsoft-token-refreshed', (event) => {
          console.log('🔄 Received refreshed Microsoft token from backend');
          const refreshedAccount = event.payload;

          // Update user settings with the new token
          updateUserSettings({
            authMethod: 'microsoft',
            microsoftAccount: refreshedAccount,
            username: refreshedAccount.username,
          });

          console.log('✅ Microsoft token updated in frontend');
        });

        // Return cleanup function
        return unlisten;
      } catch (error) {
        console.error('Failed to setup Microsoft token refresh listener:', error);
        return null;
      }
    };

    const cleanupPromise = setupTokenRefreshListener();

    // Cleanup on unmount
    return () => {
      cleanupPromise.then(cleanup => {
        if (cleanup) {
          cleanup();
        }
      });
    };
  }, []); // Empty dependency array since this should only run once

  // Listen for cache clear events from anywhere in the app
  useEffect(() => {
    const handleCacheCleared = () => {
      console.log('🧹 Cache cleared event received in LauncherProvider, refreshing data...');
      if (refreshDataRef.current) {
        refreshDataRef.current();
      }
    };

    window.addEventListener('luminakraft:cache-cleared', handleCacheCleared);

    return () => {
      window.removeEventListener('luminakraft:cache-cleared', handleCacheCleared);
    };
  }, []); // Empty dependency array - only register once at mount

  // Listen for Supabase auth changes (Sign Out)
  useEffect(() => {
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out, clearing account data');
        updateUserSettings({
          discordAccount: undefined,
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const refreshData = async (retryCount = 0) => {
    dispatch({
      type: 'SET_LOADING',
      payload: true
    });
    dispatch({
      type: 'SET_ERROR',
      payload: null
    });

    try {
      // Load modpacks data
      const modpacksData = await launcherService.fetchModpacksData();
      dispatch({
        type: 'SET_MODPACKS_DATA',
        payload: modpacksData
      });
      dispatch({
        type: 'SET_LOADING',
        payload: false
      });
    } catch (error) {
      console.error('Error loading modpacks data:', error);
      // Retry logic for startup (max 2 retries)
      if (retryCount < 2) {
        console.log(`Retrying data load... (attempt ${retryCount + 1}/2)`);
        setTimeout(() => {
          refreshData(retryCount + 1);
        }, 2000); // Wait 2 seconds before retry
        return;
      }
      dispatch({
        type: 'SET_ERROR',
        payload: 'Error loading modpacks data'
      });
    } finally {
      if (retryCount >= 2) {
        dispatch({
          type: 'SET_LOADING',
          payload: false
        });
      }
    }
  };

  const loadModpackStates = async () => {
    if (!state.modpacksData) return;

    // Load states for server modpacks
    for (const modpack of state.modpacksData.modpacks) {
      try {
        const status = await launcherService.getModpackStatus(modpack.id);
        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: {
            id: modpack.id,
            state: createModpackState(status),
          },
        });
      } catch (error) {
        console.error(`Error loading state for modpack ${modpack.id}:`, error);
        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: {
            id: modpack.id,
            state: createModpackState('error', {
              error: 'Error loading state'
            }),
          },
        });
      }
    }

    // Also load local modpacks that are not in server data
    try {
      const localModpacksJson = await invoke<string>('get_local_modpacks');
      const localModpacks: {
        id: string
      }[] = JSON.parse(localModpacksJson);
      const serverModpackIds = new Set(state.modpacksData.modpacks.map(m => m.id));

      for (const localModpack of localModpacks) {
        if (!serverModpackIds.has(localModpack.id)) {
          // This is a local-only modpack
          dispatch({
            type: 'SET_MODPACK_STATE',
            payload: {
              id: localModpack.id,
              state: createModpackState('installed'),
            },
          });
        }
      }
    } catch (error) {
      console.error('Error loading local modpacks:', error);
    }
  };

  const updateUserSettings = async (settings: Partial<UserSettings>) => {
    // IMPORTANT: Ensure clientToken is preserved - it's critical for rate limiting
    const existingClientToken = state.userSettings.clientToken || launcherService.getUserSettings().clientToken;
    const newSettings = {
      ...state.userSettings,
      ...settings,
      clientToken: existingClientToken // Always preserve clientToken
    };
    launcherService.saveUserSettings(newSettings); // Save FULL settings, not partial
    dispatch({
      type: 'SET_USER_SETTINGS',
      payload: newSettings
    });

    // If username changed and user is authenticated, sync with Supabase
    if (settings.username && settings.username !== state.userSettings.username) {
      if (state.userSettings.authMethod === 'microsoft' || state.userSettings.authMethod === 'discord' || state.userSettings.authMethod === 'both') {
        const authService = AuthService.getInstance();
        await authService.updateMinecraftUsername(settings.username);
      }
    }
  };

  const changeLanguage = async (language: string) => {
    try {
      await i18n.changeLanguage(language);
      dispatch({
        type: 'SET_LANGUAGE',
        payload: language
      });
      updateUserSettings({
        language
      });

      // Clear cache completely to force reload of all data
      launcherService.clearCache();
      dispatch({
        type: 'SET_LOADING',
        payload: true
      });
      dispatch({
        type: 'SET_ERROR',
        payload: null
      });
      try {
        const modpacksData = await launcherService.fetchModpacksData();
        dispatch({
          type: 'SET_MODPACKS_DATA',
          payload: modpacksData
        });
        if (modpacksData) {
          for (const modpack of modpacksData.modpacks) {
            try {
              const status = await launcherService.getModpackStatus(modpack.id);
              dispatch({
                type: 'SET_MODPACK_STATE',
                payload: {
                  id: modpack.id,
                  state: createModpackState(status),
                },
              });
            } catch (modpackError) {
              console.warn(`Error loading data for modpack ${modpack.id}:`, modpackError);
              dispatch({
                type: 'SET_MODPACK_STATE',
                payload: {
                  id: modpack.id,
                  state: createModpackState('error', {
                    error: 'Error loading modpack data'
                  }),
                },
              });
            }
          }
        }
      } catch (dataError) {
        console.error('Error reloading data after language change:', dataError);
        dispatch({
          type: 'SET_ERROR',
          payload: 'Error loading data in new language'
        });
      } finally {
        dispatch({
          type: 'SET_LOADING',
          payload: false
        });
      }
    } catch (error) {
      console.error('Error changing language:', error);
      dispatch({
        type: 'SET_LOADING',
        payload: false
      });
      throw error;
    }
  };


  const performModpackAction = async (
    action: 'install' | 'update' | 'launch' | 'repair' | 'stop',
    modpackId: string
  ): Promise<boolean> => {
    const modpack = state.modpacksData?.modpacks.find((m: {
      id: string
    }) => m.id === modpackId);

    // For launch and stop actions, we don't need the modpack data from server
    // These actions work with locally installed modpacks
    if (!modpack && action !== 'launch' && action !== 'stop') {
      throw new Error('Modpack no encontrado');
    }

    // Verificar si el modpack requiere ZIP (no es vanilla/paper)
    // Only check for actions that need download
    if (modpack && !modpack.urlModpackZip && (action === 'install' || action === 'update' || action === 'repair')) {
      if (modpack.ip) {
        // Es un servidor vanilla/paper, solo se puede "conectar"
        throw new Error(`Este es un servidor ${modpack.modloader}. IP: ${modpack.ip}`);
      } else {
        // Check if it's a community modpack that might not have been fully configured
        console.error('Modpack missing urlModpackZip:', {
          id: modpack.id,
          name: modpack.name,
          category: modpack.category,
          modpack
        });
        if (modpack.category === 'community') {
          throw new Error('Este modpack de comunidad aún no tiene un archivo disponible para descarga. Por favor contacta al creador del modpack. Intenta refrescar el launcher (Cmd+R).');
        } else {
          throw new Error('Este modpack no tiene archivo disponible para descarga. Intenta refrescar el launcher (Cmd+R).');
        }
      }
    }

    // Check rate limit BEFORE changing state for install action
    if (action === 'install') {
      try {
        const rateLimitCheck = await launcherService.checkDownloadRateLimit(modpackId, state.userSettings.clientToken);

        if (!rateLimitCheck.allowed) {
          // Rate limit exceeded - show dialog and exit immediately without changing state
          setRateLimitDialog({
            isOpen: true,
            errorCode: rateLimitCheck.errorCode || (
              !rateLimitCheck.isAuthenticated ? 'LIMIT_EXCEEDED_ANON' :
                !rateLimitCheck.isDiscordMember ? 'LIMIT_EXCEEDED_AUTH' :
                  'LIMIT_EXCEEDED_MAX'
            ),
            limit: rateLimitCheck.limit,
            resetAt: rateLimitCheck.resetAt
          });
          return false; // Rate limit exceeded - don't proceed
        }
      } catch (error) {
        console.error('Error checking rate limit:', error);
        // Continue with installation even if rate limit check fails
      }
    }

    const actionStatus = action === 'launch' ? 'launching' :
      action === 'update' ? 'updating' :
        action === 'repair' ? 'repairing' :
          `${action}ing` as any;

    dispatch({
      type: 'SET_MODPACK_STATE',
      payload: {
        id: modpackId,
        state: {
          ...(state.modpackStates[modpackId] || createModpackState('not_installed')),
          status: actionStatus
        },
      },
    });

    try {
      const onProgress = (progress: ProgressInfo) => {
        // Customize messages for repair action
        let generalMessage = translateBackendMessage(progress.generalMessage || '');
        if (action === 'repair') {
          if (generalMessage.includes('Iniciando instalación') || generalMessage.includes('Starting installation')) {
            generalMessage = 'Iniciando reparación...';
          } else if (generalMessage.includes('Instalando') || generalMessage.includes('Installing')) {
            generalMessage = generalMessage.replace('Instalando', 'Reparando').replace('Installing', 'Repairing');
          } else if (generalMessage.includes('Descargando') || generalMessage.includes('Downloading')) {
            generalMessage = generalMessage.replace('Descargando', 'Revalidando').replace('Downloading', 'Revalidating');
          }
        }

        dispatch({
          type: 'UPDATE_MODPACK_PROGRESS',
          payload: {
            id: modpackId,
            progress: {
              percentage: progress.percentage,
              currentFile: progress.currentFile,
              downloadSpeed: progress.downloadSpeed,
              eta: progress.eta,
              step: progress.step,
              generalMessage: generalMessage,
              detailMessage: progress.detailMessage
            }
          },
        });
      };

      switch (action) {
        case 'install':
          // Start install in background - don't await so we can return immediately
          (async () => {
            try {
              const failedModsResult = await launcherService.installModpackWithFailedTracking(modpackId, onProgress);
              if (failedModsResult && failedModsResult.length > 0) {
                setFailedMods(failedModsResult);
                setShowFailedModsDialog(true);
              }
              // Update state after completion
              const newStatus = await launcherService.getModpackStatus(modpackId);
              dispatch({
                type: 'SET_MODPACK_STATE',
                payload: {
                  id: modpackId,
                  state: {
                    ...(state.modpackStates[modpackId] || createModpackState('not_installed')),
                    status: newStatus
                  },
                },
              });
            } catch (error: any) {
              console.error('Installation failed:', error);

              // Handle download corruption specifically
              const errorMessage = error.message || String(error);
              if (errorMessage.includes('Descarga corrupta') || errorMessage.includes('SHA256 mismatch')) {
                const modpackName = state.modpacksData?.modpacks.find(m => m.id === modpackId)?.name || modpackId;
                setIntegrityErrorDialog({
                  isOpen: true,
                  modpackId,
                  issues: [errorMessage],
                  modpackName,
                  title: t('errors.downloadCorrupt', 'Descarga Corrupta')
                });
                // Reset state to not_installed so user can retry cleanly
                dispatch({
                  type: 'SET_MODPACK_STATE',
                  payload: {
                    id: modpackId,
                    state: createModpackState('not_installed')
                  },
                });
                return;
              }

              dispatch({
                type: 'SET_MODPACK_STATE',
                payload: {
                  id: modpackId,
                  state: createModpackState('error', { error: errorMessage }),
                },
              });
            }
          })();
          return true; // Return immediately - install continues in background
          break;
        case 'update':
          const updateFailedModsResult = await launcherService.updateModpack(modpackId, onProgress);
          if (updateFailedModsResult && updateFailedModsResult.length > 0) {
            setFailedMods(updateFailedModsResult);
            setShowFailedModsDialog(true);
          }
          break;
        case 'launch': {
          // Check for mandatory username change
          if (state.userSettings.authMethod === 'offline' && state.userSettings.username === 'Player') {
            setShowUsernameDialog(true);
            // Reset state to installed so it doesn't get stuck in 'launching'
            dispatch({
              type: 'SET_MODPACK_STATE',
              payload: {
                id: modpackId,
                state: {
                  ...(state.modpackStates[modpackId] || createModpackState('installed')),
                  status: 'installed'
                },
              },
            });
            return false;
          }

          // -----------------------------------------------------------------
          // Setup listeners BEFORE invoking launch to avoid missing early events
          // -----------------------------------------------------------------
          const startEvent = `minecraft-started-${modpackId}`;
          const exitEvent = `minecraft-exited-${modpackId}`;

          let unlistenStart: (() => void) | null = null;
          let unlistenExit: (() => void) | null = null;
          let startTime: number | null = null;
          let activeStatusInterval: NodeJS.Timeout | null = null;

          try {
            unlistenStart = await listen(startEvent, () => {
              // Record start time
              startTime = Date.now();

              // Update state
              dispatch({
                type: 'SET_MODPACK_STATE',
                payload: {
                  id: modpackId,
                  state: {
                    ...state.modpackStates[modpackId],
                    status: 'running',
                  },
                },
              });

              // Update active status immediately
              launcherService.updateActiveStatus(modpackId);

              // Update active status every 2 minutes while playing
              activeStatusInterval = setInterval(() => {
                launcherService.updateActiveStatus(modpackId);
              }, 2 * 60 * 1000); // 2 minutes
            });

            unlistenExit = await listen(exitEvent, () => {
              // Clear active status interval
              if (activeStatusInterval) {
                clearInterval(activeStatusInterval);
                activeStatusInterval = null;
              }

              // Calculate and save playtime
              if (startTime) {
                const endTime = Date.now();
                const hoursPlayed = (endTime - startTime) / (1000 * 60 * 60); // Convert ms to hours
                launcherService.addPlaytime(modpackId, hoursPlayed);
                console.log(`Session ended. Playtime: ${hoursPlayed.toFixed(2)} hours`);
              }

              // Update state
              dispatch({
                type: 'SET_MODPACK_STATE',
                payload: {
                  id: modpackId,
                  state: {
                    ...state.modpackStates[modpackId],
                    status: 'installed',
                  },
                },
              });

              // Cleanup listeners once exited
              if (unlistenStart) unlistenStart();
              if (unlistenExit) unlistenExit();
            });
          } catch (err) {
            console.error('Error setting up runtime listeners', err);
          }

          // Now launch the modpack (event will be caught by listeners configured above)
          try {
            await launcherService.launchModpack(modpackId);
          } catch (err: any) {
            console.error(`Failed to launch modpack ${modpackId}:`, err);

            dispatch({
              type: 'SET_MODPACK_STATE', // Changed from SET_MODPACK_STATUS to SET_MODPACK_STATE
              payload: {
                id: modpackId,
                state: {
                  ...(state.modpackStates[modpackId] || createModpackState('installed')), // Ensure existing state is preserved
                  status: 'installed' // Reset status to installed or ready
                }
              },
            });

            // Handle integrity errors specifically
            if (err instanceof IntegrityError || err.name === 'IntegrityError') {
              const modpackName = state.modpacksData?.modpacks.find(m => m.id === modpackId)?.name || modpackId;
              setIntegrityErrorDialog({
                isOpen: true,
                modpackId,
                issues: err.issues,
                modpackName
              });
              return false; // Indicate failure
            }

            toast.error(t('launcher.launchFailed', {
              error: err.message
            }));
            return false; // Indicate failure
          }
          break;
        }
        case 'repair':
          const repairFailedModsResult = await launcherService.repairModpack(modpackId, onProgress);
          if (repairFailedModsResult && repairFailedModsResult.length > 0) {
            setFailedMods(repairFailedModsResult);
            setShowFailedModsDialog(true);
          }
          break;
        case 'stop':
          // Set stopping state immediately
          dispatch({
            type: 'SET_MODPACK_STATE',
            payload: {
              id: modpackId,
              state: {
                ...state.modpackStates[modpackId],
                status: 'stopping',
              },
            },
          });

          // Setup listeners for stopping/stopped events
          let unlistenStopping: (() => void) | null = null;
          let unlistenStopped: (() => void) | null = null;

          try {
            const stoppingEvent = `minecraft-stopping-${modpackId}`;
            const stoppedEvent = `minecraft-exited-${modpackId}`;

            unlistenStopping = await listen(stoppingEvent, () => {
              dispatch({
                type: 'SET_MODPACK_STATE',
                payload: {
                  id: modpackId,
                  state: {
                    ...state.modpackStates[modpackId],
                    status: 'stopping',
                  },
                },
              });
            });

            unlistenStopped = await listen(stoppedEvent, () => {
              dispatch({
                type: 'SET_MODPACK_STATE',
                payload: {
                  id: modpackId,
                  state: {
                    ...state.modpackStates[modpackId],
                    status: 'installed',
                  },
                },
              });

              // Cleanup listeners once stopped
              if (unlistenStopping) unlistenStopping();
              if (unlistenStopped) unlistenStopped();
            });
          } catch (err) {
            console.error('Error setting up stopping listeners', err);
          }

          await launcherService.stopInstance(modpackId);
          break;
      }

      // For installation / update / repair we check the final state.
      // For launch and stop, state is managed via runtime events (started / exited / stopped)
      if (action !== 'launch' && action !== 'stop') {
        const newStatus = await launcherService.getModpackStatus(modpackId);
        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: {
            id: modpackId,
            state: {
              ...(state.modpackStates[modpackId] || createModpackState('not_installed')),
              status: newStatus
            },
          },
        });

        // After update, clear cache and refresh modpack metadata to get latest version info
        if (action === 'update') {
          launcherService.clearCache();
          await refreshData();
        }
      }

      return true; // Action started successfully
    } catch (error) {
      console.error(`Error ${action}ing modpack:`, error);

      // Parse specific error messages for better user experience
      let userFriendlyError = t('errors.unknown');

      let errorMessage = '';
      if (error instanceof Error) {
        errorMessage = error.message.toLowerCase();
      } else if (typeof error === 'string') {
        errorMessage = error.toLowerCase();
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message).toLowerCase();
      } else {
        errorMessage = String(error).toLowerCase();
      }

      // Add context for repair actions
      const isRepairAction = action === 'repair';
      const repairPrefix = isRepairAction ? 'reparación' : (action === 'install' ? 'instalación' : action === 'update' ? 'actualización' : action);

      // Check for integrity errors (anti-cheat)
      if (errorMessage.includes('verificación de integridad') || errorMessage.includes('modificaciones no autorizadas')) {
        // Parse issues from error message
        const issuesMatch = errorMessage.match(/• ([^\n]+)/g);
        const issues = issuesMatch ? issuesMatch.map(i => i.replace('• ', '')) : ['Archivo modificado o no autorizado'];

        setIntegrityErrorDialog({
          isOpen: true,
          modpackId,
          issues: issues.map(i => i.charAt(0).toUpperCase() + i.slice(1))
        });

        // Reset state to installed (not error)
        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: {
            id: modpackId,
            state: {
              ...(state.modpackStates[modpackId] || createModpackState('installed')),
              status: 'installed'
            },
          },
        });
        return false;
      }

      // Check for download corruption errors
      if (errorMessage.includes('descarga corrupta') || errorMessage.includes('sha256 no coincide')) {
        setIntegrityErrorDialog({
          isOpen: true,
          modpackId,
          issues: ['La descarga del modpack está corrupta. Vuelve a intentar la instalación.']
        });

        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: {
            id: modpackId,
            state: {
              ...(state.modpackStates[modpackId] || createModpackState('not_installed')),
              status: 'not_installed'
            },
          },
        });
        return false;
      }

      if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
        userFriendlyError = `Error durante la ${repairPrefix}: Límite de solicitudes alcanzado. Crea una cuenta de LuminaKraft para aumentar tus límites.`;
      } else if (errorMessage.includes('failed to extract zip file') || errorMessage.includes('no such file or directory')) {
        userFriendlyError = `Error durante la ${repairPrefix}: No se pudo extraer el archivo ZIP`;
      } else if (errorMessage.includes('java') || errorMessage.includes('No such file or directory') || errorMessage.includes('exec format error')) {
        userFriendlyError = `Error durante la ${repairPrefix}: Java no válido o no encontrado`;
      } else if (errorMessage.includes('zip file not found') || errorMessage.includes('file not found')) {
        userFriendlyError = `Error durante la ${repairPrefix}: Archivo ZIP no encontrado`;
      } else if (errorMessage.includes('permission denied')) {
        userFriendlyError = `Error durante la ${repairPrefix}: Permisos insuficientes`;
      } else if (errorMessage.includes('no space left') || errorMessage.includes('disk space')) {
        userFriendlyError = `Error durante la ${repairPrefix}: Espacio en disco insuficiente`;
      } else if (errorMessage.includes('corrupted') || errorMessage.includes('invalid zip')) {
        userFriendlyError = `Error durante la ${repairPrefix}: Archivo corrupto o inválido`;
      } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
        userFriendlyError = `Error durante la ${repairPrefix}: Problema de conexión de red`;
      } else if (errorMessage.includes('failed to download')) {
        userFriendlyError = `Error durante la ${repairPrefix}: Fallo en la descarga`;
      } else if (errorMessage.includes('authentication failed (401)') ||
        errorMessage.includes('not authorized') ||
        errorMessage.includes('curseforge api authentication failed')) {
        userFriendlyError = `Error durante la ${repairPrefix}: Autenticación fallida con CurseForge`;
      } else if (errorMessage.includes('access forbidden (403)') ||
        errorMessage.includes('curseforge api access forbidden')) {
        userFriendlyError = `Error durante la ${repairPrefix}: Acceso prohibido a CurseForge`;
      } else if (errorMessage.includes('curseforge api') || errorMessage.includes('failed to retrieve any mod file information')) {
        userFriendlyError = `Error durante la ${repairPrefix}: Problema con la API de CurseForge`;
      } else {
        // Use the original error message as fallback, but add context for repair
        let originalError = '';
        if (error instanceof Error) {
          originalError = error.message;
        } else if (typeof error === 'string') {
          originalError = error;
        } else if (error && typeof error === 'object' && 'message' in error) {
          originalError = String(error.message);
        } else {
          originalError = String(error);
        }

        // If the error already mentions repair context, keep it as is
        if (originalError.toLowerCase().includes('reparación') ||
          originalError.toLowerCase().includes('repair')) {
          userFriendlyError = originalError;
        } else {
          userFriendlyError = `Error durante la ${repairPrefix}: ${originalError}`;
        }
      }

      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          id: modpackId,
          state: {
            ...(state.modpackStates[modpackId] || createModpackState('not_installed')),
            status: 'error',
            error: userFriendlyError
          },
        },
      });
      throw error;
    }
  };

  const installModpack = (id: string) => performModpackAction('install', id);
  const updateModpack = (id: string) => performModpackAction('update', id);
  const launchModpack = (id: string) => performModpackAction('launch', id);
  const repairModpack = (id: string) => performModpackAction('repair', id);

  const removeModpack = async (id: string) => {
    try {
      console.log('🗑️ Removing instance:', id);

      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          id,
          state: {
            ...(state.modpackStates[id] || createModpackState('not_installed')),
            status: 'installing' // Usar installing como estado temporal mientras se elimina
          },
        },
      });

      console.log('📡 Calling removeModpack service...');
      await launcherService.removeModpack(id);

      console.log('✅ Instance removed successfully, updating state');
      // After successful removal, change state to not_installed
      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          id,
          state: createModpackState('not_installed'),
        },
      });
    } catch (error) {
      console.error('❌ Error removing instance:', error);
      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          id,
          state: {
            ...(state.modpackStates[id] || createModpackState('not_installed')),
            status: 'error',
            error: error instanceof Error ? error.message : 'Error al remover la instancia'
          },
        },
      });
      throw error;
    }
  };

  // Helper function to translate backend messages
  const translateBackendMessage = (message: string): string => {
    if (!message) return message;

    // Handle translation keys from backend
    if (message.startsWith('progress.')) {
      // Handle complex messages with parameters
      if (message.includes('|')) {
        const parts = message.split('|');
        const key = parts[0];

        if (key === 'progress.downloadingModpack') {
          // Format: "progress.downloadingModpack|current/total"
          const currentTotal = parts[1];
          return t('progress.downloadingModpack', {
            current: currentTotal.split('/')[0],
            total: currentTotal.split('/')[1]
          });
        }

        if (key === 'progress.downloadingMinecraft') {
          // Format: "progress.downloadingMinecraft|component|progress"
          const component = parts[1];
          const progressPart = parts[2];

          // Use component name to get specific translation
          const translationKey = component === 'Assets' ? 'progress.downloadingAssets' :
            component === 'Java' ? 'progress.downloadingJava' :
              component === 'Librerías' ? 'progress.downloadingLibraries' :
                component === 'Nativos' ? 'progress.downloadingNatives' :
                  'progress.downloadingMinecraftFiles';

          return `${t(translationKey)} (${progressPart})`;
        }

        if (key === 'progress.downloadingMinecraftFile') {
          // Format: "progress.downloadingMinecraftFile|fileName"
          const fileName = parts[1];
          return t('progress.downloadingMinecraftFile', {
            fileName
          });
        }

        if (key === 'progress.installingComponent') {
          // Format: "progress.installingComponent|component"
          const component = parts[1];
          return t('progress.installingComponent', {
            component
          });
        }

        if (key === 'progress.curseforgeApiError') {
          // Format: "progress.curseforgeApiError|error message"
          const error = parts[1];
          return t('progress.curseforgeApiError', {
            error
          });
        }
      }

      // Simple translation key
      return t(message);
    }

    return message;
  };

  // Check if there are any active operations
  const hasActiveOperations = Object.values(state.modpackStates).some(
    (modpackState: ModpackState) => ['installing', 'updating', 'repairing', 'launching', 'stopping'].includes(modpackState.status)
  );

  const installModpackFromZip = async (filePath: string) => {
    try {
      // Read the ZIP file from the provided path
      const {
        readFile
      } = await import('@tauri-apps/plugin-fs');
      const zipBuffer = await readFile(filePath);

      // Extract manifest to create a temporary modpack object
      const zip = await JSZip.loadAsync(zipBuffer);
      const manifestFile = zip.file('manifest.json');

      if (!manifestFile) {
        throw new Error('No manifest.json found in ZIP file');
      }

      const manifestText = await manifestFile.async('text');
      const manifest = JSON.parse(manifestText);

      // Create a safe ID for event names (alphanumeric, -, /, :, _ only)
      const fileName = filePath.split('/').pop() || 'modpack';
      const safeName = (manifest.name || fileName.replace('.zip', ''))
        .replace(/[^a-zA-Z0-9\-/:_]/g, '_')
        .replace(/_{2,}/g, '_')
        .toLowerCase();

      // Save modpack data to localStorage for MyModpacksPage to use
      // This allows showing the real modpack name instead of "Importing modpack..."
      try {
        const modpackData = {
          id: safeName,
          name: manifest.name || fileName.replace('.zip', ''),
          version: manifest.version || '',
          minecraftVersion: manifest.minecraft?.version || '',
          modloader: manifest.minecraft?.modLoaders?.[0]?.id?.split('-')[0] || 'forge',
          modloaderVersion: manifest.minecraft?.modLoaders?.[0]?.id?.split('-')[1] || '',
          category: 'community'
        };
        localStorage.setItem(`installing_modpack_${safeName}`, JSON.stringify(modpackData));
      } catch (e) {
        console.warn('Failed to save importing modpack data:', e);
      }

      // Set initial installing state
      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          id: safeName,
          state: createModpackState('installing', {
            progress: {
              percentage: 0,
              currentFile: 'Preparing import...',
              downloadSpeed: '',
              eta: '',
              step: 'initializing',
              generalMessage: `Importing ${manifest.name || fileName.replace('.zip', '')}...`,
              detailMessage: ''
            }
          })
        }
      });

      // Create progress callback
      const onProgress = (progress: ProgressInfo) => {
        const generalMessage = translateBackendMessage(progress.generalMessage || '');

        dispatch({
          type: 'UPDATE_MODPACK_PROGRESS',
          payload: {
            id: safeName,
            progress: {
              percentage: progress.percentage,
              currentFile: progress.currentFile,
              downloadSpeed: progress.downloadSpeed,
              eta: progress.eta,
              step: progress.step,
              generalMessage: generalMessage,
              detailMessage: progress.detailMessage
            }
          },
        });
      };

      // Install the modpack
      await launcherService.installModpackFromZip(filePath, onProgress);

      // Update state to installed
      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          id: safeName,
          state: createModpackState('installed')
        }
      });

      // Clean up localStorage used for import name display
      try {
        localStorage.removeItem(`installing_modpack_${safeName}`);
      } catch (e) {
        // Ignore cleanup errors
      }

      // Reload instance states to reflect the new installation
      await loadModpackStates();
    } catch (error) {
      console.error('Error installing modpack from ZIP:', error);
      throw error;
    }
  };

  const contextValue: LauncherContextType = {
    modpacksData: state.modpacksData,
    modpackStates: state.modpackStates,
    userSettings: state.userSettings,
    currentLanguage: state.currentLanguage,
    isLoading: state.isLoading,
    error: state.error,
    isAuthenticating,
    hasActiveOperations,
    setIsAuthenticating,
    updateUserSettings,
    refreshData,
    installModpack,
    installModpackFromZip,
    updateModpack,
    launchModpack,
    repairModpack,
    stopInstance: (id: string) => performModpackAction('stop', id), // Added stopInstance
    changeLanguage,
    removeModpack,
    showUsernameDialog,
    setShowUsernameDialog,
    isOnline: state.isOnline,
  };

  // Update ref with refreshData so the cache-clear listener can call it
  useEffect(() => {
    refreshDataRef.current = refreshData;
  }, [refreshData]);

  return (
    <LauncherContext.Provider value={contextValue}>
      {children}
      <FailedModsDialog
        isOpen={showFailedModsDialog}
        onClose={() => setShowFailedModsDialog(false)}
        failedMods={failedMods}
      />
      <RateLimitDialog
        isOpen={rateLimitDialog.isOpen}
        onClose={() => setRateLimitDialog(prev => ({ ...prev, isOpen: false }))}
        errorCode={rateLimitDialog.errorCode}
        limit={rateLimitDialog.limit}
        resetAt={rateLimitDialog.resetAt}
        onLogin={async () => {
          setRateLimitDialog(prev => ({ ...prev, isOpen: false }));
          setIsAuthenticating(true);
          try {
            await AuthService.getInstance().signInToLuminaKraftAccount();
          } catch (error) {
            console.error('Login failed:', error);
            setIsAuthenticating(false);
          }
        }}
        onJoinDiscord={async () => {
          setRateLimitDialog(prev => ({ ...prev, isOpen: false }));
          // Navigate to settings or trigger link
          // For now, just open settings page if possible, or trigger link
          // Actually, linking discord usually happens in settings.
          // We can emit an event or use a global navigation if available.
          // For now, let's just log.
          console.log('Link Discord requested');
        }}
      />
      <IntegrityErrorModal
        isOpen={integrityErrorDialog.isOpen}
        onClose={() => setIntegrityErrorDialog(prev => ({ ...prev, isOpen: false }))}
        onRepair={() => {
          if (integrityErrorDialog.modpackId) {
            const modpackId = integrityErrorDialog.modpackId;
            setIntegrityErrorDialog(prev => ({ ...prev, isOpen: false }));
            repairModpack(modpackId);
          }
        }}
        issues={integrityErrorDialog.issues || []}
        modpackName={integrityErrorDialog.modpackName}
        title={integrityErrorDialog.title}
      />
    </LauncherContext.Provider>
  );
}

export function useLauncher() {
  const context = useContext(LauncherContext);
  if (context === undefined) {
    throw new Error('useLauncher must be used within a LauncherProvider');
  }
  return context;
} 