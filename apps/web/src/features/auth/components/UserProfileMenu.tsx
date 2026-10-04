import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  Settings,
  Wallet,
  BarChart2,
  HelpCircle,
  LogOut,
  User as UserIcon,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { Avatar, Badge } from '../../../ui'
import { cn } from '../../../lib/cn'

export function UserProfileMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const user = useAuthStore((s) => s.session?.user)
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)

  // Close on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const displayName =
    profile?.displayName?.trim() ||
    (user?.user_metadata?.full_name as string | undefined)?.trim() ||
    user?.email?.split('@')[0] ||
    t('profile.defaultName', 'My Profile')

  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) || null

  const handleNavigate = (path: string) => {
    setIsOpen(false)
    navigate(path)
  }

  const handleSignOut = async () => {
    setIsOpen(false)
    await signOut()
    navigate('/auth/sign-in')
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Profile Trigger Button / Tab */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={t('profile.menuLabel', 'User profile and account options')}
        className={cn(
          'flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl transition-all duration-150',
          'hover:bg-surface-overlay border border-transparent hover:border-border/60',
          'focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]',
          isOpen && 'bg-surface-overlay border-border/80 shadow-sm',
        )}
      >
        <div className="relative">
          <Avatar
            src={avatarUrl}
            name={displayName}
            size="sm"
            className="ring-2 ring-primary/40 ring-offset-1 ring-offset-surface"
          />
          <span
            className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success border-2 border-surface"
            aria-hidden="true"
          />
        </div>

        <div className="hidden sm:flex flex-col text-left">
          <span className="text-xs font-semibold text-text truncate max-w-[110px] leading-tight">
            {displayName}
          </span>
          <span className="text-[10px] text-text-muted leading-tight">
            {t('nav.settings', 'Settings')}
          </span>
        </div>

        <ChevronDown
          size={14}
          className={cn(
            'text-text-muted transition-transform duration-200 hidden sm:block',
            isOpen && 'rotate-180 text-text',
          )}
        />
      </button>

      {/* Profile Dropdown Popover */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className={cn(
            'absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-surface-elevated',
            'border border-border shadow-2xl z-50 overflow-hidden',
            'animate-in fade-in zoom-in-95 duration-150',
          )}
        >
          {/* User Profile Header Card */}
          <div className="p-3.5 border-b border-border bg-surface/60">
            <div className="flex items-center gap-3">
              <Avatar
                src={avatarUrl}
                name={displayName}
                size="md"
                className="ring-2 ring-primary/30"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text truncate">{displayName}</p>
                <p className="text-xs text-text-muted truncate">
                  {user?.email || t('auth.offlineMode', 'Offline Account')}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  {profile?.baseCurrency && (
                    <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                      {profile.baseCurrency}
                    </Badge>
                  )}
                  {profile?.locale && (
                    <Badge variant="neutral" size="sm" className="text-[10px]">
                      {profile.locale.toUpperCase()}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Profile-related Options */}
          <div className="p-1.5 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => handleNavigate('/settings')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs',
                'text-text hover:bg-surface-overlay transition-colors group min-h-[44px]',
              )}
            >
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors shrink-0">
                <Settings size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-text">{t('nav.settings', 'Settings & Profile')}</p>
                <p className="text-[11px] text-text-muted truncate">
                  Preferences, currency, security & PIN
                </p>
              </div>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => handleNavigate('/accounts')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs',
                'text-text hover:bg-surface-overlay transition-colors group min-h-[44px]',
              )}
            >
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors shrink-0">
                <Wallet size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-text">{t('nav.accounts', 'Accounts & Wallets')}</p>
                <p className="text-[11px] text-text-muted truncate">
                  Manage bank accounts and cards
                </p>
              </div>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => handleNavigate('/reports/summary')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs',
                'text-text hover:bg-surface-overlay transition-colors group min-h-[44px]',
              )}
            >
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors shrink-0">
                <BarChart2 size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-text">{t('nav.reports', 'Financial Reports')}</p>
                <p className="text-[11px] text-text-muted truncate">
                  Cash flow summaries & analytics
                </p>
              </div>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => handleNavigate('/help')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs',
                'text-text hover:bg-surface-overlay transition-colors group min-h-[44px]',
              )}
            >
              <div className="p-1.5 rounded-lg bg-surface text-text-muted group-hover:bg-surface-overlay group-hover:text-text transition-colors shrink-0">
                <HelpCircle size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-text">{t('help.title', 'Help & Guide')}</p>
                <p className="text-[11px] text-text-muted truncate">
                  Documentation and FAQ
                </p>
              </div>
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-border my-1" />

          {/* Log Out Option */}
          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs',
                'text-danger hover:bg-danger/10 transition-colors font-medium min-h-[44px]',
              )}
            >
              <div className="p-1.5 rounded-lg bg-danger/10 text-danger shrink-0">
                <LogOut size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{t('auth.signOut', 'Sign Out')}</p>
                <p className="text-[11px] text-text-muted truncate">
                  End current session on this device
                </p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
