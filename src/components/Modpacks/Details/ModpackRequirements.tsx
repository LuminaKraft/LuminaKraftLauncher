import React from 'react';
import { useTranslation } from 'react-i18next';
import { Shield } from 'lucide-react';
import { useAnimation } from '../../../contexts/AnimationContext';

const ModpackRequirements: React.FC = () => {
  const { t } = useTranslation();
  const { getAnimationClass, getAnimationStyle } = useAnimation();

  return (
    <div 
      className={`bg-dark-800 rounded-xl p-6 border border-dark-700 transition-all duration-200 ${
        getAnimationClass('', 'hover:border-lumina-400/30')
      }`}
      style={{
        animation: 'fadeInUp 0.4s ease-out 0.6s backwards',
        ...getAnimationStyle({})
      }}
    >
      <h3 className="text-xl font-bold text-white mb-4">{t('modpacks.requirements')}</h3>
      <div className="space-y-4">
        <div>
          <div className="flex items-center space-x-2 text-dark-300 mb-2">
            <Shield className="w-4 h-4" />
            <span>{t('modpacks.recommendedRAM')}</span>
          </div>
          <p className="text-white bg-dark-900 px-3 py-2 rounded-lg">
            {t('modpacks.ramMinRecommended', { min: 4, recommended: 8 })}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ModpackRequirements; 