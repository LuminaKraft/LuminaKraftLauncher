import React from 'react';
import ModpackScreenshotGallery from '../ModpackScreenshotGallery';

interface ScreenshotsSectionProps {
  images?: string[];
  modpackName: string;
}

const ScreenshotsSection: React.FC<ScreenshotsSectionProps> = ({ images = [], modpackName }) => {
  if (!images || images.length === 0) {
    return (
      <div className="text-center py-12 text-dark-400">
        No hay screenshots disponibles
      </div>
    );
  }

  return (
    <ModpackScreenshotGallery images={images} modpackName={modpackName} variant="large" />
  );
};

export default ScreenshotsSection; 