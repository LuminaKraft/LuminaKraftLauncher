import React from 'react';
import ModpackScreenshotGallery from '../ModpackScreenshotGallery';
import { useAnimation } from '../../../../contexts/AnimationContext';

interface ScreenshotsSectionProps {
  images?: string[];
  modpackName: string;
}

const ScreenshotsSection: React.FC<ScreenshotsSectionProps> = ({ images = [], modpackName }) => {
  const { getAnimationClass, getAnimationStyle } = useAnimation();
  if (!images || images.length === 0) {
    return (
      <div 
        className={`text-center py-12 text-dark-400 ${getAnimationClass('transition-all duration-200')}`}
        style={getAnimationStyle({
          animation: `fadeInUp 0.3s ease-out 0.1s backwards`
        })}
      >
        No hay screenshots disponibles
      </div>
    );
  }

  return (
    <div
      style={getAnimationStyle({
        animation: `fadeInUp 0.3s ease-out 0.1s backwards`
      })}
    >
      <ModpackScreenshotGallery images={images} modpackName={modpackName} variant="large" />
    </div>
  );
};

export default ScreenshotsSection; 