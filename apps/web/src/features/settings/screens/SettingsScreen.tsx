import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../auth/stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useSyncStore } from '../../sync/stores/syncStore'
import { syncEngine } from '../../sync/services/syncEngine'
import { profileRepo } from '../../../db/repositories/profileRepo'
import { db } from '../../../db/db'
import {
  Page,
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Badge,
  Modal,
  Avatar,
  Logo,
  BrandName,
  SegmentedControl,
} from '../../../ui'
import { EditProfileModal } from '../../auth/components/EditProfileModal'
import { fxService } from '../../fx/services/fxService'
import { useAppLock } from '../../auth/hooks/useAppLock'
import {
  Moon,
  Sun,
  Monitor,
  Globe,
  Shield,
  Download,
  RefreshCw,
  LogOut,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  User,
  Pencil,
  Check,
  Palette,
  Database,
  Info,
  ChevronRight,
} from 'lucide-react'
import type { Theme } from '@sanchay/shared'
import type { Accent } from '../stores/settingsStore'

const ACCENTS: Array<{ id: Accent; label: string; color: string }> = [
  { id: 'teal', label: 'Teal', color: '#0F766E' },
  { id: 'blue', label: 'Blue', color: '#2563EB' },
  { id: 'violet', label: 'Violet', color: '#7C3AED' },
  { id: 'rose', label: 'Rose', color: '#E11D48' },
  { id: 'amber', label: 'Amber', color: '#D97706' },
  { id: 'emerald', label: 'Emerald', color: '#059669' },
]

type SettingsTab = 'profile' | 'preferences' | 'security' | 'data' | 'account' | 'about'

