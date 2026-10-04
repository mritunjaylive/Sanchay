import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'hi'],
    defaultNS: 'translation',
    resources: {
      en: { translation: en },
    },
    interpolation: {
      escapeValue: false, // React handles XSS
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

// Lazy-load non-English locales when active or switched to
const updateHtmlLang = (lng: string) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng.startsWith('hi') ? 'hi' : 'en'
  }
}

const loadLocaleIfNeeded = async (lng: string) => {
  updateHtmlLang(lng)
  if (lng.startsWith('hi') && !i18n.hasResourceBundle('hi', 'translation')) {
    const hi = await import('./locales/hi.json')
    i18n.addResourceBundle('hi', 'translation', hi.default, true, true)
  }
}

void loadLocaleIfNeeded(i18n.language)
i18n.on('languageChanged', (lng) => {
  void loadLocaleIfNeeded(lng)
})

export default i18n
