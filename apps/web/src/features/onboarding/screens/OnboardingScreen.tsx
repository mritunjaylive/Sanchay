import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../auth/stores/authStore'
import { Button, Input, Select, Card, Logo, BrandName } from '../../../ui'
import { accountRepo } from '../../../db/repositories/accountRepo'
import { categoryRepo } from '../../../db/repositories/categoryRepo'
import { profileRepo } from '../../../db/repositories/profileRepo'
import { requestPersistentStorage } from '../../../db/db'
import { db } from '../../../db/db'
import { parseAmountToMinor } from '../../../lib/money'
import {
  Globe,
  Wallet,
  Check,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Landmark,
  Banknote,
  Smartphone,
  PiggyBank,
} from 'lucide-react'
import type { AccountKind } from '@sanchay/shared'

export default function OnboardingScreen() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.session?.user)
  const setProfile = useAuthStore((s) => s.setProfile)

  const [step, setStep] = useState(1)
  const [language, setLanguage] = useState<'en' | 'hi'>('en')
  const [baseCurrency, setBaseCurrency] = useState('INR')
  const [accountName, setAccountName] = useState(t('onboarding.defaultAccountName', 'Main Bank'))
  const [accountKind, setAccountKind] = useState<AccountKind>('bank')
  const [openingBalanceStr, setOpeningBalanceStr] = useState('0')
  const [isLoading, setIsLoading] = useState(false)

  const handleLanguageChange = (lang: 'en' | 'hi') => {
    setLanguage(lang)
    void i18n.changeLanguage(lang)
    document.documentElement.lang = lang
    localStorage.setItem('i18nextLng', lang)
  }

  const handleFinish = async () => {
    if (!user) return
    setIsLoading(true)

    try {
      void requestPersistentStorage()

      // P0-B: Only seed categories if none exist yet (after hydration may have pulled them)
      const existingCategories = await db.categories.filter((c) => !c.deletedAt && c.userId === user.id).count()
      if (existingCategories === 0) {
        await categoryRepo.seedDefaultCategories(user.id)
      }

      // P0-B: Only create starter account if user has no accounts yet
      const existingAccounts = await db.accounts.filter((a) => !a.deletedAt && a.userId === user.id).count()
      if (existingAccounts === 0) {
        const openingMinor = parseAmountToMinor(openingBalanceStr || '0', baseCurrency)
        await accountRepo.create({
          userId: user.id,
          name: accountName.trim() || t('onboarding.defaultAccountName', 'Main Account'),
          kind: accountKind,
          currency: baseCurrency,
          openingBalanceMinor: openingMinor,
          openingDate: new Date().toISOString().substring(0, 10),
          creditLimitMinor: null,
          statementDay: null,
          dueDay: null,
          note: null,
          excludeFromNetWorth: false,
          icon: accountKind === 'cash' ? 'Banknote' : accountKind === 'wallet' ? 'Smartphone' : 'Landmark',
          color: '#0F766E',
          sortOrder: 0,
          archivedAt: null,
        })
      }

      const updatedProfile = await profileRepo.update(user.id, {
        baseCurrency,
        locale: language === 'hi' ? 'hi-IN' : 'en-IN',
        onboardedAt: new Date().toISOString(),
      })

      // Set the per-user onboarded hint so offline relaunches don't flash onboarding
      localStorage.setItem(`sanchay_onboarded_${user.id}`, '1')

      setProfile(updatedProfile)
      // P0-B: use replace so Back doesn't return to onboarding
      navigate('/', { replace: true })
    } catch (err) {
      console.error('Failed to complete onboarding:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSkip = async () => {
    if (!user) return
    setIsLoading(true)
    try {
      void requestPersistentStorage()

      // Even on skip: seed categories if none exist
      const existingCategories = await db.categories.filter((c) => !c.deletedAt && c.userId === user.id).count()
      if (existingCategories === 0) {
        await categoryRepo.seedDefaultCategories(user.id)
      }

      const updatedProfile = await profileRepo.update(user.id, {
        baseCurrency,
        locale: language === 'hi' ? 'hi-IN' : 'en-IN',
        onboardedAt: new Date().toISOString(),
      })

      localStorage.setItem(`sanchay_onboarded_${user.id}`, '1')
      setProfile(updatedProfile)
      navigate('/', { replace: true })
    } catch (err) {
      console.error('Failed to skip onboarding:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-surface flex flex-col justify-between items-center p-4 sm:p-6 transition-colors">
      {/* Top Bar with Logo & Skip */}
      <header className="w-full max-w-lg flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <Logo size={32} className="shadow-xs rounded-xl" />
          <BrandName className="text-lg text-text" />
        </div>

        {step < 3 && (
          <button
            type="button"
            onClick={() => void handleSkip()}
            disabled={isLoading}
            className="text-xs font-semibold text-text-muted hover:text-text px-3 py-1.5 rounded-lg hover:bg-surface-overlay transition-colors disabled:opacity-50"
          >
            {t('common.skip', 'Skip Setup')}
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <div className="w-full max-w-lg my-auto py-6">
        {/* Progress Stepper Dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                s === step
                  ? 'w-8 bg-primary shadow-xs'
                  : s < step
                  ? 'w-2.5 bg-success'
                  : 'w-2 bg-border'
              }`}
            />
          ))}
        </div>

        {/* STEP 1: Language & Currency */}
        {step === 1 && (
          <Card className="p-6 sm:p-8 rounded-3xl space-y-6 shadow-lg border-border/60">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-text">
                {t('onboarding.welcome', 'Welcome to')} <BrandName />
              </h2>
              <p className="text-xs sm:text-sm text-text-muted">
                {t('onboarding.step1Desc', 'Choose your preferred language and base reporting currency')}
              </p>
            </div>

            {/* Language Selection Large Cards */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                {t('settings.language', 'Language')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleLanguageChange('en')}
                  className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${
                    language === 'en'
                      ? 'border-primary ring-2 ring-primary/30 bg-primary/10 text-primary font-bold shadow-xs'
                      : 'border-border/60 bg-surface-elevated text-text hover:bg-surface-overlay font-medium'
                  }`}
                >
                  <span className="text-2xl" role="img" aria-label={t('onboarding.ukFlagLabel', 'UK flag')}>🇬🇧</span>
                  <span className="text-sm">English</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLanguageChange('hi')}
                  className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${
                    language === 'hi'
                      ? 'border-primary ring-2 ring-primary/30 bg-primary/10 text-primary font-bold shadow-xs'
                      : 'border-border/60 bg-surface-elevated text-text hover:bg-surface-overlay font-medium'
                  }`}
                >
                  <span className="text-2xl" role="img" aria-label={t('onboarding.indiaFlagLabel', 'India flag')}>🇮🇳</span>
                  <span className="font-hindi text-base">हिन्दी</span>
                </button>
              </div>
            </div>

            {/* Base Currency Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                {t('settings.baseCurrency', 'Base Currency')}
              </label>
              <Select
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                options={[
                  { value: 'INR', label: 'INR (₹) - Indian Rupee' },
                  { value: 'USD', label: 'USD ($) - US Dollar' },
                  { value: 'EUR', label: 'EUR (€) - Euro' },
                  { value: 'GBP', label: 'GBP (£) - British Pound' },
                  { value: 'AED', label: 'AED (د.إ) - UAE Dirham' },
                  { value: 'SGD', label: 'SGD (S$) - Singapore Dollar' },
                  { value: 'JPY', label: 'JPY (¥) - Japanese Yen' },
                ]}
              />
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              rightIcon={<ArrowRight size={18} />}
              onClick={() => setStep(2)}
            >
              {t('common.continue', 'Continue')}
            </Button>
          </Card>
        )}

        {/* STEP 2: Primary Account Setup */}
        {step === 2 && (
          <Card className="p-6 sm:p-8 rounded-3xl space-y-6 shadow-lg border-border/60">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto">
                <Wallet size={24} />
              </div>
              <h2 className="text-2xl font-black text-text">
                {t('onboarding.setupFirstAccount', 'Set up your first account')}
              </h2>
              <p className="text-xs sm:text-sm text-text-muted">
                {t('onboarding.step2Desc', 'Add your primary bank, cash in hand, or wallet')}
              </p>
            </div>

            {/* Large Option Cards for Account Kind */}
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { kind: 'bank' as const, label: t('accounts.kind.bank', 'Bank Account'), icon: Landmark },
                { kind: 'cash' as const, label: t('accounts.kind.cash', 'Cash in Hand'), icon: Banknote },
                { kind: 'wallet' as const, label: t('accounts.kind.wallet', 'Digital Wallet'), icon: Smartphone },
                { kind: 'savings' as const, label: t('accounts.kind.savings', 'Savings Account'), icon: PiggyBank },
              ].map((opt) => {
                const Icon = opt.icon
                const isSelected = accountKind === opt.kind
                return (
                  <button
                    key={opt.kind}
                    type="button"
                    onClick={() => {
                      setAccountKind(opt.kind)
                      if (!accountName || accountName === t('onboarding.defaultAccountName', 'Main Bank') || accountName === 'Cash' || accountName === 'UPI Wallet') {
                        setAccountName(
                          opt.kind === 'cash'
                            ? t('onboarding.cashAccountName', 'Cash')
                            : opt.kind === 'wallet'
                            ? t('onboarding.walletAccountName', 'UPI Wallet')
                            : t('onboarding.defaultAccountName', 'Main Bank'),
                        )
                      }
                    }}
                    className={`p-3 rounded-2xl border flex items-center gap-2.5 text-left transition-all ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/30 bg-primary/10 text-primary font-bold shadow-xs'
                        : 'border-border/60 bg-surface-elevated text-text hover:bg-surface-overlay font-medium'
                    }`}
                  >
                    <Icon size={18} className={isSelected ? 'text-primary' : 'text-text-muted'} />
                    <span className="text-xs">{opt.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="space-y-3 pt-2">
              <Input
                label={t('accounts.accountName', 'Account Name')}
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder={t('accounts.accountNamePlaceholder', 'e.g. HDFC Bank, Cash Wallet')}
                required
              />

              <Input
                type="text"
                inputMode="decimal"
                label={t('accounts.openingBalance', 'Opening Balance')}
                value={openingBalanceStr}
                onChange={(e) => setOpeningBalanceStr(e.target.value)}
                placeholder="0.00"
                helperText={t('accounts.openingBalanceHelper', 'Current balance as of today')}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setStep(1)}
                leftIcon={<ArrowLeft size={18} />}
                className="flex-1"
              >
                {t('common.back', 'Back')}
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={() => setStep(3)}
                rightIcon={<ArrowRight size={18} />}
                className="flex-1"
              >
                {t('common.continue', 'Continue')}
              </Button>
            </div>
          </Card>
        )}

        {/* STEP 3: Celebratory Screen */}
        {step === 3 && (
          <Card className="p-6 sm:p-8 rounded-3xl space-y-6 shadow-xl border-amber-500/20 text-center relative overflow-hidden">
            {/* Celebratory golden mesh glow */}
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-amber-500/20 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-primary/20 blur-2xl pointer-events-none" />

            <div className="relative z-10 space-y-2">
              <div className="w-16 h-16 bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-3xl flex items-center justify-center mx-auto shadow-xs animate-bounce duration-1000">
                <Sparkles size={32} />
              </div>
              <h2 className="text-3xl font-black text-text">
                {t('onboarding.allSet', "You're all set!")}
              </h2>
              <p className="text-xs sm:text-sm text-text-muted max-w-sm mx-auto">
                {t('onboarding.readyMsg', 'Your offline database and standard categories are ready. You are in total control.')}
              </p>
            </div>

            {/* Checklist */}
            <div className="relative z-10 p-4 rounded-2xl bg-surface-elevated border border-border/50 text-left space-y-2.5 text-xs">
              <div className="flex items-center gap-2.5 text-text font-medium">
                <div className="w-5 h-5 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
                  <Check size={12} />
                </div>
                <span>{t('onboarding.offlineReady', '100% offline-first Dexie database configured')}</span>
              </div>
              <div className="flex items-center gap-2.5 text-text font-medium">
                <div className="w-5 h-5 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
                  <Check size={12} />
                </div>
                <span>{t('onboarding.categoriesConfigured', '18 curated categories seeded')}</span>
              </div>
              <div className="flex items-center gap-2.5 text-text font-medium">
                <div className="w-5 h-5 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
                  <Check size={12} />
                </div>
                {/* P1-D: i18n the account summary line — no concatenated sentence */}
                <span>
                  {t('onboarding.accountInitialized', '{{accountName}} initialized with {{balance}} {{currency}}', {
                    accountName: accountName,
                    balance: openingBalanceStr,
                    currency: baseCurrency,
                  })}
                </span>
              </div>
            </div>

            <div className="relative z-10 flex gap-3 pt-2">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setStep(2)}
                leftIcon={<ArrowLeft size={18} />}
                className="flex-1"
                disabled={isLoading}
              >
                {t('common.back', 'Back')}
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={() => void handleFinish()}
                isLoading={isLoading}
                rightIcon={<Sparkles size={18} />}
                className="flex-1 bg-gradient-to-r from-primary to-teal-700 shadow-md"
              >
                {t('onboarding.startUsing', 'Start Using Sanchay')}
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Footer */}
      <footer className="w-full max-w-lg py-2 text-center text-xs text-text-muted">
        <span>© {new Date().getFullYear()} <BrandName className="text-xs font-semibold" /></span>
      </footer>
    </div>
  )
}
