import React from 'react';
import { useTranslation } from 'react-i18next';
import { Home, Settings, Info, AlertCircle } from 'lucide-react';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeSection, onSectionChange }) => {
  const { t } = useTranslation();
  // Temporalmente removemos hasUpdate hasta implementar la funcionalidad
  const hasUpdate = false;
  
  // Version is automatically updated by release.js
  const currentVersion = "0.0.5";

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
    <div className="w-64 bg-dark-800 border-r border-dark-700 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-dark-700">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
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
          <div>
            <h1 className="text-white font-bold text-lg">LuminaKraft</h1>
            <p className="text-dark-400 text-sm">Launcher</p>
          </div>
        </div>
      </div>

      {/* Update notification */}
      {hasUpdate && (
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
                className={`sidebar-item w-full text-left ${isActive ? 'active' : ''}`}
                title={item.description}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-dark-700">
        <div className="text-center">
          <p className="text-dark-400 text-xs">
            © 2025 LuminaKraft Studios
          </p>
          <p className="text-dark-500 text-xs mt-1">
            {t('app.version', { version: currentVersion })}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar; 