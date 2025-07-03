import { createContext, useContext, useReducer, useEffect, ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { 
  LauncherData, 
  ModpackState, 
  UserSettings, 
  Translations, 
  ModpackFeatures,
  ProgressInfo,
  FailedMod,
  ModpackStatus
} from '../types/launcher';
import LauncherService from '../services/launcherService';
import { FailedModsDialog } from '../components/FailedModsDialog';
import AuthService from '../services/authService';

interface LauncherContextType {
  launcherData: LauncherData | null;
  modpackStates: { [id: string]: ModpackState };
  userSettings: UserSettings;
  translations: Translations | null;
  currentLanguage: string;
  isLoading: boolean;
  error: string | null;
  updateUserSettings: (_settings: Partial<UserSettings>) => void;
  refreshData: () => Promise<void>;
  installModpack: (_id: string) => Promise<void>;
  updateModpack: (_id: string) => Promise<void>;
  launchModpack: (_id: string) => Promise<void>;
  repairModpack: (_id: string) => Promise<void>;
  getModpackTranslations: (_id: string) => any;
  getModpackFeatures: (_id: string) => Promise<ModpackFeatures | null>;
  changeLanguage: (_language: string) => Promise<void>;
  removeModpack: (_id: string) => Promise<void>;
}

type LauncherAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LAUNCHER_DATA'; payload: LauncherData }
  | { type: 'SET_TRANSLATIONS'; payload: Translations | null }
  | { type: 'SET_LANGUAGE'; payload: string }
  | { type: 'SET_USER_SETTINGS'; payload: UserSettings }
  | { type: 'SET_MODPACK_STATE'; payload: { id: string; state: ModpackState } }
  | { type: 'UPDATE_MODPACK_PROGRESS'; payload: { id: string; progress: ProgressInfo } };

interface LauncherState {
  launcherData: LauncherData | null;
  modpackStates: { [id: string]: ModpackState };
  userSettings: UserSettings;
  translations: Translations | null;
  currentLanguage: string;
  isLoading: boolean;
  error: string | null;
}

const defaultSettings: UserSettings = {
  username: 'Player',
  allocatedRam: 4096,
  launcherDataUrl: 'https://api.luminakraft.com/v1/launcher_data.json',
  language: 'es',
  authMethod: 'offline',
  enablePrereleases: false,
  enableAnimations: true,
};

const initialState: LauncherState = {
  launcherData: null,
  modpackStates: {},
  userSettings: defaultSettings,
  translations: null,
  currentLanguage: 'es',
  isLoading: false,
  error: null,
};

function launcherReducer(state: LauncherState, action: LauncherAction): LauncherState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'SET_LAUNCHER_DATA':
      return { ...state, launcherData: action.payload, isLoading: false };
    case 'SET_TRANSLATIONS':
      return { ...state, translations: action.payload };
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
      
      // Agregar nueva entrada al historial (mantener últimas 20 entradas para mayor estabilidad)
      progressHistory = [...progressHistory.slice(-19), {
        percentage: newProgress.percentage,
        timestamp: currentTime
      }];
      
      // Calcular ETA solo si tenemos suficientes datos y progreso > 10% y < 95%
      if (progressHistory.length >= 5 && newProgress.percentage > 10 && newProgress.percentage < 95) {
        // Usar ventana más grande para mayor estabilidad - últimos 10 puntos si están disponibles
        const windowSize = Math.min(10, progressHistory.length);
        const windowStart = progressHistory.length - windowSize;
        const window = progressHistory.slice(windowStart);
        
        const oldest = window[0];
        const newest = window[window.length - 1];
        
        const timeElapsed = (newest.timestamp - oldest.timestamp) / 1000; // segundos
        const progressMade = newest.percentage - oldest.percentage;
        
        if (progressMade > 0.5 && timeElapsed > 2) { // Más restrictivo para evitar saltos
          const remainingProgress = 100 - newProgress.percentage;
          let estimatedTimeRemaining = (remainingProgress * timeElapsed) / progressMade;
          
          // Suavizar el ETA usando promedio móvil con el ETA anterior
          if (currentState?.lastEtaSeconds) {
            const weight = 0.7; // 70% del valor anterior, 30% del nuevo (más suave)
            estimatedTimeRemaining = (currentState.lastEtaSeconds * weight) + (estimatedTimeRemaining * (1 - weight));
          }
          
          // Solo mostrar si es razonable (menos de 30 minutos)
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
      
      // Mantener el último mensaje general y ETA si el nuevo no tiene uno (evitar saltos visuales)
      const finalProgress = {
        ...newProgress,
        percentage: finalPercentage,
        eta: eta || currentProgress?.eta || '', // Preservar ETA anterior si no hay uno nuevo
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
  const launcherService = LauncherService.getInstance();
  const { i18n, t } = useTranslation();

  // Cargar configuración del usuario al inicializar
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const settings = launcherService.getUserSettings();
        dispatch({ type: 'SET_USER_SETTINGS', payload: settings });
        dispatch({ type: 'SET_LANGUAGE', payload: settings.language });
        
        // Sincronizar el idioma con react-i18next
        await i18n.changeLanguage(settings.language);
        
        // Cargar datos iniciales
        await refreshData();
      } catch (error) {
        console.error('Error initializing app:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Error al inicializar la aplicación' });
      }
    };

    initializeApp();
  }, []);

  // Cargar estados de modpacks cuando se cargan los datos
  useEffect(() => {
    if (state.launcherData) {
      loadModpackStates().catch(error => {
        console.error('Error loading modpack states:', error);
      });
    }
  }, [state.launcherData]);

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

  const refreshData = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // Cargar datos del launcher y traducciones en paralelo
      const currentLang = launcherService.getUserSettings().language;
      const [launcherData, translations] = await Promise.all([
        launcherService.fetchLauncherData(),
        launcherService.getTranslations(currentLang)
      ]);

      dispatch({ type: 'SET_LAUNCHER_DATA', payload: launcherData });
      dispatch({ type: 'SET_TRANSLATIONS', payload: translations });
    } catch (error) {
      console.error('Error loading launcher data:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Error al cargar los datos del launcher' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const loadModpackStates = async () => {
    if (!state.launcherData) return;

    const currentLang = launcherService.getUserSettings().language;
    
    for (const modpack of state.launcherData.modpacks) {
      try {
        const status = await launcherService.getModpackStatus(modpack.id);
        
        // Cargar traducciones y características del modpack
        const [translations, features] = await Promise.all([
          getModpackTranslations(modpack.id),
          launcherService.getModpackFeatures(modpack.id, currentLang)
        ]);

        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: {
            id: modpack.id,
            state: createModpackState(status, {
              translations: translations || undefined,
              features: features?.features || []
            }),
          },
        });
      } catch (error) {
        console.error(`Error loading state for modpack ${modpack.id}:`, error);
        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: {
            id: modpack.id,
            state: createModpackState('error', { error: 'Error al cargar el estado' }),
          },
        });
      }
    }
  };

  const updateUserSettings = (settings: Partial<UserSettings>) => {
    const newSettings = { ...state.userSettings, ...settings };
    launcherService.saveUserSettings(settings);
    dispatch({ type: 'SET_USER_SETTINGS', payload: newSettings });
  };

  const changeLanguage = async (language: string) => {
    try {
      // Cambiar el idioma en react-i18next
      await i18n.changeLanguage(language);
      
      // Actualizar el estado local
      dispatch({ type: 'SET_LANGUAGE', payload: language });
      updateUserSettings({ language });
      
      // Limpiar caché completamente para forzar recarga de todos los datos
      launcherService.clearCache();
      
      // Activar estado de carga mientras se recargan los datos
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      try {
        // Recargar datos del launcher y traducciones del servidor
        const [launcherData, translations] = await Promise.all([
          launcherService.fetchLauncherData(),
          launcherService.getTranslations(language)
        ]);

        dispatch({ type: 'SET_LAUNCHER_DATA', payload: launcherData });
        dispatch({ type: 'SET_TRANSLATIONS', payload: translations });
        
        // Recargar estados y características de todos los modpacks en el nuevo idioma
        if (launcherData) {
          for (const modpack of launcherData.modpacks) {
            try {
              const [status, modpackTranslations, features] = await Promise.all([
                launcherService.getModpackStatus(modpack.id),
                getModpackTranslations(modpack.id),
                launcherService.getModpackFeatures(modpack.id, language)
              ]);

              dispatch({
                type: 'SET_MODPACK_STATE',
                payload: {
                  id: modpack.id,
                  state: createModpackState(status, {
                    translations: modpackTranslations || undefined,
                    features: features?.features || []
                  }),
                },
              });
            } catch (modpackError) {
              console.warn(`Error loading data for modpack ${modpack.id}:`, modpackError);
              // En caso de error, mantener un estado básico
              dispatch({
                type: 'SET_MODPACK_STATE',
                payload: {
                  id: modpack.id,
                  state: createModpackState('error', { error: 'Error al cargar datos del modpack' }),
                },
              });
            }
          }
        }
      } catch (dataError) {
        console.error('Error reloading data after language change:', dataError);
        dispatch({ type: 'SET_ERROR', payload: 'Error al cargar datos en el nuevo idioma' });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    } catch (error) {
      console.error('Error changing language:', error);
      dispatch({ type: 'SET_LOADING', payload: false });
      throw error;
    }
  };

  const getModpackTranslations = (modpackId: string) => {
    return state.translations?.modpacks[modpackId] || null;
  };

  const getModpackFeatures = async (modpackId: string) => {
    return launcherService.getModpackFeatures(modpackId, state.currentLanguage);
  };

  const performModpackAction = async (
    action: 'install' | 'update' | 'launch' | 'repair',
    modpackId: string
  ) => {
    const modpack = state.launcherData?.modpacks.find(m => m.id === modpackId);
    if (!modpack) {
      throw new Error('Modpack no encontrado');
    }

    // Verificar si el modpack requiere ZIP (no es vanilla/paper)
    if (!modpack.urlModpackZip && (action === 'install' || action === 'update' || action === 'repair')) {
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
              generalMessage: progress.generalMessage,
              detailMessage: progress.detailMessage
            }
          },
        });
      };

      switch (action) {
        case 'install':
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
        case 'launch':
          await launcherService.launchModpack(modpackId);
          break;
        case 'repair':
          await launcherService.repairModpack(modpackId, onProgress);
          break;
      }

      // Actualizar estado después de la acción exitosa
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
    } catch (error) {
      console.error(`Error ${action}ing modpack:`, error);
      
      // Parse specific error messages for better user experience
      let userFriendlyError = 'Error desconocido';
      
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        
        if (errorMessage.includes('failed to extract zip file') || errorMessage.includes('no such file or directory')) {
          userFriendlyError = t('errors.zipExtractionFailed');
        } else if (errorMessage.includes('java') || errorMessage.includes('No such file or directory') || errorMessage.includes('exec format error')) {
          userFriendlyError = t('settings.invalidJava');
        } else if (errorMessage.includes('zip file not found') || errorMessage.includes('file not found')) {
          userFriendlyError = t('errors.zipFileNotFound');
        } else if (errorMessage.includes('permission denied')) {
          userFriendlyError = t('errors.permissionDenied');
        } else if (errorMessage.includes('no space left') || errorMessage.includes('disk space')) {
          userFriendlyError = t('errors.diskSpaceFull');
        } else if (errorMessage.includes('corrupted') || errorMessage.includes('invalid zip')) {
          userFriendlyError = t('errors.corruptedFile');
        } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
          userFriendlyError = t('errors.networkError');
        } else if (errorMessage.includes('failed to download')) {
          userFriendlyError = t('errors.downloadFailed');
        } else {
          userFriendlyError = error.message;
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
      console.log('🗑️ Removing modpack:', id);
      
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
      
      console.log('✅ Modpack removed successfully, updating state');
      // Después de eliminar exitosamente, cambiar el estado a not_installed
      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          id,
          state: createModpackState('not_installed'),
        },
      });
    } catch (error) {
      console.error('❌ Error removing modpack:', error);
      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          id,
          state: { 
            ...(state.modpackStates[id] || createModpackState('not_installed')),
            status: 'error', 
            error: error instanceof Error ? error.message : 'Error al remover el modpack'
          },
        },
      });
      throw error;
    }
  };

  const contextValue: LauncherContextType = {
    launcherData: state.launcherData,
    modpackStates: state.modpackStates,
    userSettings: state.userSettings,
    translations: state.translations,
    currentLanguage: state.currentLanguage,
    isLoading: state.isLoading,
    error: state.error,
    updateUserSettings,
    refreshData,
    installModpack,
    updateModpack,
    launchModpack,
    repairModpack,
    getModpackTranslations,
    getModpackFeatures,
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