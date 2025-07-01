import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Home, Settings, Info, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeSection, onSectionChange }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFooterText, setShowFooterText] = useState(false);

  useEffect(() => {
    if (isExpanded) {
      const textTimer = setTimeout(() => setShowFooterText(true), 300);
      return () => {
        clearTimeout(textTimer);
      };
    } else {
      // Immediately hide footer text when collapsing
      setShowFooterText(false);
    }
  }, [isExpanded]);
  
  // Temporalmente removemos hasUpdate hasta implementar la funcionalidad
  const hasUpdate = false;
  
  // Version is automatically updated by release.js
  const currentVersion = "0.0.8-alpha.4";

  const menuItems = [
    {
      id: 'home',
      label: t('navigation.modpacks'),
      icon: Home,
      description: 'Explora y gestiona tus modpacks'
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

  return (
    <div className={`${isExpanded ? 'w-56' : 'w-20'} bg-dark-800 border-r border-dark-700 flex flex-col transition-all duration-300 ease-in-out`}>
      {/* Header - consistent positioning */}
      <div className="p-4 h-20 border-b border-dark-700 flex items-center">
        <div className="flex items-center space-x-3 w-full">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
            <img 
              src="/luminakraft-logo.svg" 
              alt="LuminaKraft Logo" 
              className="w-full h-full object-contain"
              onError={(e) => {
                // Fallback to the original "L" if SVG fails to load
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const fallback = target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            <div className="w-full h-full bg-gradient-to-br from-lumina-500 to-lumina-700 rounded-lg flex items-center justify-center" style={{ display: 'none' }}>
              <span className="text-white font-bold text-lg">L</span>
            </div>
          </div>
          <div className={`min-w-0 transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
            <h1 className="text-white font-bold text-lg truncate">LuminaKraft</h1>
            <p className="text-dark-400 text-sm">Launcher</p>
          </div>
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
            {t('about.updateAvailable', { version: '0.0.3' })}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={`sidebar-item w-full flex items-center pl-[0.875rem] ${isActive ? 'active' : ''} transition-all duration-300`}
                title={!isExpanded ? item.label : item.description}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className={`font-medium truncate transition-opacity duration-200 ${isExpanded ? 'opacity-100 ml-3' : 'opacity-0 w-0 ml-0'}`}>
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
        <div className={`border-t border-dark-700 mb-4 transition-opacity duration-150 ${showFooterText ? 'opacity-100' : 'opacity-0'}`}></div>
        
        {/* Copyright and version - fade in/out with opacity */}
        <div className={`text-center mb-4 transition-opacity duration-150 ${showFooterText ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-dark-400 text-xs">
            © 2025 LuminaKraft Studios
          </p>
          <p className="text-dark-500 text-xs mt-1">
            {t('app.version', { version: currentVersion })}
          </p>
        </div>
        
        {/* Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center p-3 text-lumina-400 hover:text-lumina-300 hover:bg-lumina-600/10 rounded-lg transition-all duration-200 border border-lumina-600/20 hover:border-lumina-500/30"
          title={isExpanded ? t('sidebar.collapse') : t('sidebar.expand')}
        >
          {isExpanded ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};

export default Sidebar; 