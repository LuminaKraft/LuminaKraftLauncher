import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Users, Download, Clock } from 'lucide-react';
import type { Modpack, ModpackState, ProgressInfo } from '../../types/launcher';
import { useLauncher } from '../../contexts/LauncherContext';
import { useAnimation } from '../../contexts/AnimationContext';

import ModpackActions from './Details/ModpackActions';
import ModpackInfo from './Details/ModpackInfo';
import ModpackRequirements from './Details/ModpackRequirements';
import ModpackChangelog from './Details/ModpackChangelog';
import ModpackFeatures from './Details/ModpackFeatures';
import ScreenshotGallery from './ScreenshotGallery';

interface ModpackDetailsProps {
  modpack: Modpack;
  state: ModpackState & {
    progress?: ProgressInfo;
  };
  onBack: () => void;
}

const ModpackDetailsRefactored: React.FC<ModpackDetailsProps> = ({ modpack, state, onBack }) => {
  const { t } = useTranslation();
  const { translations } = useLauncher();
  const { getAnimationClass, getAnimationStyle } = useAnimation();

  // Get modpack translations
  const displayName = translations?.modpacks?.[modpack.id]?.name || modpack.name;
  const displayDescription = translations?.modpacks?.[modpack.id]?.description || modpack.description;
  const features = state.features;

  // Get server status badge like in ModpackCard
  const getServerStatusBadge = () => {
    if (modpack.isNew) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-600/40 text-green-300 border border-green-600/60">
          {translations?.ui?.status?.new || 'Nuevo'}
        </span>
      );
    }
    if (modpack.isActive) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-600/40 text-green-300 border border-green-600/60">
          {translations?.ui?.status?.active || 'Activo'}
        </span>
      );
    }
    if (modpack.isComingSoon) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-600/40 text-blue-300 border border-blue-600/60">
          {translations?.ui?.status?.coming_soon || 'Próximamente'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-600/40 text-gray-300 border border-gray-600/60">
        {translations?.ui?.status?.inactive || 'Inactivo'}
      </span>
    );
  };
  const stats = [
    { icon: Download, value: modpack.downloads || 0, label: t('modpacks.downloads') },
    { icon: Clock, value: modpack.playTime || 0, label: t('modpacks.playTime') },
    { icon: Users, value: modpack.players || 0, label: t('modpacks.activePlayers') },
  ];

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden bg-dark-900">
      {/* Back button - Fixed position */}
      <button
        onClick={onBack}
        className={`fixed top-6 left-6 z-50 flex items-center space-x-2 px-3 py-2 bg-dark-800/80 backdrop-blur-sm text-dark-400 hover:text-white rounded-lg border border-dark-700/50 ${
          getAnimationClass('transition-all duration-200', 'hover:scale-105 hover:bg-dark-700/90')
        }`}
        style={getAnimationStyle({})}
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm font-medium">{t('navigation.backToList')}</span>
      </button>

      {/* Hero Section with banner or fallback image */}
      <div 
        className="relative h-80 flex flex-col justify-end p-8 text-white"
      >
        {/* Banner / fallback image */}
        <div 
          className="absolute inset-0 bg-center bg-cover"
          style={{
            backgroundImage: `url(${modpack.banner || modpack.images?.[0] || modpack.logo})`,
            opacity: 0.12
          }}
        />
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 bg-black/40" />
        
        {/* Logo and Content */}
        <div className="relative z-10 flex items-start space-x-6">
          {/* Logo */}
          <div className="flex-shrink-0">
            <div 
              className="w-40 h-40 rounded-lg overflow-hidden flex items-center justify-center"
            >
              <img
                src={modpack.logo || modpack.urlIcono}
                alt={displayName}
                className="w-full h-full object-contain object-top"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHZpZXdCb3g9IjAgMCA5NiA5NiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9Ijk2IiBoZWlnaHQ9Ijk2IiBmaWxsPSIjMzc0MTUxIi8+CjxwYXRoIGQ9Ik0zNiAzNkg2MFY2MEgzNlYzNloiIGZpbGw9IiM2Mzc1ODMiLz4KPC9zdmc+';
                }}
              />
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-4xl font-bold text-white mb-2">{displayName}</h1>
                <p className="text-lg text-dark-300 leading-relaxed">{displayDescription}</p>
              </div>
              <div className="flex-shrink-0">
                {getServerStatusBadge()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Mobile Actions First */}
          <div className="lg:hidden">
            <ModpackActions modpack={modpack} state={state} />
          </div>

          {/* Left Column - Main Info */}
          <div className="lg:col-span-2 space-y-8">
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
              {stats.map((stat, index) => (
                <div 
                  key={index} 
                  className={`bg-dark-800 rounded-xl p-4 border border-dark-700 group ${
                    getAnimationClass('hover:border-lumina-400/50 transition-all duration-200', 'hover:scale-105')
                  }`}
                  style={getAnimationStyle({
                    animation: `fadeInUp 0.4s ease-out ${index * 0.05}s backwards`
                  })}
                >
                  <stat.icon className={`w-5 h-5 text-lumina-400 mb-2 ${
                    getAnimationClass('transition-transform duration-150', 'group-hover:scale-105')
                  }`} />
                  <div className={`text-2xl font-bold text-white ${
                    getAnimationClass('transition-colors duration-150', 'group-hover:text-lumina-300')
                  }`}>
                    {stat.value}
                  </div>
                  <div className="text-sm text-dark-400">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Screenshots */}
            {modpack.images && modpack.images.length > 0 && (
              <ScreenshotGallery 
                images={modpack.images} 
                modpackName={displayName} 
              />
            )}

            {/* Features */}
            <ModpackFeatures features={features} />

            {/* Changelog */}
            <ModpackChangelog modpack={modpack} />
          </div>

          {/* Right Column - Desktop Actions */}
          <div className="hidden lg:block">
            <div className="space-y-6">
              <ModpackActions modpack={modpack} state={state} />
              <ModpackInfo modpack={modpack} />
              <ModpackRequirements modpack={modpack} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModpackDetailsRefactored; 