export default function SettingsScreen() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.session?.user)
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const signOutAll = useAuthStore((s) => s.signOutAll)
  const deleteAccount = useAuthStore((s) => s.deleteAccount)

  const {
    theme,
    setTheme,
    accent,
    setAccent,
    locale,
    setLocale,
    baseCurrency,
    setBaseCurrency,
    hideBalances,
    setHideBalances,
  } = useSettingsStore()

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false)

  const displayName =
    profile?.displayName ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'User'

  const avatarUrl =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.id ? localStorage.getItem(`sanchay_user_avatar_${user.id}`) : null) ||
    null

  const { hasPin, setPin, removePin } = useAppLock()
  const [isPinModalOpen, setIsPinModalOpen] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault()
    setPinError(null)
    if (!/^\d{4,6}$/.test(newPin)) {
      setPinError('PIN must be 4 to 6 numeric digits')
      return
    }
    if (newPin !== confirmPin) {
      setPinError('PINs do not match')
      return
    }
    await setPin(newPin)
    setIsPinModalOpen(false)
    setNewPin('')
    setConfirmPin('')
  }

  const handleRemovePin = async () => {
    if (window.confirm('Are you sure you want to remove the PIN lock?')) {
      await removePin()
    }
  }

  const { status: syncStatus, lastSyncAt, pendingCount } = useSyncStore()
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [monthStartDay, setMonthStartDay] = useState(profile?.monthStartDay?.toString() ?? '1')

  // Base Currency Change Migration State
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null)
  const [shouldConvertBudgets, setShouldConvertBudgets] = useState(true)
  const [isConvertingCurrency, setIsConvertingCurrency] = useState(false)
  const [conversionProgress, setConversionProgress] = useState<{ processed: number; total: number } | null>(null)

  const handleConfirmCurrencyChange = async () => {
    if (!pendingCurrency) return
    setIsConvertingCurrency(true)
    setConversionProgress({ processed: 0, total: 1 })

    try {
      const oldCurrency = baseCurrency
      const newCurrency = pendingCurrency

      await fxService.recomputeAllBaseAmounts(newCurrency, (processed, total) => {
        setConversionProgress({ processed, total })
      })

      if (shouldConvertBudgets) {
        await fxService.convertAllBudgets(oldCurrency, newCurrency)
      }

      setBaseCurrency(newCurrency)
      if (user) {
        await profileRepo.update(user.id, { baseCurrency: newCurrency })
      }

      setPendingCurrency(null)
    } catch (err) {
      console.error('Failed to change base currency:', err)
      alert('Failed to change base currency. Please try again.')
    } finally {
      setIsConvertingCurrency(false)
      setConversionProgress(null)
    }
  }

  // Active language resolution
  const currentLang = (i18n.resolvedLanguage || i18n.language || locale || 'en').startsWith('hi') ? 'hi' : 'en'

  const handleLanguageChange = async (lang: string) => {
    const newLocale = lang === 'hi' ? 'hi-IN' : 'en-IN'
    setLocale(newLocale)
    try {
      localStorage.setItem('i18nextLng', lang)
    } catch {
      // ignore
    }
    await i18n.changeLanguage(lang)
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
    }
    if (user) {
      void profileRepo.update(user.id, { locale: newLocale })
    }
  }

  const handleMonthStartChange = async (dayStr: string) => {
    setMonthStartDay(dayStr)
    const day = parseInt(dayStr, 10) || 1
    if (user) {
      await profileRepo.update(user.id, { monthStartDay: day })
    }
  }

  const handleFullExport = async () => {
    setIsExporting(true)
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        version: 1,
        profiles: await db.profiles.toArray(),
        accounts: await db.accounts.toArray(),
        transactions: await db.transactions.toArray(),
        categories: await db.categories.toArray(),
        tags: await db.tags.toArray(),
        budgets: await db.budgets.toArray(),
        recurringRules: await db.recurringRules.toArray(),
        goals: await db.goals.toArray(),
      }

      const jsonStr = JSON.stringify(data, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `sanchay-backup-${new Date().toISOString().substring(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  const handleManualSync = () => {
    syncEngine.triggerSync(true)
  }

  const handleDeleteAccount = async () => {
    const confirmation = window.prompt(
      'WARNING: This will permanently delete your account, transactions, and cloud data. Type "DELETE" to confirm:',
    )
    if (confirmation === 'DELETE') {
      setIsDeleting(true)
      try {
        await deleteAccount()
        navigate('/auth/sign-in')
      } catch {
        alert('Failed to delete account. Please try again.')
      } finally {
        setIsDeleting(false)
      }
    }
  }

  const navItems = [
    { id: 'profile' as const, label: t('settings.profile', 'Profile'), icon: User },
    { id: 'preferences' as const, label: t('settings.preferences', 'Preferences'), icon: Palette },
    { id: 'security' as const, label: t('settings.privacy', 'Security'), icon: Shield },
    { id: 'data' as const, label: t('settings.syncAndData', 'Data & Sync'), icon: Database },
    { id: 'account' as const, label: t('settings.accountSecurity', 'Account'), icon: LogOut },
    { id: 'about' as const, label: t('settings.about', 'About'), icon: Info },
  ]

  return (
    <Page width="default" className="space-y-6">
      <PageHeader
        title={t('settings.title', 'Settings')}
        subtitle={t('settings.subtitle', 'Manage preferences, appearance, currency, and data')}
      />

      {/* Two-pane layout on desktop (Left navigation 4 cols, Right content 8 cols) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Navigation list */}
        <div className="md:col-span-4 space-y-1">
          {/* Mobile horizontal segmented control */}
          <div className="md:hidden overflow-x-auto no-scrollbar -mx-1 px-1 pb-2">
            <div className="inline-flex p-1 bg-surface-overlay/80 backdrop-blur-xs rounded-xl border border-border/50 gap-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-text-muted hover:text-text hover:bg-surface-elevated/60'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Desktop vertical sidebar card */}
          <Card className="hidden md:block p-2 rounded-2xl border border-border/60 divide-y divide-border/30">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full text-left p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-text-muted hover:text-text hover:bg-surface-overlay'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} className={isActive ? 'text-primary-foreground' : 'text-primary'} />
                    <span>{item.label}</span>
                  </div>
                  <ChevronRight size={14} className={isActive ? 'text-primary-foreground/80' : 'text-text-muted/60'} />
                </button>
              )
            })}
          </Card>
        </div>

        {/* Content Pane */}
        <div className="md:col-span-8 space-y-6">
          {/* PROFILE SECTION */}
          {activeTab === 'profile' && (
            <Card className="p-6 rounded-3xl space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-2.5">
                  <User size={18} className="text-primary" />
                  <h2 className="text-base font-bold text-text">{t('settings.profile', 'Profile')}</h2>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Pencil size={13} />}
                  onClick={() => setIsEditProfileOpen(true)}
                  className="h-8 text-xs"
                >
                  {t('settings.editProfile', 'Edit Profile')}
                </Button>
              </div>

              <div className="flex items-center gap-4 p-4 bg-surface-elevated rounded-2xl border border-border/50">
                <Avatar
                  src={avatarUrl}
                  name={displayName}
                  size="lg"
                  className="ring-2 ring-primary/40 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-black text-text truncate">{displayName}</h3>
                  <p className="text-xs text-text-muted truncate mt-0.5">
                    {user?.email || t('auth.offlineMode', 'Offline Account')}
                  </p>
                  <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                    <Badge variant="neutral" size="sm" className="font-mono text-[10px]">
                      {profile?.baseCurrency || baseCurrency}
                    </Badge>
                    <Badge variant="neutral" size="sm" className="text-[10px]">
                      {currentLang === 'hi' ? 'हिन्दी (Hindi)' : 'English'}
                    </Badge>
                    {hasPin && (
                      <Badge variant="success" size="sm" className="text-[10px]">
                        PIN Locked
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* PREFERENCES SECTION */}
          {activeTab === 'preferences' && (
            <Card className="p-6 rounded-3xl space-y-6">
              <div className="flex items-center gap-2.5 pb-3 border-b border-border/40">
                <Palette size={18} className="text-primary" />
                <h2 className="text-base font-bold text-text">{t('settings.preferences', 'Preferences')}</h2>
              </div>

              {/* Theme Picker via SegmentedControl */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-text uppercase tracking-wider block">
                  {t('settings.appearance', 'Appearance & Theme')}
                </label>
                <SegmentedControl
                  value={theme}
                  onChange={(v) => setTheme(v as Theme)}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                  size="md"
                  className="w-full"
                />

                {/* Interactive Accent Picker */}
                <div className="space-y-2.5 pt-3 border-t border-border/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text uppercase tracking-wider block">
                      Accent Color
                    </span>
                    <span className="text-[11px] text-text-muted capitalize">
                      Active: {accent || 'teal'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                    {ACCENTS.map((item) => {
                      const isSelected = (accent || 'teal') === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setAccent(item.id)}
                          className={`p-2.5 rounded-xl border flex flex-col items-center gap-2 text-xs font-semibold transition-all ${
                            isSelected
                              ? 'border-primary ring-2 ring-primary/30 bg-surface-overlay text-text font-bold shadow-xs'
                              : 'border-border/60 bg-surface-elevated text-text-muted hover:text-text hover:bg-surface-overlay'
                          }`}
                          aria-label={`Select ${item.label} accent`}
                          aria-pressed={isSelected}
                        >
                          <div className="relative">
                            <span
                              className="w-6 h-6 rounded-full block border border-white/20 shadow-xs"
                              style={{ backgroundColor: item.color }}
                            />
                            {isSelected && (
                              <Check size={13} className="absolute inset-0 m-auto text-white stroke-[3] drop-shadow-xs" />
                            )}
                          </div>
                          <span className="text-[11px] truncate w-full text-center">{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Language Selection */}
              <div className="space-y-3 pt-4 border-t border-border/40">
                <label className="text-xs font-bold text-text uppercase tracking-wider block">
                  {t('settings.language', 'App Language')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('en')}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 font-bold text-xs transition-all ${
                      currentLang === 'en'
                        ? 'border-primary bg-primary/10 text-primary shadow-xs'
                        : 'border-border/60 bg-surface-elevated text-text hover:bg-surface-overlay'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base" role="img" aria-label="UK flag">🇬🇧</span>
                      <span>English</span>
                    </div>
                    {currentLang === 'en' && <Check size={16} className="text-primary shrink-0" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLanguageChange('hi')}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 font-bold text-xs transition-all ${
                      currentLang === 'hi'
                        ? 'border-primary bg-primary/10 text-primary shadow-xs'
                        : 'border-border/60 bg-surface-elevated text-text hover:bg-surface-overlay'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base" role="img" aria-label="India flag">🇮🇳</span>
                      <span className="font-hindi text-sm">हिन्दी (Hindi)</span>
                    </div>
                    {currentLang === 'hi' && <Check size={16} className="text-primary shrink-0" />}
                  </button>
                </div>
              </div>

              {/* Currency & Month Start */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border/40">
                <Select
                  label={t('settings.baseCurrency', 'Base Currency')}
                  value={baseCurrency}
                  onChange={(e) => {
                    if (e.target.value !== baseCurrency) {
                      setPendingCurrency(e.target.value)
                    }
                  }}
                  options={[
                    { value: 'INR', label: 'INR (₹) - Indian Rupee' },
                    { value: 'USD', label: 'USD ($) - US Dollar' },
                    { value: 'EUR', label: 'EUR (€) - Euro' },
                    { value: 'GBP', label: 'GBP (£) - British Pound' },
                    { value: 'AED', label: 'AED (د.إ) - UAE Dirham' },
                  ]}
                />

                <Input
                  type="number"
                  min="1"
                  max="28"
                  label={t('settings.monthStartDay', 'Month Start Day (1 to 28)')}
                  value={monthStartDay}
                  onChange={(e) => handleMonthStartChange(e.target.value)}
                  helperText={t('settings.monthStartHelper', 'Aligns monthly reports with your salary date')}
                />
              </div>
            </Card>
          )}

          {/* SECURITY & PRIVACY SECTION */}
          {activeTab === 'security' && (
            <Card className="p-6 rounded-3xl space-y-6">
              <div className="flex items-center gap-2.5 pb-3 border-b border-border/40">
                <Shield size={18} className="text-primary" />
                <h2 className="text-base font-bold text-text">{t('settings.privacy', 'Privacy & Security')}</h2>
              </div>

              <div className="flex items-center justify-between p-4 bg-surface-elevated rounded-2xl border border-border/50">
                <div>
                  <span className="text-sm font-bold text-text block">
                    {t('settings.hideBalances', 'Hide Account Balances')}
                  </span>
                  <span className="text-xs text-text-muted">
                    {t('settings.hideBalancesDesc', 'Mask amounts across all screens for privacy in public')}
                  </span>
                </div>
                <Button
                  variant={hideBalances ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setHideBalances(!hideBalances)}
                  className="h-9 px-3"
                >
                  {hideBalances ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-surface-elevated rounded-2xl border border-border/50">
                <div>
                  <span className="text-sm font-bold text-text block">
                    {t('settings.pinLock', 'PIN App Lock')}
                  </span>
                  <span className="text-xs text-text-muted">
                    {hasPin
                      ? t('settings.pinLockActive', 'PIN protection active • Locks when app is minimized or hidden.')
                      : t('settings.pinLockInactive', 'Require a 4 to 6-digit PIN to open the app.')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {hasPin ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPinError(null)
                          setNewPin('')
                          setConfirmPin('')
                          setIsPinModalOpen(true)
                        }}
                        className="h-8 text-xs"
                      >
                        {t('settings.changePin', 'Change')}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleRemovePin}
                        className="h-8 text-xs"
                      >
                        {t('settings.removePin', 'Remove')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Lock size={14} />}
                      onClick={() => {
                        setPinError(null)
                        setNewPin('')
                        setConfirmPin('')
                        setIsPinModalOpen(true)
                      }}
                      className="h-8 text-xs"
                    >
                      {t('settings.setPin', 'Set PIN')}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* DATA & SYNC SECTION */}
          {activeTab === 'data' && (
            <Card className="p-6 rounded-3xl space-y-6">
              <div className="flex items-center gap-2.5 pb-3 border-b border-border/40">
                <Database size={18} className="text-primary" />
                <h2 className="text-base font-bold text-text">{t('settings.syncAndData', 'Cloud Sync & Data Backup')}</h2>
              </div>

              <div className="flex items-center justify-between p-4 bg-surface-elevated rounded-2xl border border-border/50 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-text">{t('settings.syncStatus', 'Sync Status')}:</span>
                    <Badge variant={syncStatus === 'synced' ? 'success' : syncStatus === 'error' ? 'danger' : 'neutral'}>
                      {syncStatus}
                    </Badge>
                  </div>
                  <p className="text-text-muted mt-1">
                    {t('settings.lastSynced', 'Last synced')}: {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : t('settings.never', 'Never')}
                    {pendingCount > 0 ? ` • ${t('settings.pendingChanges', { count: pendingCount, defaultValue: `${pendingCount} pending local changes` })}` : ''}
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<RefreshCw size={14} />}
                  onClick={handleManualSync}
                  className="h-8 text-xs"
                >
                  {t('settings.syncNow', 'Sync Now')}
                </Button>
              </div>

              <Button
                variant="secondary"
                className="w-full"
                leftIcon={<Download size={16} />}
                isLoading={isExporting}
                onClick={handleFullExport}
              >
                {t('settings.exportAll', 'Export All Data as JSON Backup')}
              </Button>
            </Card>
          )}

          {/* ACCOUNT & SECURITY SECTION */}
          {activeTab === 'account' && (
            <Card className="p-6 rounded-3xl space-y-6 border-danger/30">
              <div className="flex items-center gap-2.5 pb-3 border-b border-border/40 text-danger">
                <LogOut size={18} />
                <h2 className="text-base font-bold">{t('settings.accountSecurity', 'Account & Security')}</h2>
              </div>

              <p className="text-xs text-text-muted leading-relaxed">
                Manage sessions and account termination. Sign out from this device or all active sessions.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={async () => {
                    await signOut()
                    navigate('/auth/sign-in')
                  }}
                >
                  {t('settings.signOut', 'Sign Out')}
                </Button>

                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={async () => {
                    if (window.confirm('Sign out from all active devices and sessions?')) {
                      await signOutAll()
                      navigate('/auth/sign-in')
                    }
                  }}
                >
                  {t('settings.signOutAll', 'Sign Out Everywhere')}
                </Button>

                <Button
                  variant="danger"
                  className="flex-1"
                  isLoading={isDeleting}
                  onClick={handleDeleteAccount}
                >
                  {t('settings.deleteAccount', 'Delete Account')}
                </Button>
              </div>
            </Card>
          )}

          {/* ABOUT SECTION */}
          {activeTab === 'about' && (
            <Card className="p-6 rounded-3xl space-y-6">
              <div className="flex items-center gap-2.5 pb-3 border-b border-border/40">
                <Info size={18} className="text-primary" />
                <h2 className="text-base font-bold text-text">{t('settings.about', 'About')}</h2>
              </div>

              <div className="flex flex-col items-center justify-center py-4 text-center space-y-3">
                <Logo size={48} className="shadow-md rounded-2xl" />
                <BrandName className="text-2xl text-text" />
                <p className="text-xs text-text-muted max-w-sm">
                  Offline-first personal finance with Dexie.js local storage and Supabase cloud sync.
                </p>
                <Badge variant="neutral" size="sm" className="font-mono text-xs">
                  Version 1.0.0
                </Badge>
              </div>

              {/* Developer details */}
              <div className="p-4 rounded-2xl bg-surface-elevated border border-border/50 text-xs space-y-1.5">
                <p className="font-bold text-text">Developer Information</p>
                <p className="text-text-muted">Mritunjay Pandey</p>
                <p className="text-text-muted">GitHub: @mritunjaylive</p>
                <p className="text-text-muted">Website: mritunjaylive.in</p>
                <p className="text-text-muted">Email: mritunjay@mritunjaylive.in</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
      />

      {/* Base Currency Change Modal (Spec 8.6) */}
      <Modal
        isOpen={Boolean(pendingCurrency)}
        onClose={() => {
          if (!isConvertingCurrency) setPendingCurrency(null)
        }}
        title={`Change Base Currency to ${pendingCurrency}?`}
      >
        <div className="space-y-4">
          <div className="p-3 bg-warning/10 border border-warning/30 rounded-xl flex items-start gap-2.5 text-warning text-xs leading-relaxed">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Important Information:</p>
              <p className="mt-1">
                Changing your base currency will recompute the base reporting amounts for all existing
                transactions using historical exchange rates. Reports and net worth charts will now display in{' '}
                <strong className="text-text">{pendingCurrency}</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-surface-elevated rounded-xl border border-border">
            <input
              type="checkbox"
              id="convertBudgetsCheckbox"
              checked={shouldConvertBudgets}
              disabled={isConvertingCurrency}
              onChange={(e) => setShouldConvertBudgets(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="convertBudgetsCheckbox" className="text-xs font-medium text-text select-none cursor-pointer">
              Convert existing budget amounts using current exchange rate
            </label>
          </div>

          {/* Progress bar during migration */}
          {isConvertingCurrency && conversionProgress && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs text-text-muted">
                <span>Updating transactions...</span>
                <span>
                  {conversionProgress.processed} / {conversionProgress.total}
                </span>
              </div>
              <div className="w-full h-2 bg-surface-overlay rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-150"
                  style={{
                    width: `${Math.round((conversionProgress.processed / Math.max(1, conversionProgress.total)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              disabled={isConvertingCurrency}
              onClick={() => setPendingCurrency(null)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              isLoading={isConvertingCurrency}
              onClick={handleConfirmCurrencyChange}
            >
              Confirm Currency Change
            </Button>
          </div>
        </div>
      </Modal>

      {/* PIN Setup / Change Modal (Spec F-073) */}
      <Modal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        title={hasPin ? 'Change Application PIN' : 'Set Application PIN'}
      >
        <form onSubmit={handleSavePin} className="space-y-4">
          <p className="text-xs text-text-muted leading-relaxed">
            Choose a 4 to 6 digit security PIN. Your PIN is hashed with a cryptographic salt using the Web Crypto API
            and stored exclusively on this device.
          </p>

          {pinError && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-xs text-danger font-medium">
              {pinError}
            </div>
          )}

          <Input
            type="password"
            label="Enter PIN (4-6 digits)"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder="••••"
            required
          />

          <Input
            type="password"
            label="Confirm PIN"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            placeholder="••••"
            required
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPinModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save PIN
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
  )
}
