import React, { useState, useEffect } from 'react';
import { User as UserIcon, LogOut, LogIn, WifiOff, Gamepad2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UserSettings, MicrosoftAccount } from '../../types/launcher';
import AuthService from '../../services/authService';
import toast from 'react-hot-toast';

interface MinecraftAccountDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement>;
  userSettings: UserSettings;
  onUpdateSettings: (settings: UserSettings) => void;
}

const MinecraftAccountDropdown: React.FC<MinecraftAccountDropdownProps> = ({
  isOpen,
  onClose,
  anchorRef,
  userSettings,
  onUpdateSettings,
}) => {
  const { t } = useTranslation();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [offlineUsername, setOfflineUsername] = useState(userSettings.username || 'Player');
  const [isEditingUsername, setIsEditingUsername] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen && 
        anchorRef.current && 
        !anchorRef.current.contains(event.target as Node) &&
        !(event.target as Element).closest('.minecraft-account-dropdown')
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, anchorRef]);

  // Initialize offline username from settings if not in Microsoft mode
  useEffect(() => {
    if (userSettings.authMethod !== 'microsoft') {
      setOfflineUsername(userSettings.username);
    }
  }, [userSettings]);

  if (!isOpen || !anchorRef.current) return null;

  const rect = anchorRef.current.getBoundingClientRect();
  // Position the dropdown ABOVE the player section if it's at the bottom of the sidebar
  // or adjust based on your layout. Assuming sidebar is full height and player is at top:
  // The Sidebar.tsx shows player section at the TOP. So dropdown should be BELOW.
  const style: React.CSSProperties = {
    position: 'absolute',
    top: rect.bottom + 8,
    left: rect.left,
    zIndex: 1000,
  };

  const handleMicrosoftLogin = async () => {
    setIsAuthenticating(true);
    try {
      const authService = AuthService.getInstance();
      const account = await authService.authenticateWithMicrosoftModal();
      
      // Update ModpackManagementService with Microsoft account
      const { ModpackManagementService } = await import('../../services/modpackManagementService');
      ModpackManagementService.getInstance().setMicrosoftAccount(account);

      const newSettings = {
        ...userSettings,
        authMethod: 'microsoft' as const,
        microsoftAccount: account,
        username: account.username
      };
      onUpdateSettings(newSettings);
      toast.success('Logged in with Microsoft');
      onClose();
    } catch (error: any) {
      console.error('Microsoft login failed:', error);
      toast.error(error.message || 'Failed to login with Microsoft');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSwitchToOffline = () => {
    // Restore previous username or default
    const newSettings = {
      ...userSettings,
      authMethod: 'offline' as const,
      microsoftAccount: undefined,
      username: offlineUsername || 'Player'
    };
    onUpdateSettings(newSettings);
    toast.success('Switched to Offline Mode');
  };

  const handleSaveOfflineUsername = () => {
    if (!offlineUsername.trim()) {
      toast.error('Username cannot be empty');
      return;
    }
    
    const newSettings = {
      ...userSettings,
      username: offlineUsername.trim()
    };
    onUpdateSettings(newSettings);
    setIsEditingUsername(false);
    toast.success('Username updated');
  };

  const isMicrosoft = userSettings.authMethod === 'microsoft' && userSettings.microsoftAccount;

  return (
    <div 
      className="minecraft-account-dropdown w-72 bg-dark-800 border border-dark-600 rounded-lg shadow-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      style={style}
    >
      <div className="p-4 border-b border-dark-700 bg-dark-900/30">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">{t('auth.microsoftAccount')}</h3>
        <p className="text-xs text-gray-500">{t('auth.minecraftAccountDesc')}</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Current Status */}
        <div className={`p-3 rounded-lg border ${isMicrosoft ? 'bg-green-900/10 border-green-800/30' : 'bg-dark-700 border-dark-600'}`}>
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded flex items-center justify-center ${isMicrosoft ? 'bg-green-600/20 text-green-400' : 'bg-dark-600 text-gray-400'}`}>
              {isMicrosoft ? <Gamepad2 className="w-6 h-6" /> : <WifiOff className="w-6 h-6" />}
            </div>
            <div>
              {isMicrosoft ? (
                <p className="text-white font-medium">
                  {userSettings.microsoftAccount?.username}
                </p>
              ) : (
                <>
                  <p className="text-white font-medium">{t('auth.offlineMode')}</p>
                  <p className="text-xs text-gray-400">{userSettings.username}</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {!isMicrosoft ? (
          <div className="space-y-3">
            {/* Offline Username Editor */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('settings.username')}</label>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={offlineUsername}
                  onChange={(e) => setOfflineUsername(e.target.value)}
                  className="flex-1 bg-dark-900 border border-dark-600 rounded px-2 py-1 text-sm text-white focus:ring-1 focus:ring-lumina-500 outline-none"
                  placeholder={t('settings.usernamePlaceholder')}
                />
                <button 
                  onClick={handleSaveOfflineUsername}
                  className="px-3 py-1 bg-dark-600 hover:bg-dark-500 text-white text-xs rounded transition-colors"
                >
                  {t('app.save')}
                </button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-dark-600"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-dark-800 text-gray-500">OR</span>
              </div>
            </div>

            <button 
              onClick={handleMicrosoftLogin} 
              disabled={isAuthenticating}
              className="w-full btn-primary flex items-center justify-center space-x-2 py-2"
            >
              {isAuthenticating ? (
                <span className="animate-pulse">{t('auth.signing')}</span>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 21 21" fill="currentColor">
                    <path d="M0 0h10v10H0V0zm11 0h10v10H11V0zM0 11h10v10H0V11zm11 0h10v10H11V11z" />
                  </svg>
                  <span>{t('auth.signInMicrosoft')}</span>
                </>
              )}
            </button>
            <p className="text-[10px] text-center text-gray-500">
              {t('auth.microsoftDescription')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <button 
              onClick={handleSwitchToOffline} 
              className="w-full btn-secondary flex items-center justify-center space-x-2 text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('auth.offlineMode')}</span>
            </button>
            <p className="text-[10px] text-center text-gray-500">
              {t('auth.offlineModeDescription')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MinecraftAccountDropdown;

