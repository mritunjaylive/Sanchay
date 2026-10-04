import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../auth/stores/authStore'
import { Button, Input, Select, Card, Logo } from '../../../ui'
import { accountRepo } from '../../../db/repositories/accountRepo'
import { categoryRepo } from '../../../db/repositories/categoryRepo'
import { profileRepo } from '../../../db/repositories/profileRepo'
import { requestPersistentStorage } from '../../../db/db'
import { parseAmountToMinor } from '../../../lib/money'
import { Globe, Wallet, Check, Sparkles } from 'lucide-react'
import type { AccountKind } from '@sanchay/shared'

export default function OnboardingScreen() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.session?.user)
  const setProfile = useAuthStore((s) => s.setProfile)

  const [step, setStep] = useState(1)
  const [language, setLanguage] = useState<'en' | 'hi'>('en')
  const [baseCurrency, setBaseCurrency] = useState('INR')
  const [accountName, setAccountName] = useState('Main Bank')
  const [accountKind, setAccountKind] = useState<AccountKind>('bank')
  const [openingBalanceStr, setOpeningBalanceStr] = useState('0')
  const [isLoading, setIsLoading] = useState(false)

  const handleLanguageChange = (lang: 'en' | 'hi') => {
    setLanguage(lang)
    void i18n.changeLanguage(lang)
  }

  const handleFinish = async () => {
    if (!user) return
    setIsLoading(true)

    try {
      // 1. Request persistent IndexedDB storage
      // Fire-and-forget: persist() can wait on a permission prompt (Firefox) or never settle
      // in headless browsers, and must not block onboarding.
      void requestPersistentStorage()

      // 2. Seed default categories
      await categoryRepo.seedDefaultCategories(user.id)

      // 3. Create initial account
      const openingMinor = parseAmountToMinor(openingBalanceStr || '0', baseCurrency)
      await accountRepo.create({
        userId: user.id,
        name: accountName.trim() || 'Main Account',
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
        color: '#3b82f6',
        sortOrder: 0,
        archivedAt: null,
      })

      // 4. Update profile and complete onboarding
      const updatedProfile = await profileRepo.update(user.id, {
        baseCurrency,
        locale: language === 'hi' ? 'hi-IN' : 'en-IN',
        onboardedAt: new Date().toISOString(),
      })

      setProfile(updatedProfile)
      navigate('/')
    } catch (err) {
      console.error('Failed to complete onboarding:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-lg">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                s === step ? 'w-8 bg-primary' : s < step ? 'w-2 bg-success' : 'w-2 bg-border'
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <Card className="animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-6">
              <div className="flex justify-center mx-auto mb-3">
                <Logo size={56} className="shadow-md rounded-2xl" />
              </div>
              <h2 className="text-xl font-bold text-text">{t('onboarding.welcome', 'Welcome to Sanchay')}</h2>
              <p className="text-sm text-text-muted mt-1">
                {t('onboarding.step1Desc', 'Choose your preferred language and base currency')}
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium text-text mb-2 block">
                  {t('settings.language', 'Language')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('en')}
                    className={`min-h-[52px] p-3 rounded-xl border flex items-center justify-center font-medium transition-all ${
                      language === 'en'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-surface-elevated text-text hover:bg-surface-overlay'
                    }`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('hi')}
                    className={`min-h-[52px] p-3 rounded-xl border flex items-center justify-center font-medium transition-all ${
                      language === 'hi'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-surface-elevated text-text hover:bg-surface-overlay'
                    }`}
                  >
                    हिन्दी (Hindi)
                  </button>
                </div>
              </div>

              <Select
                label={t('settings.baseCurrency', 'Base Currency')}
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

              <Button
                variant="primary"
                className="w-full mt-4"
                onClick={() => setStep(2)}
              >
                {t('common.continue', 'Continue')}
              </Button>
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card className="animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-3">
                <Wallet size={24} />
              </div>
              <h2 className="text-xl font-bold text-text">{t('onboarding.setupFirstAccount', 'Set up your first account')}</h2>
              <p className="text-sm text-text-muted mt-1">
                {t('onboarding.step2Desc', 'Add your primary bank, cash in hand, or wallet')}
              </p>
            </div>

            <div className="space-y-4">
              <Input
                label={t('accounts.accountName', 'Account Name')}
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g. HDFC Bank, Cash Wallet"
                required
              />

              <Select
                label={t('accounts.accountKind', 'Account Type')}
                value={accountKind}
                onChange={(e) => setAccountKind(e.target.value as AccountKind)}
                options={[
                  { value: 'bank', label: 'Bank Account' },
                  { value: 'cash', label: 'Cash in Hand' },
                  { value: 'wallet', label: 'Digital Wallet (Paytm/UPI)' },
                  { value: 'savings', label: 'Savings Account' },
                ]}
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

              <div className="flex gap-3 pt-3">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  {t('common.back', 'Back')}
                </Button>
                <Button variant="primary" onClick={() => setStep(3)} className="flex-1">
                  {t('common.continue', 'Continue')}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card className="animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className="w-12 h-12 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-3">
              <Sparkles size={24} />
            </div>
            <h2 className="text-xl font-bold text-text">{t('onboarding.allSet', "You're all set!")}</h2>
            <p className="text-sm text-text-muted mt-1">
              {t('onboarding.readyMsg', 'We have prepared standard categories for food, bills, shopping, salary, and more. You can customize them anytime in Settings.')}
            </p>

            <div className="my-6 p-4 bg-surface rounded-xl border border-border text-left space-y-2 text-sm">
              <div className="flex items-center gap-2 text-text">
                <Check size={16} className="text-success" />
                <span>{t('onboarding.offlineReady', '100% offline-first storage configured')}</span>
              </div>
              <div className="flex items-center gap-2 text-text">
                <Check size={16} className="text-success" />
                <span>{t('onboarding.categoriesConfigured', '18 curated categories ready')}</span>
              </div>
              <div className="flex items-center gap-2 text-text">
                <Check size={16} className="text-success" />
                <span>{t('onboarding.cloudSyncReady', 'Cloud sync standby')}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1" disabled={isLoading}>
                {t('common.back', 'Back')}
              </Button>
              <Button
                variant="primary"
                onClick={handleFinish}
                isLoading={isLoading}
                className="flex-1"
              >
                {t('onboarding.startUsing', 'Start Using Sanchay')}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
