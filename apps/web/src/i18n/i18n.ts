import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import hi from './locales/hi.json'

const updateHtmlLang = (lng: string) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng.startsWith('hi') ? 'hi' : 'en'
  }
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'hi'],
    defaultNS: 'translation',
    resources: {
      en: { translation: en },
      hi: { translation: hi },
    },
    interpolation: {
      escapeValue: false, // React handles XSS
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  })

// Set initial document language
updateHtmlLang(i18n.resolvedLanguage || i18n.language || 'en')

// Listen to language change events
i18n.on('languageChanged', (lng) => {
  updateHtmlLang(lng)
})

export default i18n
