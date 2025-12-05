import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Home, Settings, Info, AlertCircle, Pin, PinOff, FolderOpen, UploadCloud, User, Compass } from 'lucide-react';
import { useLauncher } from '../../contexts/LauncherContext';
import PlayerHeadLoader from '../PlayerHeadLoader';
import { check } from '@tauri-apps/plugin-updater';
import MinecraftAccountDropdown from './AccountDropdown'; // Using the file we just refactored

interface SidebarProps {
  activeSection: string;
  onSectionChange: (_section: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeSection, onSectionChange }) => {
  const { t } = useTranslation();
  const { userSettings, updateUserSettings } = useLauncher(); // Added updateUserSettings
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebarPinned') === '1';
  });
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string>('');

  // Minecraft Account Dropdown State
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const playerSectionRef = useRef<HTMLDivElement>(null);

  // Persist pin state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebarPinned', isPinned ? '1' : '0');
    }
  }, [isPinned]);

  // Check for updates (respecting experimental updates setting)
  useEffect(() => {
    const checkUpdates = async () => {
      try {
        // Check if prereleases are enabled
        const enablePrereleases = userSettings?.enablePrereleases ?? false;

        const update = await check();
        if (update?.available) {
          const isPrerelease = update.version.includes('alpha') || update.version.includes('beta') || update.version.includes('rc');

          // Only show update notification if:
          // - It's a stable release, OR
          // - It's a prerelease AND experimental updates are enabled
          if (!isPrerelease || enablePrereleases) {
            setHasUpdate(true);
            setLatestVersion(update.version);
          }
        }
      } catch (error) {
        console.error('Error checking for updates:', error);
      }
    };
    checkUpdates();
  }, [userSettings?.enablePrereleases]);

  // Version is automatically updated by release.js
  const currentVersion = "0.1.0-rc.1";

  const menuItems = [
    {
      id: 'home',
      label: t('navigation.home'),
      icon: Home,
      description: t('navigation.homeDesc')
    },
    {
      id: 'explore',
      label: t('navigation.explore'),
      icon: Compass,
      description: t('navigation.exploreDesc')
    },
    {
      id: 'my-modpacks',
      label: t('navigation.myModpacks'),
      icon: FolderOpen,
      description: t('navigation.myModpacksDesc')
    },
    {
      id: 'published-modpacks',
      label: t('navigation.publishedModpacks'),
      icon: UploadCloud,
      description: t('navigation.publishedModpacksDesc')
    },
    {
      id: 'account',
      label: t('navigation.account'),
      icon: User,
      description: t('navigation.accountDesc')
    },
    {
      id: 'settings',
      label: t('navigation.settings'),
      icon: Settings,
      description: 'Ajustes del launcher'
    },
    {
      id: 'about',
      label: t('navigation.about'),
      icon: Info,
      description: 'Información del launcher'
    }
  ];

  const handleAvatarClick = () => {
    setIsAccountDropdownOpen(!isAccountDropdownOpen);
  };

  return (
    <div
      className={`${isExpanded ? 'w-64' : 'w-20'} bg-dark-800 border-r border-dark-700 flex flex-col transition-all duration-200 ease-in-out select-none relative`}
      style={{
        animation: 'fadeInLeft 0.4s ease-out'
      }}
      onMouseLeave={() => {
        if (!isPinned) {
          setIsExpanded(false);
        }
      }}
    >
      {/* Minecraft Account Dropdown */}
      <MinecraftAccountDropdown
        isOpen={isAccountDropdownOpen}
        onClose={() => setIsAccountDropdownOpen(false)}
        anchorRef={playerSectionRef}
        userSettings={userSettings}
        onUpdateSettings={updateUserSettings}
        onNavigateToAccount={() => onSectionChange('account')}
      />

      {/* Header - consistent positioning */}
      <div ref={playerSectionRef} className="p-4 h-20 border-b border-dark-700 flex items-center">
        <div className="flex items-center space-x-3 w-full pl-[0.25rem]">
          {/* Player info when logged in with Microsoft */}
          {userSettings.authMethod === 'microsoft' && userSettings.microsoftAccount ? (
            <>
              <div
                className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center cursor-pointer relative group"
                role="button"
                tabIndex={0}
                onClick={handleAvatarClick}
                onMouseEnter={() => {
                  if (!isPinned) setIsExpanded(true);
                }}
              >
                <img
                  src={`https://mc-heads.net/avatar/${userSettings.microsoftAccount.uuid}/40`}
                  alt={`${userSettings.microsoftAccount.username}'s head`}
                  className="w-full h-full object-cover transition-all duration-200 group-hover:scale-110 group-hover:rotate-6 group-active:scale-125 group-active:rotate-12"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (!target.src.includes('crafatar')) {
                      target.src = `https://crafatar.com/avatars/${userSettings.microsoftAccount!.uuid}?size=40&overlay`;
                    }
                  }}
                />
                {/* Fun sparkle effect on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <div className="absolute top-0 right-0 w-2 h-2 bg-yellow-400 rounded-full animate-ping" style={{ animationDelay: '0ms' }}></div>
                  <div className="absolute bottom-0 left-0 w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" style={{ animationDelay: '200ms' }}></div>
                  <div className="absolute top-1/2 left-0 w-1 h-1 bg-green-400 rounded-full animate-ping" style={{ animationDelay: '400ms' }}></div>
                </div>
                {/* Glow effect */}
                <div className="absolute inset-0 rounded-lg bg-gradient-to-tr from-lumina-400/20 to-lumina-300/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"></div>
              </div>
              <div className={`min-w-0 transition-opacity duration-200 ${isExpanded ? 'opacity-100 ml-3' : 'opacity-0 w-0 ml-0'}`}>
                <h1 className="text-white font-bold text-lg truncate">{userSettings.microsoftAccount.username}</h1>
                <p className="text-lumina-400 text-sm truncate whitespace-nowrap">{t('auth.microsoftAccount')}</p>
              </div>
            </>
          ) : (
            /* Offline mode - show loader */
            <>
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center cursor-pointer group relative" role="button" tabIndex={0} onClick={handleAvatarClick} onMouseEnter={() => { if (!isPinned) setIsExpanded(true); }}>
                <div className="transition-all duration-200 group-hover:scale-110 group-hover:rotate-6 group-active:scale-125 group-active:rotate-12">
                  <PlayerHeadLoader />
                </div>
                {/* Fun sparkle effect on hover for offline mode too */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <div className="absolute top-0 right-0 w-2 h-2 bg-gray-400 rounded-full animate-ping" style={{ animationDelay: '0ms' }}></div>
                  <div className="absolute bottom-0 left-0 w-1.5 h-1.5 bg-gray-300 rounded-full animate-ping" style={{ animationDelay: '200ms' }}></div>
                  <div className="absolute top-1/2 left-0 w-1 h-1 bg-gray-500 rounded-full animate-ping" style={{ animationDelay: '400ms' }}></div>
                </div>
                {/* Glow effect */}
                <div className="absolute inset-0 rounded-lg bg-gradient-to-tr from-gray-400/20 to-gray-300/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"></div>
              </div>
              <div className={`min-w-0 transition-opacity duration-200 ${isExpanded ? 'opacity-100 ml-3' : 'opacity-0 w-0 ml-0'}`}>
                <h1 className="text-white font-bold text-lg truncate">{userSettings.username}</h1>
                <p className="text-dark-400 text-sm truncate whitespace-nowrap">{t('auth.offlineMode')}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Update notification */}
      {hasUpdate && isExpanded && (
        <div className="m-4 p-3 bg-yellow-600/20 border border-yellow-600/30 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-yellow-500" />
            <span className="text-yellow-400 text-sm font-medium">
              {t('notifications.updateAvailable')}
            </span>
          </div>
          <p className="text-yellow-300 text-xs mt-1">
            {t('about.updateAvailable', { version: latestVersion })}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-2" onMouseEnter={() => { if (!isPinned) setIsExpanded(true); }}>
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            // Treat publish-modpack and edit-modpack as sub-sections of published-modpacks
            const isActive = activeSection === item.id ||
              (item.id === 'published-modpacks' && (activeSection === 'publish-modpack' || activeSection === 'edit-modpack'));

            return (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={`sidebar-item w-full flex items-center pl-[0.875rem] ${isActive ? 'active' : ''} transition-all duration-200 group`}
                style={{
                  animation: `fadeInLeft 0.4s ease-out ${index * 0.05 + 0.1}s backwards`
                }}
                title={!isExpanded ? item.label : undefined}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 transition-all duration-200 ${isActive ? 'text-white' : ''} group-hover:text-lumina-300`} />
                <span className={`font-medium truncate transition-all duration-150 ${isExpanded ? 'opacity-100 ml-3' : 'opacity-0 w-0 ml-0'} ${isActive ? 'text-white' : ''} group-hover:text-lumina-200`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer - consistent height to prevent jumping */}
      <div className="p-4">
        {/* Border with opacity transition */}
        <div className={`border-t border-dark-700 mb-4 transition-opacity duration-150 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}></div>

        {/* Copyright and version - fade in/out with opacity */}
        <div className={`text-center mb-4 transition-opacity duration-150 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-dark-400 text-xs truncate whitespace-nowrap">
            © 2025 LuminaKraft Studios
          </p>
          <p className="text-dark-500 text-xs mt-1 truncate whitespace-nowrap">
            {t('app.version', { version: currentVersion })}
          </p>
        </div>

        {/* Pin Button with better UX */}
        <button
          onClick={() => {
            const newPinned = !isPinned;
            setIsPinned(newPinned);
          }}
          className={`w-full flex items-center justify-center p-3 rounded-lg transition-all duration-200 border group relative ${isPinned
              ? 'text-lumina-400 bg-lumina-600/10 border-lumina-500/40 hover:bg-lumina-600/20 hover:border-lumina-400/60'
              : 'text-dark-400 hover:text-lumina-400 hover:bg-lumina-600/10 border-dark-600 hover:border-lumina-500/30'
            }`}
          style={{
            animation: 'fadeInUp 0.4s ease-out 0.3s backwards'
          }}
          title={isPinned ? t('sidebar.unpin') : t('sidebar.pin')}
        >
          {isPinned ? (
            <PinOff className="w-5 h-5 transform group-hover:rotate-12 transition-transform duration-200" />
          ) : (
            <Pin className="w-5 h-5 transform group-hover:-rotate-12 transition-transform duration-200" />
          )}

          {/* Tooltip indicator */}
          <div className={`absolute -top-2 -right-1 w-2 h-2 rounded-full transition-all duration-200 ${isPinned ? 'bg-green-500 opacity-100' : 'bg-gray-500 opacity-40'
            }`} />
        </button>
      </div>
    </div>
  );
};

export default Sidebar; 