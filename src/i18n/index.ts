import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import language files
import en from '../../public/locales/en/common.json';
import es from '../../public/locales/es/common.json';

const resources = {
  en: {
    common: en
  },
  es: {
    common: es
  }
};

// Custom language detector for Spanish variants
const customLanguageDetector = {
  name: 'customDetector',
  lookup() {
    // Check if user has manually set a language preference
    const storedLanguage = localStorage.getItem('luminakraft-language');
    if (storedLanguage && ['es', 'en'].includes(storedLanguage)) {
      return storedLanguage;
    }

    // Detect browser language
    const browserLanguage = navigator.language || navigator.languages?.[0];
    if (browserLanguage) {
      // If any Spanish variant (es, es-ES, es-MX, es-AR, etc.), use Spanish
      if (browserLanguage.toLowerCase().startsWith('es')) {
        return 'es';
      }
    }

    // Default to English for all other languages
    return 'en';
  },
  cacheUserLanguage(lng: string) {
    localStorage.setItem('luminakraft-language', lng);
  }
};

i18n
  .use({
    type: 'languageDetector',
    async: false,
    init: () => {},
    detect: customLanguageDetector.lookup,
    cacheUserLanguage: customLanguageDetector.cacheUserLanguage
  })
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    
    detection: {
      order: ['customDetector'],
      caches: ['localStorage']
    },

    interpolation: {
      escapeValue: false
    },

    react: {
      useSuspense: false
    }
  });

export default i18n; 