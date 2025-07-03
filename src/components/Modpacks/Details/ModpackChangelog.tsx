import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, ChevronDown } from 'lucide-react';
import type { Modpack } from '../../../types/launcher';
import { useAnimation } from '../../../contexts/AnimationContext';

interface ModpackChangelogProps {
  modpack: Modpack;
}

const ModpackChangelog: React.FC<ModpackChangelogProps> = ({ modpack }) => {
  const { t } = useTranslation();
  const { getAnimationClass, getAnimationStyle } = useAnimation();
  const [showFullChangelog, setShowFullChangelog] = useState(false);

  if (!modpack.changelog) {
    return null;
  }

  const formatChangelog = (changelog: string) => {
    const lines = changelog.split('\n');
    const displayLines = showFullChangelog ? lines : lines.slice(0, 5);
    
    return displayLines.map((line, index) => {
      if (line.trim() === '') return <br key={index} />;
      
      const versionMatch = line.match(/^(v?\d+\.\d+\.\d+):?\s*(.*)/);
      if (versionMatch) {
        return (
          <div key={index} className="mb-3">
            <h4 className="text-lumina-400 font-semibold flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>{versionMatch[1]}</span>
            </h4>
            {versionMatch[2] && (
              <p className="text-dark-300 mt-1 ml-6">{versionMatch[2]}</p>
            )}
          </div>
        );
      }
      
      return (
        <p key={index} className="text-dark-300 mb-2 ml-6">
          {line}
        </p>
      );
    });
  };

  const changelogLines = modpack.changelog.split('\n');
  const hasMoreContent = changelogLines.length > 5;

  return (
    <div 
      className={`bg-dark-800 rounded-xl p-6 border border-dark-700 transition-all duration-200 ${
        getAnimationClass('', 'hover:border-lumina-400/30')
      }`}
      style={{
        animation: 'fadeInUp 0.4s ease-out 0.2s backwards',
        ...getAnimationStyle({})
      }}
    >
      <h2 className="text-xl font-bold text-white mb-4">{t('modpacks.changelog')}</h2>
      <div className="space-y-2">
        {formatChangelog(modpack.changelog)}
        
        {hasMoreContent && (
          <button
            onClick={() => setShowFullChangelog(!showFullChangelog)}
            className={`flex items-center space-x-2 text-lumina-400 hover:text-lumina-300 transition-colors duration-200 mt-4 ${
              getAnimationClass('', 'hover:scale-105')
            }`}
            style={getAnimationStyle({})}
          >
            <ChevronDown 
              className={`w-4 h-4 transition-transform duration-200 ${
                showFullChangelog ? 'rotate-180' : ''
              }`}
            />
            <span>
              {showFullChangelog ? t('common.showLess') : t('common.showMore')}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

export default ModpackChangelog; 