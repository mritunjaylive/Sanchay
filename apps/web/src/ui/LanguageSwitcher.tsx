import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'

interface LanguageSwitcherProps {
  variant?: 'pill' | 'buttons'
  className?: string
}

export function LanguageSwitcher({ variant = 'pill', className = '' }: LanguageSwitcherProps) {
  const { i18n } = useTranslation()
  const currentLang = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('hi') ? 'hi' : 'en'

  const setLanguage = (lang: 'en' | 'hi') => {
    void i18n.changeLanguage(lang)
    try {
      localStorage.setItem('i18nextLng', lang)
    } catch {
      // Ignore localStorage failures
    }
  }

  if (variant === 'buttons') {
    return (
      <div className={`inline-flex items-center gap-1.5 p-1 bg-surface-elevated/80 backdrop-blur-sm border border-border rounded-xl ${className}`}>
        <button
          type="button"
          onClick={() => setLanguage('en')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            currentLang === 'en'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-text-muted hover:text-text hover:bg-surface-overlay'
          }`}
          aria-label="Switch to English"
        >
          English
        </button>
        <button
          type="button"
          onClick={() => setLanguage('hi')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            currentLang === 'hi'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-text-muted hover:text-text hover:bg-surface-overlay'
          }`}
          aria-label="हिन्दी में बदलें"
        >
          हिन्दी
        </button>
      </div>
    )
  }

  return (
    <div className={`inline-flex items-center gap-2 p-1 bg-surface-elevated/70 backdrop-blur-sm border border-border rounded-full shadow-sm ${className}`}>
      <div className="pl-2 pr-1 text-text-muted flex items-center gap-1.5">
        <Globe size={14} className="text-primary" />
        <span className="text-xs font-medium uppercase tracking-wider hidden sm:inline">Lang</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setLanguage('en')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            currentLang === 'en'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-text-muted hover:text-text hover:bg-surface-overlay'
          }`}
          aria-label="English"
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLanguage('hi')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            currentLang === 'hi'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-text-muted hover:text-text hover:bg-surface-overlay'
          }`}
          aria-label="हिन्दी"
        >
          हिन्दी
        </button>
      </div>
    </div>
  )
}
