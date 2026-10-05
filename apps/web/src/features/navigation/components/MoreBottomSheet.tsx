import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Wallet,
  Receipt,
  Landmark,
  Target,
  Calendar,
  BarChart2,
  FileSpreadsheet,
  HelpCircle,
  Settings,
  Sun,
  Moon,
  Monitor,
  Globe,
  X,
} from 'lucide-react'
import { Modal } from '../../../ui/Modal'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { profileRepo } from '../../../db/repositories/profileRepo'
import { useAuthStore } from '../../auth/stores/authStore'
import { cn } from '../../../lib/cn'
import type { Theme } from '@sanchay/shared'

export interface MoreBottomSheetProps {
  isOpen: boolean
  onClose: () => void
}

export function MoreBottomSheet({ isOpen, onClose }: MoreBottomSheetProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.session?.user)
  const { theme, setTheme, locale, setLocale } = useSettingsStore()

  const currentLang = (i18n.resolvedLanguage || i18n.language || locale || 'en').startsWith('hi') ? 'hi' : 'en'

  const handleLanguageToggle = async () => {
    const nextLang = currentLang === 'hi' ? 'en' : 'hi'
    const newLocale = nextLang === 'hi' ? 'hi-IN' : 'en-IN'
    setLocale(newLocale)
    try {
      localStorage.setItem('i18nextLng', nextLang)
    } catch {
      // ignore storage quota errors
    }
    await i18n.changeLanguage(nextLang)
    if (typeof document !== 'undefined') {
      document.documentElement.lang = nextLang
    }
    if (user) {
      void profileRepo.update(user.id, { locale: newLocale })
    }
  }

  const navTiles = [
    {
      to: '/accounts',
      icon: <Wallet size={22} />,
      label: t('nav.accounts', 'Accounts'),
      color: '#0F766E', // primary teal
    },
    {
      to: '/bills',
      icon: <Receipt size={22} />,
      label: t('nav.bills', 'Bills'),
      color: '#f59e0b', // amber
    },
    {
      to: '/loans',
      icon: <Landmark size={22} />,
      label: t('nav.loans', 'Loans'),
      color: '#ef4444', // red
    },
    {
      to: '/goals',
      icon: <Target size={22} />,
      label: t('nav.goals', 'Goals'),
      color: '#eab308', // gold
    },
    {
      to: '/calendar',
      icon: <Calendar size={22} />,
      label: t('nav.calendar', 'Calendar'),
      color: '#3b82f6', // blue
    },
    {
      to: '/reports/summary',
      icon: <BarChart2 size={22} />,
      label: t('nav.reports', 'Reports'),
      color: '#8b5cf6', // purple
    },
    {
      to: '/import',
      icon: <FileSpreadsheet size={22} />,
      label: t('nav.import', 'Import'),
      color: '#10b981', // green
    },
    {
      to: '/help',
      icon: <HelpCircle size={22} />,
      label: t('nav.help', 'Help'),
      color: '#6366f1', // indigo
    },
    {
      to: '/settings',
      icon: <Settings size={22} />,
      label: t('nav.settings', 'Settings'),
      color: '#64748b', // slate
    },
  ]

  const handleTileClick = (to: string) => {
    onClose()
    navigate(to)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('nav.moreFeatures', 'More Features')}
      size="md"
    >
      <div className="space-y-6 pt-1">
        {/* 3-Column Grid of Large Nav Tiles */}
        <div className="grid grid-cols-3 gap-3">
          {navTiles.map((tile) => (
            <button
              key={tile.to}
              type="button"
              onClick={() => handleTileClick(tile.to)}
              className={cn(
                'flex flex-col items-center justify-center p-3.5 rounded-2xl border',
                'bg-surface-elevated border-border/80 text-text hover:bg-surface-overlay hover:border-border',
                'transition-all duration-150 active:scale-95 group',
              )}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-2 shadow-xs group-hover:scale-105 transition-transform"
                style={{
                  backgroundColor: `${tile.color}15`,
                  color: tile.color,
                }}
              >
                {tile.icon}
              </div>
              <span className="text-xs font-semibold text-center truncate max-w-full">
                {tile.label}
              </span>
            </button>
          ))}
        </div>

        {/* Quick Toggles: Language & Theme */}
        <div className="pt-4 border-t border-border/70 flex items-center justify-between gap-3 flex-wrap">
          {/* Language Quick Toggle */}
          <button
            type="button"
            onClick={handleLanguageToggle}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/80 bg-surface-elevated hover:bg-surface-overlay text-xs font-medium text-text transition-colors"
          >
            <Globe size={15} className="text-primary" />
            <span>{currentLang === 'hi' ? '🇮🇳 हिन्दी' : '🇬🇧 English'}</span>
          </button>

          {/* Theme Quick Toggle */}
          <div className="flex items-center p-1 rounded-xl border border-border/80 bg-surface-elevated">
            {(['light', 'dark', 'system'] as Theme[]).map((thm) => (
              <button
                key={thm}
                type="button"
                onClick={() => setTheme(thm)}
                title={thm}
                className={cn(
                  'p-1.5 rounded-lg text-xs transition-colors',
                  theme === thm
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-text-muted hover:text-text',
                )}
              >
                {thm === 'light' ? <Sun size={14} /> : thm === 'dark' ? <Moon size={14} /> : <Monitor size={14} />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
