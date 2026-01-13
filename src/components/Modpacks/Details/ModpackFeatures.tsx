import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Sparkles } from 'lucide-react';
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
      className={`relative overflow-hidden bg-gradient-to-br from-dark-800/80 to-dark-900/90 backdrop-blur-xl rounded-2xl p-6 border border-dark-700/50 shadow-xl transition-all duration-75 ${getAnimationClass('', 'hover:border-lumina-500/30 hover:shadow-lumina-500/5')
        }`}
      style={{
        animation: 'fadeInUp 0.15s ease-out 0.1s backwards',
        ...getAnimationStyle({})
      }}
    >
      {/* Background glow effect */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-lumina-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 bg-gradient-to-br from-lumina-500/20 to-lumina-600/10 rounded-xl border border-lumina-500/20">
          <Sparkles className="w-5 h-5 text-lumina-400" />
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">{t('modpacks.features')}</h2>
        <span className="ml-auto px-2.5 py-1 bg-dark-700/50 text-dark-300 text-xs font-medium rounded-full border border-dark-600/30">
          {features.length}
        </span>
      </div>

      {/* Features list */}
      <div className="space-y-3">
        {features.map((feature, index) => {
          const featureId = `feature-${index}`;
          const isExpanded = expandedFeatures.includes(featureId);
          const hasDescription = feature.description && feature.description.trim().length > 0;

          return (
            <div
              key={featureId}
              className={`group relative bg-dark-800/50 backdrop-blur-sm rounded-xl border transition-all duration-300 ${isExpanded
                ? 'border-lumina-500/30 shadow-lg shadow-lumina-500/5'
                : 'border-dark-700/30 hover:border-dark-600/50'
                }`}
            >
              <div
                className={`flex items-center gap-4 p-4 ${hasDescription ? 'cursor-pointer' : ''}`}
                onClick={() => hasDescription && toggleFeature(featureId)}
              >
                {/* Number badge */}
                <div className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg font-bold text-sm transition-all duration-300 ${isExpanded
                  ? 'bg-lumina-500/20 text-lumina-400 border border-lumina-500/30'
                  : 'bg-dark-700/50 text-dark-400 border border-dark-600/30 group-hover:text-lumina-400 group-hover:border-lumina-500/20'
                  }`}>
                  {index + 1}
                </div>

                {/* Title */}
                <h3 className={`flex-1 font-semibold transition-colors duration-200 ${isExpanded ? 'text-lumina-400' : 'text-white group-hover:text-lumina-400'
                  }`}>
                  {feature.title}
                </h3>

                {/* Expand indicator */}
                {hasDescription && (
                  <ChevronDown
                    className={`w-5 h-5 transition-all duration-300 ${isExpanded
                      ? 'rotate-180 text-lumina-400'
                      : 'text-dark-500 group-hover:text-lumina-400'
                      } ${getAnimationClass('', 'group-hover:scale-110')}`}
                  />
                )}
              </div>

              {/* Description (expandable) */}
              {hasDescription && (
                <div
                  className={`overflow-hidden transition-all duration-300 ease-out ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                >
                  <div className="px-4 pb-4 pt-0">
                    <div className="pl-12 border-l-2 border-lumina-500/20">
                      <p className="text-dark-300 leading-relaxed whitespace-pre-line text-sm">
                        {feature.description}
                      </p>
                    </div>
                  </div>
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
