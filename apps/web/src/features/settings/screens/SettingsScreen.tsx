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
  Card,
  CardTitle,
  Button,
  Input,
  Select,
  Badge,
  Modal,
  Avatar,
  Logo,
  BrandName,
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
} from 'lucide-react'
import type { Theme } from '@sanchay/shared'

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
    locale,
    setLocale,
    baseCurrency,
    setBaseCurrency,
    hideBalances,
    setHideBalances,
  } = useSettingsStore()

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

      // 1. Recompute all transaction base amounts
      await fxService.recomputeAllBaseAmounts(newCurrency, (processed, total) => {
        setConversionProgress({ processed, total })
      })

      // 2. Convert budgets if requested
      if (shouldConvertBudgets) {
        await fxService.convertAllBudgets(oldCurrency, newCurrency)
      }

      // 3. Update settings and profile
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
      // ignore localStorage quota errors
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

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-text">{t('settings.title', 'Settings')}</h1>
        <p className="text-sm text-text-muted mt-0.5">
          {t('settings.subtitle', 'Manage preferences, appearance, currency, and data')}
        </p>
      </div>

      {/* Account & Profile Card */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <User size={18} className="text-primary" />
            <span>{t('settings.profile', 'Account & Profile')}</span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Pencil size={13} />}
            onClick={() => setIsEditProfileOpen(true)}
          >
            {t('settings.editProfile', 'Edit Profile')}
          </Button>
        </div>

        <div className="flex items-center gap-4 p-3.5 bg-surface rounded-xl border border-border">
          <Avatar
            src={avatarUrl}
            name={displayName}
            size="lg"
            className="ring-2 ring-primary/30 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-text truncate">{displayName}</h3>
            <p className="text-xs text-text-muted truncate mt-0.5">
              {user?.email || t('auth.offlineMode', 'Offline Account')}
            </p>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
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

      {/* Appearance */}
      <Card className="space-y-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Sun size={18} className="text-primary" />
          <span>{t('settings.appearance', 'Appearance & Theme')}</span>
        </CardTitle>

        <div className="grid grid-cols-3 gap-3">
          {(['light', 'dark', 'system'] as Theme[]).map((thm) => (
            <button
              key={thm}
              type="button"
              onClick={() => setTheme(thm)}
              className={`p-3 rounded-xl border flex flex-col items-center gap-2 font-medium text-xs transition-all ${
                theme === thm
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface-elevated text-text hover:bg-surface-overlay'
              }`}
            >
              {thm === 'light' ? <Sun size={18} /> : thm === 'dark' ? <Moon size={18} /> : <Monitor size={18} />}
              <span className="capitalize">{t(`settings.theme.${thm}`, thm)}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Language & Currency */}
      <Card className="space-y-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe size={18} className="text-primary" />
          <span>{t('settings.localization', 'Language & Currency')}</span>
        </CardTitle>

        {/* 1-Tap Language Selection Buttons */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-text">
              {t('settings.language', 'App Language')}
            </label>
            <span className="text-[11px] text-text-muted">
              {currentLang === 'hi' ? 'हिन्दी सक्रिय है' : 'English active'}
            </span>
          </div>
          <p className="text-xs text-text-muted">
            {t('settings.languageDesc', 'Select your preferred language for the entire application')}
          </p>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleLanguageChange('en')}
              className={`p-3 rounded-xl border flex items-center justify-between gap-2 font-medium text-xs transition-all ${
                currentLang === 'en'
                  ? 'border-primary bg-primary/10 text-primary shadow-sm font-semibold'
                  : 'border-border bg-surface-elevated text-text hover:bg-surface-overlay'
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
              className={`p-3 rounded-xl border flex items-center justify-between gap-2 font-medium text-xs transition-all ${
                currentLang === 'hi'
                  ? 'border-primary bg-primary/10 text-primary shadow-sm font-semibold'
                  : 'border-border bg-surface-elevated text-text hover:bg-surface-overlay'
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <Select
            label={t('settings.language', 'Language')}
            value={currentLang}
            onChange={(e) => handleLanguageChange(e.target.value)}
            options={[
              { value: 'en', label: 'English' },
              { value: 'hi', label: 'हिन्दी (Hindi)' },
            ]}
          />

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
        </div>

        <Input
          type="number"
          min="1"
          max="28"
          label={t('settings.monthStartDay', 'Month Start Day (1 to 28)')}
          value={monthStartDay}
          onChange={(e) => handleMonthStartChange(e.target.value)}
          helperText={t('settings.monthStartHelper', 'Aligns monthly reports with your salary date (e.g. 1st or 25th)')}
        />
      </Card>

      {/* Privacy & App Lock */}
      <Card className="space-y-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield size={18} className="text-primary" />
          <span>{t('settings.privacy', 'Privacy & Security')}</span>
        </CardTitle>

        <div className="flex items-center justify-between p-3 bg-surface rounded-xl border border-border">
          <div>
            <span className="text-sm font-semibold text-text block">
              {t('settings.hideBalances', 'Hide Account Balances')}
            </span>
            <span className="text-xs text-text-muted">
              {t('settings.hideBalancesDesc', 'Mask balances on screens with dots (••••••) for privacy in public')}
            </span>
          </div>
          <Button
            variant={hideBalances ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setHideBalances(!hideBalances)}
          >
            {hideBalances ? <EyeOff size={16} /> : <Eye size={16} />}
          </Button>
        </div>

        <div className="flex items-center justify-between p-3 bg-surface rounded-xl border border-border">
          <div>
            <span className="text-sm font-semibold text-text block">
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
                >
                  {t('settings.changePin', 'Change PIN')}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleRemovePin}
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
              >
                {t('settings.setPin', 'Set PIN')}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Cloud Sync & Backup */}
      <Card className="space-y-4">
        <CardTitle className="text-base flex items-center gap-2">
          <RefreshCw size={18} className="text-primary" />
          <span>{t('settings.syncAndData', 'Cloud Sync & Data Backup')}</span>
        </CardTitle>

        <div className="flex items-center justify-between p-3 bg-surface rounded-xl border border-border text-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text">{t('settings.syncStatus', 'Sync Status')}:</span>
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
          >
            {t('settings.syncNow', 'Sync Now')}
          </Button>
        </div>

        <div className="pt-2">
          <Button
            variant="secondary"
            className="w-full"
            leftIcon={<Download size={16} />}
            isLoading={isExporting}
            onClick={handleFullExport}
          >
            {t('settings.exportAll', 'Export All Data as JSON Backup')}
          </Button>
        </div>
      </Card>

      {/* Account Lifecycle */}
      <Card className="space-y-4 border-danger/30">
        <CardTitle className="text-base text-danger flex items-center gap-2">
          <LogOut size={18} />
          <span>{t('settings.accountSecurity', 'Account & Security')}</span>
        </CardTitle>

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

      {/* App Branding & Version */}
      <div className="flex flex-col items-center justify-center py-6 text-center space-y-2">
        <button
          type="button"
          onClick={() => navigate('/help')}
          className="inline-flex items-center gap-2.5 group hover:opacity-90 transition-opacity"
        >
          <Logo size={28} className="shadow-sm rounded-lg group-hover:scale-105 transition-transform" />
          <BrandName className="text-base text-text group-hover:text-primary transition-colors" />
        </button>
        <p className="text-xs text-text-muted">
          Version 1.0.0 • 100% Offline-First Personal Finance
        </p>
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

          <div className="flex items-center gap-2 p-3 bg-surface rounded-xl border border-border">
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
    </div>
  )
}
