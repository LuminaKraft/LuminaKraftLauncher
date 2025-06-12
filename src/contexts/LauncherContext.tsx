import { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { LauncherData, ModpackState, UserSettings, Translations, ModpackFeatures } from '../types/launcher';
import LauncherService from '../services/launcherService';

interface LauncherContextType {
  launcherData: LauncherData | null;
  modpackStates: { [id: string]: ModpackState };
  userSettings: UserSettings;
  translations: Translations | null;
  currentLanguage: string;
  isLoading: boolean;
  error: string | null;
  updateUserSettings: (settings: Partial<UserSettings>) => void;
  refreshData: () => Promise<void>;
  installModpack: (id: string) => Promise<void>;
  updateModpack: (id: string) => Promise<void>;
  launchModpack: (id: string) => Promise<void>;
  repairModpack: (id: string) => Promise<void>;
  getModpackTranslations: (id: string) => any;
  getModpackFeatures: (id: string) => Promise<ModpackFeatures | null>;
  changeLanguage: (language: string) => Promise<void>;
}

type LauncherAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LAUNCHER_DATA'; payload: LauncherData }
  | { type: 'SET_TRANSLATIONS'; payload: Translations | null }
  | { type: 'SET_LANGUAGE'; payload: string }
  | { type: 'SET_USER_SETTINGS'; payload: UserSettings }
  | { type: 'SET_MODPACK_STATE'; payload: { id: string; state: ModpackState } }
  | { type: 'UPDATE_MODPACK_PROGRESS'; payload: { id: string; progress: number } };

interface LauncherState {
  launcherData: LauncherData | null;
  modpackStates: { [id: string]: ModpackState };
  userSettings: UserSettings;
  translations: Translations | null;
  currentLanguage: string;
  isLoading: boolean;
  error: string | null;
}

const initialState: LauncherState = {
  launcherData: null,
  modpackStates: {},
  userSettings: {
    username: 'Player',
    allocatedRam: 4,
    launcherDataUrl: 'https://api.luminakraft.com/v1/launcher_data.json',
    language: 'es'
  },
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
      return {
        ...state,
        modpackStates: {
          ...state.modpackStates,
          [action.payload.id]: {
            ...state.modpackStates[action.payload.id],
            progress: {
              downloaded: 0,
              total: 100,
              percentage: action.payload.progress,
              speed: 0,
            },
          },
        },
      };
    default:
      return state;
  }
}

const LauncherContext = createContext<LauncherContextType | undefined>(undefined);

export function LauncherProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(launcherReducer, initialState);
  const launcherService = LauncherService.getInstance();
  const { i18n } = useTranslation();

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
            state: {
              status,
              translations: translations || undefined,
              features: features?.features || []
            },
          },
        });
      } catch (error) {
        console.error(`Error loading state for modpack ${modpack.id}:`, error);
        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: {
            id: modpack.id,
            state: { status: 'error', error: 'Error al cargar el estado' },
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
                  state: {
                    status,
                    translations: modpackTranslations || undefined,
                    features: features?.features || []
                  },
                },
              });
            } catch (modpackError) {
              console.warn(`Error loading data for modpack ${modpack.id}:`, modpackError);
              // En caso de error, mantener un estado básico
              dispatch({
                type: 'SET_MODPACK_STATE',
                payload: {
                  id: modpack.id,
                  state: { status: 'error', error: 'Error al cargar datos del modpack' },
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

    const actionStatus = action === 'launch' ? 'launching' : `${action}ing` as any;

    dispatch({
      type: 'SET_MODPACK_STATE',
      payload: {
        id: modpackId,
        state: { 
          ...state.modpackStates[modpackId],
          status: actionStatus
        },
      },
    });

    try {
      const onProgress = (progress: number) => {
        dispatch({
          type: 'UPDATE_MODPACK_PROGRESS',
          payload: { id: modpackId, progress },
        });
      };

      switch (action) {
        case 'install':
          await launcherService.installModpack(modpackId, onProgress);
          break;
        case 'update':
          await launcherService.updateModpack(modpackId, onProgress);
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
            ...state.modpackStates[modpackId],
            status: newStatus
          },
        },
      });
    } catch (error) {
      console.error(`Error ${action}ing modpack:`, error);
      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          id: modpackId,
          state: { 
            ...state.modpackStates[modpackId],
            status: 'error', 
            error: error instanceof Error ? error.message : 'Error desconocido'
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
  };

  return (
    <LauncherContext.Provider value={contextValue}>
      {children}
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