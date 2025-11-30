import { createContext, useContext, useReducer, useEffect, ReactNode, useState } from 'react';
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

// Define LauncherState here since it is missing from types
interface LauncherState {
  modpacksData: ModpacksData | null;
  modpackStates: { [id: string]: ModpackState };
  userSettings: UserSettings;
  currentLanguage: string;
  isLoading: boolean;
  error: string | null;
}
import LauncherService from '../services/launcherService';
import { FailedModsDialog } from '../components/FailedModsDialog';
import AuthService from '../services/authService';

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
  installModpack: (_id: string) => Promise<void>;
  installModpackFromZip: (_file: File) => Promise<void>;
  updateModpack: (_id: string) => Promise<void>;
  launchModpack: (_id: string) => Promise<void>;
  repairModpack: (_id: string) => Promise<void>;
  stopInstance: (_id: string) => Promise<void>;
  changeLanguage: (_language: string) => Promise<void>;
  removeModpack: (_id: string) => Promise<void>;
}

type LauncherAction = 
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_MODPACKS_DATA'; payload: ModpacksData }
  | { type: 'SET_LANGUAGE'; payload: string }
  | { type: 'SET_USER_SETTINGS'; payload: UserSettings }
  | { type: 'SET_MODPACK_STATE'; payload: { id: string; state: ModpackState } }
  | { type: 'UPDATE_MODPACK_PROGRESS'; payload: { id: string; progress: ProgressInfo } };

const defaultSettings: UserSettings = {
  username: 'Player',
  allocatedRam: 4096,
  language: 'en',
  authMethod: 'offline',
  enablePrereleases: false,
  enableAnimations: true,
};

const initialState: LauncherState = {
  modpacksData: null,
  modpackStates: {},
  userSettings: defaultSettings,
  currentLanguage: 'en',
  isLoading: false,
  error: null,
};

