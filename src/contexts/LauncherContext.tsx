import { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import type { LauncherData, ModpackState, UserSettings } from '../types/launcher';
import LauncherService from '../services/launcherService';

interface LauncherContextState {
  launcherData: LauncherData | null;
  modpackStates: Record<string, ModpackState>;
  userSettings: UserSettings;
  isLoading: boolean;
  error: string | null;
  hasUpdate: boolean;
  updateUrl: string | null;
}

type LauncherAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LAUNCHER_DATA'; payload: LauncherData }
  | { type: 'SET_MODPACK_STATE'; payload: { modpackId: string; state: ModpackState } }
  | { type: 'SET_USER_SETTINGS'; payload: UserSettings }
  | { type: 'SET_UPDATE_AVAILABLE'; payload: { hasUpdate: boolean; url?: string } };

interface LauncherContextType extends LauncherContextState {
  refreshLauncherData: () => Promise<void>;
  updateUserSettings: (settings: Partial<UserSettings>) => void;
  installModpack: (modpackId: string) => Promise<void>;
  updateModpack: (modpackId: string) => Promise<void>;
  launchModpack: (modpackId: string) => Promise<void>;
  repairModpack: (modpackId: string) => Promise<void>;
  checkForUpdates: () => Promise<void>;
}

const initialState: LauncherContextState = {
  launcherData: null,
  modpackStates: {},
  userSettings: {
    username: 'Player',
    allocatedRam: 4,
    launcherDataUrl: 'https://api.luminakraft.com/v1/launcher_data.json'
  },
  isLoading: false,
  error: null,
  hasUpdate: false,
  updateUrl: null
};

function launcherReducer(state: LauncherContextState, action: LauncherAction): LauncherContextState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'SET_LAUNCHER_DATA':
      return { ...state, launcherData: action.payload, isLoading: false, error: null };
    case 'SET_MODPACK_STATE':
      return {
        ...state,
        modpackStates: {
          ...state.modpackStates,
          [action.payload.modpackId]: action.payload.state
        }
      };
    case 'SET_USER_SETTINGS':
      return { ...state, userSettings: action.payload };
    case 'SET_UPDATE_AVAILABLE':
      return {
        ...state,
        hasUpdate: action.payload.hasUpdate,
        updateUrl: action.payload.url || null
      };
    default:
      return state;
  }
}

const LauncherContext = createContext<LauncherContextType | undefined>(undefined);

export function LauncherProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(launcherReducer, initialState);
  const launcherService = LauncherService.getInstance();

  useEffect(() => {
    const settings = launcherService.getUserSettings();
    dispatch({ type: 'SET_USER_SETTINGS', payload: settings });
    refreshLauncherData();
  }, []);

  useEffect(() => {
    if (state.launcherData) {
      updateModpackStates();
      checkForUpdates();
    }
  }, [state.launcherData]);

  const refreshLauncherData = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const data = await launcherService.fetchLauncherData();
      dispatch({ type: 'SET_LAUNCHER_DATA', payload: data });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Error desconocido' });
    }
  };

  const updateModpackStates = async () => {
    if (!state.launcherData) return;

    for (const modpack of state.launcherData.modpacks) {
      try {
        const status = await launcherService.getModpackStatus(modpack.id);
        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: {
            modpackId: modpack.id,
            state: { status }
          }
        });
      } catch (error) {
        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: {
            modpackId: modpack.id,
            state: { status: 'error', error: 'Error al verificar estado' }
          }
        });
      }
    }
  };

  const updateUserSettings = (settings: Partial<UserSettings>) => {
    const newSettings = { ...state.userSettings, ...settings };
    launcherService.saveUserSettings(settings);
    dispatch({ type: 'SET_USER_SETTINGS', payload: newSettings });
  };

  const installModpack = async (modpackId: string) => {
    dispatch({
      type: 'SET_MODPACK_STATE',
      payload: {
        modpackId,
        state: { status: 'installing', progress: { downloaded: 0, total: 100, percentage: 0, speed: 0 } }
      }
    });

    try {
      await launcherService.installModpack(modpackId, (progress) => {
        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: {
            modpackId,
            state: { 
              status: 'installing',
              progress: { downloaded: progress, total: 100, percentage: progress, speed: 0 }
            }
          }
        });
      });

      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: { modpackId, state: { status: 'installed' } }
      });
    } catch (error) {
      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          modpackId,
          state: { 
            status: 'error',
            error: error instanceof Error ? error.message : 'Error de instalación'
          }
        }
      });
    }
  };

  const updateModpack = async (modpackId: string) => {
    dispatch({
      type: 'SET_MODPACK_STATE',
      payload: {
        modpackId,
        state: { status: 'updating', progress: { downloaded: 0, total: 100, percentage: 0, speed: 0 } }
      }
    });

    try {
      await launcherService.updateModpack(modpackId, (progress) => {
        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: {
            modpackId,
            state: { 
              status: 'updating',
              progress: { downloaded: progress, total: 100, percentage: progress, speed: 0 }
            }
          }
        });
      });

      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: { modpackId, state: { status: 'installed' } }
      });
    } catch (error) {
      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          modpackId,
          state: { 
            status: 'error',
            error: error instanceof Error ? error.message : 'Error de actualización'
          }
        }
      });
    }
  };

  const launchModpack = async (modpackId: string) => {
    dispatch({
      type: 'SET_MODPACK_STATE',
      payload: { modpackId, state: { status: 'launching' } }
    });

    try {
      await launcherService.launchModpack(modpackId);
      // Reset to installed status after launch
      setTimeout(() => {
        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: { modpackId, state: { status: 'installed' } }
        });
      }, 2000);
    } catch (error) {
      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          modpackId,
          state: { 
            status: 'error',
            error: error instanceof Error ? error.message : 'Error al lanzar'
          }
        }
      });
    }
  };

  const repairModpack = async (modpackId: string) => {
    dispatch({
      type: 'SET_MODPACK_STATE',
      payload: {
        modpackId,
        state: { status: 'installing', progress: { downloaded: 0, total: 100, percentage: 0, speed: 0 } }
      }
    });

    try {
      await launcherService.repairModpack(modpackId, (progress) => {
        dispatch({
          type: 'SET_MODPACK_STATE',
          payload: {
            modpackId,
            state: { 
              status: 'installing',
              progress: { downloaded: progress, total: 100, percentage: progress, speed: 0 }
            }
          }
        });
      });

      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: { modpackId, state: { status: 'installed' } }
      });
    } catch (error) {
      dispatch({
        type: 'SET_MODPACK_STATE',
        payload: {
          modpackId,
          state: { 
            status: 'error',
            error: error instanceof Error ? error.message : 'Error de reparación'
          }
        }
      });
    }
  };

  const checkForUpdates = async () => {
    try {
      const updateInfo = await launcherService.checkForLauncherUpdate();
      dispatch({
        type: 'SET_UPDATE_AVAILABLE',
        payload: { hasUpdate: updateInfo.hasUpdate, url: updateInfo.downloadUrl }
      });
    } catch (error) {
      console.error('Error checking for updates:', error);
    }
  };

  const contextValue: LauncherContextType = {
    ...state,
    refreshLauncherData,
    updateUserSettings,
    installModpack,
    updateModpack,
    launchModpack,
    repairModpack,
    checkForUpdates
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