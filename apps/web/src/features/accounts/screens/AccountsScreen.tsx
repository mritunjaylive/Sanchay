import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { accountRepo } from '../../../db/repositories/accountRepo'
import { useAuthStore } from '../../auth/stores/authStore'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { accountBalance } from '../../../domain/balance'
import { formatMoney, parseAmountToMinor } from '../../../lib/money'
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Select, Modal, Badge } from '../../../ui'
import { Plus, Landmark, Banknote, Smartphone, CreditCard, Building, PiggyBank, EyeOff, Archive } from 'lucide-react'
import type { Account, AccountKind } from '@sanchay/shared'

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

  const filteredAccounts = (accounts ?? []).filter((a: Account) => {
    if (a.deletedAt) return false
    if (!showArchived && a.archivedAt) return false
    return true
  })

  const assetAccounts = filteredAccounts.filter((a: Account) => ASSET_KINDS.includes(a.kind as AccountKind))
  const liabilityAccounts = filteredAccounts.filter((a: Account) => LIABILITY_KINDS.includes(a.kind as AccountKind))

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
      case 'credit_card': return <CreditCard size={20} />
      case 'loan': return <Building size={20} />
      default: return <Landmark size={20} />
    }
  }

  const renderAccountCard = (account: Account) => {
    const currentBalance = transactions ? accountBalance(account, transactions) : account.openingBalanceMinor
    const isLiability = LIABILITY_KINDS.includes(account.kind as AccountKind)

    return (
      <Card
        key={account.id}
        onClick={() => navigate(`/accounts/${account.id}`)}
        className="cursor-pointer hover:border-primary/50 transition-all active:scale-[0.99] p-4 flex flex-col justify-between"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {renderIcon(account.kind as AccountKind)}
            </div>
            <div>
              <h4 className="font-semibold text-text text-sm">{account.name}</h4>
              <span className="text-xs text-text-muted capitalize">{account.kind.replace('_', ' ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {account.excludeFromNetWorth && (
              <Badge variant="neutral" size="sm" title={t('accounts.excluded', 'Excluded from Net Worth')}>
                <EyeOff size={10} />
              </Badge>
            )}
            {account.archivedAt && (
              <Badge variant="neutral" size="sm">
                <Archive size={10} />
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/50 flex justify-between items-baseline">
          <span className="text-xs text-text-muted">{t('accounts.currentBalance', 'Balance')}</span>
          <span
            className={`font-bold text-base ${
              isLiability && currentBalance < 0
                ? 'text-danger'
                : currentBalance < 0
                ? 'text-danger'
                : 'text-text'
            }`}
          >
            {hideBalances ? '••••••' : formatMoney(currentBalance, account.currency, locale)}
          </span>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('accounts.title', 'Accounts')}</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {t('accounts.subtitle', 'Manage all your bank accounts, cash wallets, cards, and loans')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? t('accounts.hideArchived', 'Hide Archived') : t('accounts.showArchived', 'Show Archived')}
          </Button>
          <Button variant="primary" leftIcon={<Plus size={16} />} onClick={openCreateModal}>
            {t('accounts.newAccount', 'New Account')}
          </Button>
        </div>
      </div>

      {/* Asset Accounts */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted flex items-center justify-between">
          <span>{t('accounts.assetsGroup', 'Assets & Cash')}</span>
          <span>{assetAccounts.length}</span>
        </h2>
        {assetAccounts.length === 0 ? (
          <div className="p-8 text-center text-text-muted border border-dashed border-border rounded-xl text-sm">
            {t('accounts.noAssets', 'No asset accounts yet.')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {assetAccounts.map(renderAccountCard)}
          </div>
        )}
      </div>

      {/* Liability Accounts */}
      <div className="space-y-3 pt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted flex items-center justify-between">
          <span>{t('accounts.liabilitiesGroup', 'Credit Cards & Loans')}</span>
          <span>{liabilityAccounts.length}</span>
        </h2>
        {liabilityAccounts.length === 0 ? (
          <div className="p-8 text-center text-text-muted border border-dashed border-border rounded-xl text-sm">
            {t('accounts.noLiabilities', 'No credit cards or debt accounts.')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {liabilityAccounts.map(renderAccountCard)}
          </div>
        )}
      </div>

      {/* Add / Edit Account Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAccount ? t('accounts.editAccount', 'Edit Account') : t('accounts.newAccount', 'New Account')}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label={t('accounts.accountName', 'Account Name')}
            placeholder="e.g. ICICI Bank, Cash, Credit Card"
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
                { value: 'bank', label: 'Bank Account' },
                { value: 'cash', label: 'Cash in Hand' },
                { value: 'wallet', label: 'Digital Wallet' },
                { value: 'savings', label: 'Savings' },
                { value: 'credit_card', label: 'Credit Card' },
                { value: 'loan', label: 'Loan / Debt' },
                { value: 'investment', label: 'Investment' },
                { value: 'other_asset', label: 'Other Asset' },
                { value: 'other_liability', label: 'Other Liability' },
              ]}
            />

            <Select
              label={t('common.currency', 'Currency')}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              options={[
                { value: 'INR', label: 'INR (₹)' },
                { value: 'USD', label: 'USD ($)' },
                { value: 'EUR', label: 'EUR (€)' },
                { value: 'GBP', label: 'GBP (£)' },
                { value: 'AED', label: 'AED (د.إ)' },
              ]}
            />
          </div>

          {!editingAccount && (
            <Input
              type="text"
              inputMode="decimal"
              label={t('accounts.openingBalance', 'Opening Balance')}
              value={openingBalanceStr}
              onChange={(e) => setOpeningBalanceStr(e.target.value)}
              placeholder="0.00"
              helperText={
                kind === 'credit_card' || kind === 'loan'
                  ? t('accounts.openingLiabilityHelper', 'Enter as negative if money is already owed (e.g. -5000)')
                  : ''
              }
            />
          )}

          {kind === 'credit_card' && (
            <div className="p-3 bg-surface rounded-xl border border-border space-y-3">
              <Input
                type="text"
                inputMode="decimal"
                label={t('accounts.creditLimit', 'Credit Limit')}
                value={creditLimitStr}
                onChange={(e) => setCreditLimitStr(e.target.value)}
                placeholder="e.g. 100000"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  min="1"
                  max="31"
                  label={t('accounts.statementDay', 'Statement Day (1-31)')}
                  value={statementDay}
                  onChange={(e) => setStatementDay(e.target.value)}
                />
                <Input
                  type="number"
                  min="1"
                  max="31"
                  label={t('accounts.dueDay', 'Payment Due Day (1-31)')}
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
            <label htmlFor="excludeNetWorth" className="text-sm font-medium text-text cursor-pointer select-none">
              {t('accounts.excludeFromNetWorth', 'Exclude this account from Net Worth totals')}
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('common.save', 'Save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