function launcherReducer(state: LauncherState, action: LauncherAction): LauncherState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
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
          const ModpackManagementService = (await import('../services/modpackManagementService')).ModpackManagementService;
          ModpackManagementService.getInstance().setMicrosoftAccount(settings.microsoftAccount);
        }

        // Sync Discord roles if needed (last sync > 6 hours ago)
        const shouldSyncDiscord = await authService.shouldSyncDiscordRoles();
        if (shouldSyncDiscord) {
          console.log('🔄 Syncing Discord roles on app launch...');
          await authService.syncDiscordRoles();
        }

        // Load initial data
        await refreshData();
      } catch (error) {
        console.error('Error initializing app:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Error initializing application' });
      }
    };

    initializeApp();
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
        const { listen } = await import('@tauri-apps/api/event');
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

  const refreshData = async (retryCount = 0) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // Load modpacks data
      const modpacksData = await launcherService.fetchModpacksData();
      dispatch({ type: 'SET_MODPACKS_DATA', payload: modpacksData });
      dispatch({ type: 'SET_LOADING', payload: false });
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
      dispatch({ type: 'SET_ERROR', payload: 'Error loading modpacks data' });
    } finally {
      if (retryCount >= 2) {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
  };

  const loadModpackStates = async () => {
    if (!state.modpacksData) return;

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
            state: createModpackState('error', { error: 'Error loading state' }),
          },
        });
      }
    }
  };

  const updateUserSettings = async (settings: Partial<UserSettings>) => {
    const newSettings = { ...state.userSettings, ...settings };
    launcherService.saveUserSettings(settings);
    dispatch({ type: 'SET_USER_SETTINGS', payload: newSettings });

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
      dispatch({ type: 'SET_LANGUAGE', payload: language });
      updateUserSettings({ language });
      
      // Clear cache completely to force reload of all data
      launcherService.clearCache();
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      try {
        const modpacksData = await launcherService.fetchModpacksData();
        dispatch({ type: 'SET_MODPACKS_DATA', payload: modpacksData });
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
                  state: createModpackState('error', { error: 'Error loading modpack data' }),
                },
              });
            }
          }
        }
      } catch (dataError) {
        console.error('Error reloading data after language change:', dataError);
        dispatch({ type: 'SET_ERROR', payload: 'Error loading data in new language' });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    } catch (error) {
      console.error('Error changing language:', error);
      dispatch({ type: 'SET_LOADING', payload: false });
      throw error;
    }
  };


  const performModpackAction = async (
    action: 'install' | 'update' | 'launch' | 'repair' | 'stop',
    modpackId: string
  ) => {
  const modpack = state.modpacksData?.modpacks.find((m: { id: string }) => m.id === modpackId);

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
        throw new Error('Este servidor no tiene modpack disponible para descarga');
      }
    }

    const actionStatus = action === 'launch' ? 'launching' : action === 'update' ? 'updating' : `${action}ing` as any;

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
          // Check rate limit before installing
          try {
            const rateLimitCheck = await launcherService.checkDownloadRateLimit(modpackId);

            if (!rateLimitCheck.allowed) {
              // Rate limit exceeded
              dispatch({
                type: 'SET_MODPACK_STATE',
                payload: {
                  id: modpackId,
                  state: createModpackState('error', {
                    error: rateLimitCheck.message
                  }),
                },
              });
              return;
            }
          } catch (error) {
            console.error('Error checking rate limit:', error);
            // Continue with installation even if rate limit check fails
          }

          const failedModsResult = await launcherService.installModpackWithFailedTracking(modpackId, onProgress);
          if (failedModsResult && failedModsResult.length > 0) {
            setFailedMods(failedModsResult);
            setShowFailedModsDialog(true);
          }
          break;
        case 'update':
          const updateFailedModsResult = await launcherService.updateModpack(modpackId, onProgress);
          if (updateFailedModsResult && updateFailedModsResult.length > 0) {
            setFailedMods(updateFailedModsResult);
            setShowFailedModsDialog(true);
          }
          break;
        case 'launch': {
          // -----------------------------------------------------------------
          // Setup listeners BEFORE invoking launch to avoid missing early events
          // -----------------------------------------------------------------
          const { listen } = await import('@tauri-apps/api/event');

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
          await launcherService.launchModpack(modpackId);
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
            const { listen } = await import('@tauri-apps/api/event');
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
      }
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
      
      if (errorMessage.includes('failed to extract zip file') || errorMessage.includes('no such file or directory')) {
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
          return t('progress.downloadingMinecraftFile', { fileName });
        }
        
        if (key === 'progress.installingComponent') {
          // Format: "progress.installingComponent|component"
          const component = parts[1];
          return t('progress.installingComponent', { component });
        }
        
        if (key === 'progress.curseforgeApiError') {
          // Format: "progress.curseforgeApiError|error message"
          const error = parts[1];
          return t('progress.curseforgeApiError', { error });
        }
      }
      
      // Simple translation key
      return t(message);
    }
    
    return message;
  };

  // Check if there are any active operations
  const hasActiveOperations = Object.values(state.modpackStates).some(
    (modpackState: ModpackState) => ['installing', 'updating', 'launching', 'stopping'].includes(modpackState.status)
  );

  const installModpackFromZip = async (file: File) => {
    try {
      // Extract manifest to create a temporary modpack object
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file);
      const manifestFile = zip.file('manifest.json');

      if (!manifestFile) {
        throw new Error('No manifest.json found in ZIP file');
      }

      const manifestText = await manifestFile.async('text');
      const manifest = JSON.parse(manifestText);

      // Create a safe ID for event names (alphanumeric, -, /, :, _ only)
      const safeName = (manifest.name || file.name.replace('.zip', ''))
        .replace(/[^a-zA-Z0-9\-/:_]/g, '_')
        .replace(/_{2,}/g, '_')
        .toLowerCase();

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
              generalMessage: 'Preparing import...',
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
      await launcherService.installModpackFromZip(file, onProgress);

      // Update state to installed
      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          id: safeName,
          state: createModpackState('installed')
        }
      });

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
  };

  return (
    <LauncherContext.Provider value={contextValue}>
      {children}
      <FailedModsDialog
        isOpen={showFailedModsDialog}
        onClose={() => setShowFailedModsDialog(false)}
        failedMods={failedMods}
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