import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import type { Feature } from '../../../types/launcher';
import { useAnimation } from '../../../contexts/AnimationContext';

interface ModpackFeaturesProps {
  features?: Feature[];
}

const ModpackFeatures: React.FC<ModpackFeaturesProps> = ({ features }) => {
  const { t } = useTranslation();
  const { getAnimationClass, getAnimationStyle } = useAnimation();
  const [expandedFeatures, setExpandedFeatures] = useState<string[]>([]);

  if (!features || features.length === 0) {
    return null;
  }

  const toggleFeature = (featureId: string) => {
    setExpandedFeatures(prev => 
      prev.includes(featureId) 
        ? prev.filter(id => id !== featureId)
        : [...prev, featureId]
    );
  };

  return (
    <div 
      className={`bg-dark-800 rounded-xl p-6 border border-dark-700 transition-all duration-200 ${
        getAnimationClass('', 'hover:border-lumina-400/30')
      }`}
      style={{
        animation: 'fadeInUp 0.4s ease-out 0.1s backwards',
        ...getAnimationStyle({})
      }}
    >
      <h2 className="text-xl font-bold text-white mb-4">{t('modpacks.features')}</h2>
      <div className="space-y-3">
        {features.map((feature, index) => {
          const featureId = `feature-${index}`;
          const isExpanded = expandedFeatures.includes(featureId);
          const hasDescription = feature.description && feature.description.trim().length > 0;

          return (
            <div key={featureId} className="bg-dark-900 rounded-lg p-4">
              <div 
                className={`flex items-center justify-between cursor-pointer group ${
                  hasDescription ? 'hover:text-lumina-400' : ''
                }`}
                onClick={() => hasDescription && toggleFeature(featureId)}
              >
                <h3 className="font-semibold text-white group-hover:text-lumina-400 transition-colors duration-200">
                  {feature.title}
                </h3>
                {hasDescription && (
                  <ChevronDown 
                    className={`w-4 h-4 text-dark-400 group-hover:text-lumina-400 transition-all duration-200 ${
                      isExpanded ? 'rotate-180' : ''
                    } ${getAnimationClass('', 'group-hover:scale-110')}`}
                  />
                )}
              </div>
              
              {hasDescription && (
                <div 
                  className={`mt-3 text-dark-300 leading-relaxed transition-all duration-200 overflow-hidden ${
                    isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                  style={getAnimationStyle({})}
                >
                  <p className="whitespace-pre-line">{feature.description}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ModpackFeatures; 