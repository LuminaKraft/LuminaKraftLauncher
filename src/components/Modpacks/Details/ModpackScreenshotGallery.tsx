import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAnimation } from '../../../contexts/AnimationContext';

interface ScreenshotGalleryProps {
  images: string[];
  modpackName: string;
  variant?: 'default' | 'large';
}

const ModpackScreenshotGallery: React.FC<ScreenshotGalleryProps> = ({ images, modpackName, variant = 'default' }) => {
  const { t } = useTranslation();
  const { getAnimationClass, getAnimationStyle, withDelay } = useAnimation();
  const [currentCarouselIndex, setCurrentCarouselIndex] = useState(0);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalAnimating, setImageModalAnimating] = useState(false);
  const [isChangingImage, setIsChangingImage] = useState(false);
  const [imagesPerPage, setImagesPerPage] = useState(1);

  const getImagesPerPage = () => {
    if (variant === 'large') {
      if (window.innerWidth < 768) return 2; // Mobile larger view still 2
      if (window.innerWidth < 1280) return 4; // Tablet/Small desktop shows 4
      return 6; // Large desktop shows 6 per page
    }
    // default behavior
    if (window.innerWidth < 768) return 1; // Mobile
    if (window.innerWidth < 1280) return 2; // Tablet/Small desktop
    return 3; // Large desktop
  };

  useEffect(() => {
    const updateImagesPerPage = () => {
      setImagesPerPage(getImagesPerPage());
    };

    const handleResize = () => {
      updateImagesPerPage();
    };

    updateImagesPerPage();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const totalPages = Math.ceil(images.length / imagesPerPage);

  const nextCarouselPage = () => {
    setCurrentCarouselIndex((prev) => (prev + 1) % totalPages);
  };

  const prevCarouselPage = () => {
    setCurrentCarouselIndex((prev) => (prev - 1 + totalPages) % totalPages);
  };

  const goToCarouselPage = (pageIndex: number) => {
    setCurrentCarouselIndex(pageIndex);
  };

  const openImageModal = (index: number) => {
    setSelectedImageIndex(index);
    setImageModalOpen(true);
    withDelay(() => setImageModalAnimating(true), 50);
  };

  const closeImageModal = () => {
    setImageModalAnimating(false);
    withDelay(() => {
      setImageModalOpen(false);
      setSelectedImageIndex(null);
      setIsChangingImage(false);
    }, 75);
  };

  const navigateImage = (direction: 'prev' | 'next') => {
    if (selectedImageIndex === null) return;

    const newIndex =
      direction === 'prev'
        ? selectedImageIndex === 0
          ? images.length - 1
          : selectedImageIndex - 1
        : selectedImageIndex === images.length - 1
          ? 0
          : selectedImageIndex + 1;

    // Simple zoom out/zoom in animation
    setIsChangingImage(true);

    withDelay(() => {
      setSelectedImageIndex(newIndex);
      setIsChangingImage(false);
    }, 50);
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!imageModalOpen) return;

      if (e.key === 'Escape') {
        closeImageModal();
        return;
      }

      if (e.key === 'ArrowLeft') {
        navigateImage('prev');
      } else if (e.key === 'ArrowRight') {
        navigateImage('next');
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [imageModalOpen, selectedImageIndex]);

  if (!images || images.length === 0) return null;

  return (
    <>
      {/* PC-Friendly Screenshots Carousel */}
      <div
        className={`bg-dark-800 rounded-xl p-6 border border-dark-700 mb-8 transition-all duration-75 ${getAnimationClass('', 'hover:border-lumina-400/30')}`}
        style={{
          animation: 'fadeInUp 0.15s ease-out 0.05s backwards',
          ...getAnimationStyle({}),
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">{t('modpacks.screenshots')}</h2>
            <p className="text-dark-400 text-sm">
              {images.length} {t('modpacks.imagesAvailable')}
            </p>
          </div>

          {/* Navigation controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center sm:justify-end space-x-3">
              <button
                onClick={prevCarouselPage}
                disabled={currentCarouselIndex === 0}
                className={`w-10 h-10 bg-dark-700 hover:bg-lumina-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center transition-colors duration-150 ${getAnimationClass('', 'hover:scale-105')}`}
                style={getAnimationStyle({})}
                title="Página anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* Page indicators */}
              <div className="flex space-x-2">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => goToCarouselPage(i)}
                    className={`w-3 h-3 rounded-full transition-all duration-200 ${i === currentCarouselIndex
                        ? 'bg-lumina-400 scale-125'
                        : 'bg-dark-600 hover:bg-dark-500 hover:scale-110'
                      } ${getAnimationClass('', '')}`}
                    style={getAnimationStyle({})}
                    title={`Página ${i + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={nextCarouselPage}
                disabled={currentCarouselIndex === totalPages - 1}
                className={`w-10 h-10 bg-dark-700 hover:bg-lumina-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center transition-colors duration-150 ${getAnimationClass('', 'hover:scale-105')}`}
                style={getAnimationStyle({})}
                title="Página siguiente"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Images grid - dynamic columns based on actual images */}
        <div
          className={`grid gap-4 ${(() => {
            const currentPageImages = images.slice(
              currentCarouselIndex * imagesPerPage,
              (currentCarouselIndex + 1) * imagesPerPage,
            );
            const imageCount = currentPageImages.length;

            if (imageCount === 1) return 'grid-cols-1 max-w-2xl mx-auto';
            if (imageCount === 2) return 'grid-cols-1 md:grid-cols-2';
            return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
          })()}`}
        >
          {images
            .slice(currentCarouselIndex * imagesPerPage, (currentCarouselIndex + 1) * imagesPerPage)
            .map((image, index) => {
              const actualIndex = currentCarouselIndex * imagesPerPage + index;
              return (
                <div
                  key={actualIndex}
                  className={`group relative aspect-video bg-dark-700/50 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 ${getAnimationClass('', 'hover:scale-[1.02]')}`}
                  style={getAnimationStyle({})}
                  onClick={() => openImageModal(actualIndex)}
                >
                  <img
                    src={image}
                    alt={`${modpackName} screenshot ${actualIndex + 1}`}
                    className={`w-full h-full object-cover transition-transform duration-200 ${getAnimationClass('', 'group-hover:scale-105')}`}
                    loading="lazy"
                  />

                  {/* Hover overlay */}
                  <div
                    className={`absolute inset-0 bg-black/50 opacity-0 transition-opacity duration-200 flex items-center justify-center ${getAnimationClass('', 'group-hover:opacity-100')}`}
                  >
                    <div className="bg-lumina-600 rounded-full p-2">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Navigation hint */}
        {totalPages > 1 && (
          <div className="mt-4 text-center">
            <p className="text-dark-400 text-xs">{t('modpacks.carouselHint')}</p>
          </div>
        )}
      </div>

      {/* Image Modal - Properly Centered */}
      {imageModalOpen && selectedImageIndex !== null && (
        <div
          className={`fixed inset-0 z-[9999] flex items-center justify-center p-6 ${getAnimationClass('backdrop-blur-md transition-all duration-75 ease-out', '')} ${imageModalAnimating ? 'bg-black/40 opacity-100' : 'bg-black/0 opacity-0'}`}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            ...getAnimationStyle({}),
          }}
          onClick={closeImageModal}
        >
          {/* Close button */}
          <button
            onClick={closeImageModal}
            className={`absolute top-4 right-4 md:top-6 md:right-6 z-[10000] w-10 h-10 bg-white/15 backdrop-blur-sm text-white/90 rounded-full flex items-center justify-center border border-white/30 ${getAnimationClass('hover:bg-white/25 hover:text-white transition-all duration-75', '')} ${imageModalAnimating ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 -translate-y-2'}`}
            style={getAnimationStyle({})}
          >
            <X className="w-5 h-5" />
          </button>

          {/* Navigation buttons */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateImage('prev');
                }}
                className={`absolute left-4 md:left-6 top-1/2 -translate-y-1/2 z-[10000] w-12 h-12 bg-white/15 backdrop-blur-sm text-white/80 rounded-full flex items-center justify-center border border-white/30 ${getAnimationClass('hover:bg-white/25 hover:text-white transition-all duration-75', '')} ${imageModalAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
                style={getAnimationStyle({})}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateImage('next');
                }}
                className={`absolute right-4 md:right-6 top-1/2 -translate-y-1/2 z-[10000] w-12 h-12 bg-white/15 backdrop-blur-sm text-white/80 rounded-full flex items-center justify-center border border-white/30 ${getAnimationClass('hover:bg-white/25 hover:text-white transition-all duration-75', '')} ${imageModalAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
                style={getAnimationStyle({})}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Centered image container - smaller size */}
          <div
            className={`relative max-w-[75vw] max-h-[75vh] flex items-center justify-center ${getAnimationClass('transition-all duration-75 ease-out', '')} ${imageModalAnimating ? (isChangingImage ? 'scale-95 opacity-50' : 'scale-100 opacity-100') : 'scale-90 opacity-0'}`}
            style={getAnimationStyle({})}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              key={selectedImageIndex}
              src={images[selectedImageIndex]}
              alt={`${modpackName} screenshot ${selectedImageIndex + 1}`}
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              draggable={false}
              style={{
                maxWidth: '75vw',
                maxHeight: '75vh',
              }}
            />
          </div>

          {/* Image counter */}
          {images.length > 1 && (
            <div
              className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[10000] px-4 py-2 bg-black/40 backdrop-blur-sm text-white text-sm rounded-full border border-white/20 ${getAnimationClass('transition-all duration-75', '')} ${imageModalAnimating ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
            >
              {selectedImageIndex + 1} / {images.length}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default ModpackScreenshotGallery; 