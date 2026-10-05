import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { accountRepo } from '../../../db/repositories/accountRepo'
import { useAuthStore } from '../../auth/stores/authStore'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { accountBalance } from '../../../domain/balance'
import { getCreditCardSummary } from '../../../domain/creditCards'
import { formatMoney, parseAmountToMinor } from '../../../lib/money'
import {
  Page,
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Modal,
  Badge,
  Amount,
  ProgressBar,
  EmptyState,
  SkeletonCard,
} from '../../../ui'
import {
  Plus,
  Landmark,
  Banknote,
  Smartphone,
  CreditCard as CreditCardIcon,
  Building,
  PiggyBank,
  EyeOff,
  Archive,
  Wifi,
  Wallet,
} from 'lucide-react'
import type { Account, AccountKind } from '@sanchay/shared'
import { cn } from '../../../lib/cn'

const ASSET_KINDS: AccountKind[] = ['cash', 'bank', 'wallet', 'savings', 'investment', 'other_asset']
const LIABILITY_KINDS: AccountKind[] = ['credit_card', 'loan', 'other_liability']

export default function AccountsScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.session?.user)
  const { hideBalances, baseCurrency, locale } = useSettingsStore()

  const [showArchived, setShowArchived] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('bank')
  const [currency, setCurrency] = useState(baseCurrency)
  const [openingBalanceStr, setOpeningBalanceStr] = useState('0')
  const [excludeFromNetWorth, setExcludeFromNetWorth] = useState(false)
  const [creditLimitStr, setCreditLimitStr] = useState('')
  const [statementDay, setStatementDay] = useState('')
  const [paymentDueDay, setPaymentDueDay] = useState('')

  const accounts = useLiveQuery(() => db.accounts.orderBy('sortOrder').toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])

  const isLoading = accounts === undefined || transactions === undefined

  const filteredAccounts = useMemo(() => {
    return (accounts ?? []).filter((a: Account) => {
      if (a.deletedAt) return false
      if (!showArchived && a.archivedAt) return false
      return true
    })
  }, [accounts, showArchived])

  const assetAccounts = useMemo(
    () => filteredAccounts.filter((a: Account) => ASSET_KINDS.includes(a.kind as AccountKind)),
    [filteredAccounts],
  )

  const liabilityAccounts = useMemo(
    () => filteredAccounts.filter((a: Account) => LIABILITY_KINDS.includes(a.kind as AccountKind)),
    [filteredAccounts],
  )

  // Calculate totals
  const totalAssetsMinor = useMemo(() => {
    if (!transactions) return 0
    return assetAccounts.reduce((sum, acc) => sum + accountBalance(acc, transactions), 0)
  }, [assetAccounts, transactions])

  const totalLiabilitiesMinor = useMemo(() => {
    if (!transactions) return 0
    return liabilityAccounts.reduce((sum, acc) => sum + accountBalance(acc, transactions), 0)
  }, [liabilityAccounts, transactions])

  const openCreateModal = () => {
    setEditingAccount(null)
    setName('')
    setKind('bank')
    setCurrency(baseCurrency)
    setOpeningBalanceStr('0')
    setExcludeFromNetWorth(false)
    setCreditLimitStr('')
    setStatementDay('')
    setPaymentDueDay('')
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !name.trim()) return

    const openingMinor = parseAmountToMinor(openingBalanceStr || '0', currency)
    const creditLimitMinor = creditLimitStr ? parseAmountToMinor(creditLimitStr, currency) : null

    if (editingAccount) {
      await accountRepo.update(editingAccount.id, {
        name: name.trim(),
        kind,
        currency,
        excludeFromNetWorth,
        creditLimitMinor,
        statementDay: statementDay ? parseInt(statementDay, 10) : null,
        dueDay: paymentDueDay ? parseInt(paymentDueDay, 10) : null,
      })
    } else {
      await accountRepo.create({
        userId: user.id,
        name: name.trim(),
        kind,
        currency,
        openingBalanceMinor: openingMinor,
        openingDate: new Date().toISOString().substring(0, 10),
        creditLimitMinor,
        statementDay: statementDay ? parseInt(statementDay, 10) : null,
        dueDay: paymentDueDay ? parseInt(paymentDueDay, 10) : null,
        excludeFromNetWorth,
        icon: null,
        color: null,
        sortOrder: accounts?.length ?? 0,
        archivedAt: null,
        note: null,
      })
    }

    setIsModalOpen(false)
  }

  const renderIcon = (k: AccountKind) => {
    switch (k) {
      case 'bank': return <Landmark size={20} />
      case 'cash': return <Banknote size={20} />
      case 'wallet': return <Smartphone size={20} />
      case 'savings': return <PiggyBank size={20} />
      case 'credit_card': return <CreditCardIcon size={20} />
      case 'loan': return <Building size={20} />
      default: return <Landmark size={20} />
    }
  }

  const renderAccountCard = (account: Account) => {
    const currentBalance = transactions ? accountBalance(account, transactions) : account.openingBalanceMinor
    const isCreditCard = account.kind === 'credit_card'

    // Credit Card physical-card layout
    if (isCreditCard) {
      const summary = transactions ? getCreditCardSummary(account, transactions) : null
      const creditLimit = account.creditLimitMinor ?? 0
      const utilization = summary?.utilizationPercent ?? 0

      return (
        <button
          key={account.id}
          type="button"
          onClick={() => navigate(`/accounts/${account.id}`)}
          className={cn(
            'group relative overflow-hidden rounded-2xl p-5 cursor-pointer transition-all duration-200 text-left w-full',
            'bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 text-white shadow-md hover:shadow-lg',
            'border border-slate-700/60 active:scale-[0.99] flex flex-col justify-between min-h-[170px]',
          )}
        >
          {/* Card Top: Chip & Type */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-6 rounded bg-amber-400/90 border border-amber-300 flex items-center justify-center shadow-xs">
                <div className="w-4 h-3 border border-amber-600/50 rounded-xs" />
              </div>
              <Wifi size={16} className="text-slate-400 rotate-90" />
            </div>

            <div className="flex items-center gap-1.5">
              {account.excludeFromNetWorth && (
                <span className="p-1 rounded bg-black/30 text-slate-300 text-[10px]">
                  <EyeOff size={12} />
                </span>
              )}
              {account.archivedAt && (
                <span className="p-1 rounded bg-black/30 text-slate-300 text-[10px]">
                  <Archive size={12} />
                </span>
              )}
              <span className="text-xs uppercase font-extrabold tracking-widest text-slate-300">
                {account.currency}
              </span>
            </div>
          </div>

          {/* Card Middle: Name */}
          <div className="py-2">
            <h4 className="font-bold text-sm tracking-wide text-white truncate drop-shadow-xs">
              {account.name}
            </h4>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block mt-0.5">
              {account.dueDay ? `Due Day: ${account.dueDay}` : 'Credit Card'}
            </span>
          </div>

          {/* Card Bottom: Balance & Utilization */}
          <div className="space-y-1.5 pt-2 border-t border-slate-700/60">
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-slate-400">Current Balance</span>
              <Amount
                minor={Math.abs(currentBalance)}
                currency={account.currency}
                tone="neutral"
                showSign={false}
                className="text-base font-extrabold text-white"
              />
            </div>

            {creditLimit > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Limit: {formatMoney(creditLimit, account.currency, locale)}</span>
                  <span className={utilization > 70 ? 'text-amber-400 font-bold' : ''}>
                    {utilization}% used
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      utilization > 80 ? 'bg-danger' : utilization > 50 ? 'bg-amber-400' : 'bg-success',
                    )}
                    style={{ width: `${Math.min(100, utilization)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </button>
      )
    }

    // Standard Clean Asset / Liability Card
    return (
      <Card
        key={account.id}
        onClick={() => navigate(`/accounts/${account.id}`)}
        className="cursor-pointer hover:border-primary/50 transition-all active:scale-[0.99] p-5 flex flex-col justify-between min-h-[140px] rounded-2xl"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {renderIcon(account.kind as AccountKind)}
            </div>
            <div>
              <h4 className="font-semibold text-text text-sm truncate max-w-[170px]">{account.name}</h4>
              <span className="text-xs text-text-muted capitalize block mt-0.5">
                {t(`account.kinds.${account.kind}`, account.kind.replace('_', ' '))}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {account.excludeFromNetWorth && (
              <Badge variant="neutral" size="sm" title={t('account.excludeFromNetWorth')}>
                <EyeOff size={11} />
              </Badge>
            )}
            {account.archivedAt && (
              <Badge variant="neutral" size="sm">
                <Archive size={11} />
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/50 flex justify-between items-baseline">
          <span className="text-xs text-text-muted">{t('accounts.currentBalance', 'Balance')}</span>
          <Amount
            minor={currentBalance}
            currency={account.currency}
            tone={currentBalance < 0 ? 'danger' : 'neutral'}
            showSign={false}
            className="text-base font-bold text-text"
          />
        </div>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Page width="default" className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 bg-surface-elevated animate-pulse rounded-lg" />
          <div className="h-9 w-28 bg-surface-elevated animate-pulse rounded-xl" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard className="h-36" />
          <SkeletonCard className="h-36" />
          <SkeletonCard className="h-36" />
        </div>
      </Page>
    )
  }

  return (
    <Page width="default" className="space-y-7 pb-20">
      {/* Header */}
      <PageHeader
        title={t('accounts.title', 'Accounts')}
        subtitle={t('accounts.subtitle', 'Manage all your bank accounts, cash wallets, cards, and debt')}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? t('accounts.hideArchived', 'Hide Archived') : t('accounts.showArchived', 'Show Archived')}
            </Button>
            <Button variant="primary" size="sm" leftIcon={<Plus size={16} />} onClick={openCreateModal}>
              {t('accounts.newAccount', 'New Account')}
            </Button>
          </div>
        }
      />

      {/* Asset Accounts */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-text-muted px-1">
          <span className="flex items-center gap-1.5">
            <span>{t('accounts.assetsGroup', 'Assets & Cash')}</span>
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-surface-overlay text-text">
              {assetAccounts.length}
            </span>
          </span>
          <div className="flex items-center gap-1">
            <span className="font-normal text-text-muted">Total:</span>
            <Amount
              minor={totalAssetsMinor}
              currency={baseCurrency}
              tone="income"
              showSign={false}
              className="font-bold text-xs"
            />
          </div>
        </div>

        {assetAccounts.length === 0 ? (
          <EmptyState
            icon={<Wallet size={28} />}
            title={t('accounts.noAssets', 'No asset accounts yet')}
            description="Add your checking accounts, digital wallets, or cash to start tracking balances."
            actionLabel={t('accounts.newAccount', 'New Account')}
            onAction={openCreateModal}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {assetAccounts.map(renderAccountCard)}
          </div>
        )}
      </div>

      {/* Liability Accounts */}
      <div className="space-y-3.5 pt-2">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-text-muted px-1">
          <span className="flex items-center gap-1.5">
            <span>{t('accounts.liabilitiesGroup', 'Credit Cards & Debt')}</span>
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-surface-overlay text-text">
              {liabilityAccounts.length}
            </span>
          </span>
          <div className="flex items-center gap-1">
            <span className="font-normal text-text-muted">Total:</span>
            <Amount
              minor={totalLiabilitiesMinor}
              currency={baseCurrency}
              tone="danger"
              showSign={false}
              className="font-bold text-xs"
            />
          </div>
        </div>

        {liabilityAccounts.length === 0 ? (
          <EmptyState
            icon={<CreditCardIcon size={28} />}
            title={t('accounts.noLiabilities', 'No credit cards or debt accounts')}
            description="Add credit cards, personal loans, or mortgages to monitor debt and payoff schedules."
            actionLabel={t('accounts.newAccount', 'New Account')}
            onAction={() => {
              openCreateModal()
              setKind('credit_card')
            }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {liabilityAccounts.map(renderAccountCard)}
          </div>
        )}
      </div>

      {/* Add / Edit Account Modal (Bug 9.3 fixed: localized options) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAccount ? t('accounts.editAccount', 'Edit Account') : t('accounts.newAccount', 'New Account')}
      >
        <form onSubmit={handleSave} className="space-y-4 py-1">
          <Input
            label={t('accounts.accountName', 'Account Name')}
            placeholder="e.g. HDFC Bank, ICICI Amazon Pay, Cash"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('accounts.accountKind', 'Account Type')}
              value={kind}
              onChange={(e) => setKind(e.target.value as AccountKind)}
              options={[
                { value: 'bank', label: t('account.kinds.bank', 'Bank Account') },
                { value: 'cash', label: t('account.kinds.cash', 'Cash in Hand') },
                { value: 'wallet', label: t('account.kinds.wallet', 'Digital Wallet') },
                { value: 'savings', label: t('account.kinds.savings', 'Savings') },
                { value: 'credit_card', label: t('account.kinds.credit_card', 'Credit Card') },
                { value: 'loan', label: t('account.kinds.loan', 'Loan / Debt') },
                { value: 'investment', label: t('account.kinds.investment', 'Investment') },
                { value: 'other_asset', label: t('account.kinds.other_asset', 'Other Asset') },
                { value: 'other_liability', label: t('account.kinds.other_liability', 'Other Liability') },
              ]}
            />

            <Input
              label={t('account.currency', 'Currency')}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              required
            />
          </div>

          {!editingAccount && (
            <Input
              type="text"
              inputMode="decimal"
              label={t('account.openingBalance', 'Opening Balance')}
              placeholder="0.00"
              value={openingBalanceStr}
              onChange={(e) => setOpeningBalanceStr(e.target.value)}
            />
          )}

          {kind === 'credit_card' && (
            <div className="p-3 bg-surface-overlay/50 rounded-xl space-y-3 border border-border/40">
              <span className="text-xs font-semibold text-text block">Credit Card Details</span>
              <Input
                type="text"
                inputMode="decimal"
                label={t('accounts.creditLimit', 'Credit Limit')}
                placeholder="e.g. 100000"
                value={creditLimitStr}
                onChange={(e) => setCreditLimitStr(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  min="1"
                  max="28"
                  label={t('accounts.statementDay', 'Statement Day (1–28)')}
                  placeholder="e.g. 15"
                  value={statementDay}
                  onChange={(e) => setStatementDay(e.target.value)}
                />
                <Input
                  type="number"
                  min="1"
                  max="28"
                  label={t('accounts.paymentDueDay', 'Due Day (1–28)')}
                  placeholder="e.g. 5"
                  value={paymentDueDay}
                  onChange={(e) => setPaymentDueDay(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="excludeNetWorth"
              checked={excludeFromNetWorth}
              onChange={(e) => setExcludeFromNetWorth(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="excludeNetWorth" className="text-xs font-medium text-text cursor-pointer">
              {t('account.excludeFromNetWorth', 'Exclude from net worth')}
            </label>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setIsModalOpen(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary" className="flex-1">
              {t('common.save', 'Save')}
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
  )
}
