import React from 'react';
import ModpackScreenshotGallery from '../ModpackScreenshotGallery';
import { useAnimation } from '../../../../contexts/AnimationContext';
import { useTranslation } from 'react-i18next';

interface ScreenshotsSectionProps {
  images?: string[];
  modpackName: string;
}

const ScreenshotsSection: React.FC<ScreenshotsSectionProps> = ({ images = [], modpackName }) => {
  const { t } = useTranslation();
  const { getAnimationClass, getAnimationStyle } = useAnimation();
  if (!images || images.length === 0) {
    return (
      <div
        className={`text-center py-12 text-dark-400 ${getAnimationClass('transition-all duration-75')}`}
        style={getAnimationStyle({
          animation: `fadeInUp 0.15s ease-out 0.05s backwards`
        })}
      >
        {t('modpacks.screenshots.noScreenshots')}
      </div>
    );
  }

  return (
    <div
      style={getAnimationStyle({
        animation: `fadeInUp 0.15s ease-out 0.05s backwards`
      })}
    >
      <ModpackScreenshotGallery images={images} modpackName={modpackName} variant="large" />
    </div>
  );
};

export default ScreenshotsSection; 