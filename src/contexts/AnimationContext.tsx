import React, { createContext, useContext, ReactNode } from 'react';
import { useLauncher } from './LauncherContext';

interface AnimationContextType {
  animationsEnabled: boolean;
  getAnimationClass: (_baseClass: string, _animatedClass?: string) => string;
  getAnimationStyle: (_style: React.CSSProperties) => React.CSSProperties;
  getDelay: (_delay: number) => number;
  withDelay: (_callback: () => void, _delay: number) => void;
}

const AnimationContext = createContext<AnimationContextType | undefined>(undefined);

export function AnimationProvider({ children }: { children: ReactNode }) {
  const { userSettings } = useLauncher();
  const animationsEnabled = userSettings.enableAnimations !== false; // default to true

  const getAnimationClass = (baseClass: string, animatedClass: string = '') => {
    if (!animationsEnabled) return baseClass;
    return `${baseClass} ${animatedClass}`.trim();
  };

  const getAnimationStyle = (style: React.CSSProperties): React.CSSProperties => {
    if (!animationsEnabled) {
      // Completely disable all animations, transitions, and transforms
      const disabledStyle: React.CSSProperties = {
        ...style,
        transition: 'none !important' as any,
        animation: 'none !important' as any,
        animationDuration: '0s !important' as any,
        animationDelay: '0s !important' as any,
        transitionDuration: '0s !important' as any,
        transitionDelay: '0s !important' as any,
      };
      
      // Remove scale transforms but keep other transforms like translate
      if (style.transform) {
        disabledStyle.transform = style.transform
          .replace(/scale\([^)]+\)/g, '')
          .replace(/rotate\([^)]+\)/g, '')
          .trim();
      }
      
      return disabledStyle;
    }
    return style;
  };

  // Get appropriate delay - returns 0 if animations are disabled, original delay if enabled
  const getDelay = (delay: number): number => {
    return animationsEnabled ? delay : 0;
  };

  // Execute callback with appropriate delay
  const withDelay = (callback: () => void, delay: number): void => {
    const actualDelay = animationsEnabled ? delay : 0;
    setTimeout(callback, actualDelay);
  };

  // Add global CSS to disable animations when setting is off
  React.useEffect(() => {
    if (!animationsEnabled) {
      const style = document.createElement('style');
      style.id = 'disable-animations';
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-delay: -0.01ms !important;
          transition-duration: 0.01ms !important;
          transition-delay: 0.01ms !important;
        }
      `;
      document.head.appendChild(style);
      
      return () => {
        const existingStyle = document.getElementById('disable-animations');
        if (existingStyle) {
          existingStyle.remove();
        }
      };
    }
  }, [animationsEnabled]);

  return (
    <AnimationContext.Provider value={{
      animationsEnabled,
      getAnimationClass,
      getAnimationStyle,
      getDelay,
      withDelay,
    }}>
      {children}
    </AnimationContext.Provider>
  );
}

export const useAnimation = () => {
  const context = useContext(AnimationContext);
  
  if (context === undefined) {
    throw new Error('useAnimation must be used within an AnimationProvider');
  }
  
  return context;
}; 