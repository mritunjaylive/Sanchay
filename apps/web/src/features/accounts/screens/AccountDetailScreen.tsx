import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { accountRepo } from '../../../db/repositories/accountRepo'
import { transactionRepo } from '../../../db/repositories/transactionRepo'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { accountBalance, balanceOn } from '../../../domain/balance'
import { getCreditCardSummary } from '../../../domain/creditCards'
import { formatDayLabel } from '../../../lib/formatDayLabel'
import { formatMoney, parseAmountToMinor } from '../../../lib/money'
import {
  Page,
  PageHeader,
  Card,
  Button,
  Input,
  Modal,
  Badge,
  Amount,
  Sparkline,
  ProgressBar,
  EmptyState,
  SkeletonCard,
  SkeletonRow,
} from '../../../ui'
import { TransactionRow } from '../../transactions'
import {
  CheckCircle2,
  SlidersHorizontal,
  Archive,
  Trash2,
  Receipt,
  CreditCard,
  Building,
  Plus,
} from 'lucide-react'
import type { Transaction, Account, Category } from '@sanchay/shared'

export default function AccountDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hideBalances, baseCurrency, locale } = useSettingsStore()

  const [isReconcileOpen, setIsReconcileOpen] = useState(false)
  const [actualBalanceStr, setActualBalanceStr] = useState('')
  const [reconcileNote, setReconcileNote] = useState('')

  const todayStr = useMemo(() => new Date().toISOString().substring(0, 10), [])

  const account = useLiveQuery(() => (id ? db.accounts.get(id) : undefined), [id])
  const categories = useLiveQuery(() => db.categories.filter((c) => !c.deletedAt).toArray(), [])
  const transactions = useLiveQuery(
    async () => {
      if (!id) return []
      const list = await db.transactions
        .filter((tx) => !tx.deletedAt && (tx.accountId === id || tx.toAccountId === id))
        .toArray()
      return list.sort((a, b) => {
        const dateCmp = b.occurredOn.localeCompare(a.occurredOn)
        if (dateCmp !== 0) return dateCmp
        return (b.occurredTime ?? '').localeCompare(a.occurredTime ?? '') || b.createdAt.localeCompare(a.createdAt)
      })
    },
    [id],
  )

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    categories?.forEach((c) => map.set(c.id, c))
    return map
  }, [categories])

  const isLoading = account === undefined || transactions === undefined

  // 30-day balance history for Sparkline
  const last30Days = useMemo(() => {
    const dates: string[] = []
    const d = new Date()
    for (let i = 29; i >= 0; i--) {
      const cur = new Date(d)
      cur.setDate(d.getDate() - i)
      dates.push(cur.toISOString().substring(0, 10))
    }
    return dates
  }, [])

  const sparklineData = useMemo(() => {
    if (!account || !transactions) return []
    return last30Days.map((date) => balanceOn(account, transactions, date))
  }, [account, transactions, last30Days])

  // Group transactions by day
  const groupedByDay = useMemo(() => {
    if (!transactions) return []
    const map = new Map<string, Transaction[]>()
    for (const tx of transactions) {
      let list = map.get(tx.occurredOn)
      if (!list) {
        list = []
        map.set(tx.occurredOn, list)
      }
      list.push(tx)
    }
    return Array.from(map.entries()).map(([date, items]) => ({ date, items }))
  }, [transactions])

  if (isLoading) {
    return (
      <Page width="default" className="space-y-6">
        <SkeletonCard className="h-44" />
        <div className="space-y-3">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </Page>
    )
  }

  if (!account) {
    return (
      <Page width="default">
        <EmptyState
          icon={<CreditCard size={28} />}
          title={t('accounts.accountNotFound', 'Account not found')}
          description="The requested account does not exist or has been deleted."
          actionLabel={t('accounts.title', 'View Accounts')}
          onAction={() => navigate('/accounts')}
        />
      </Page>
    )
  }

  const currentBalance = transactions ? accountBalance(account, transactions) : account.openingBalanceMinor
  const isCreditCard = account.kind === 'credit_card'
  const cardSummary = isCreditCard && transactions ? getCreditCardSummary(account, transactions) : null

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!actualBalanceStr.trim()) return

    const targetMinor = parseAmountToMinor(actualBalanceStr, account.currency)
    const diffMinor = targetMinor - currentBalance

    if (diffMinor !== 0) {
      const sign = diffMinor > 0 ? '+' : '-'
      const amountMinor = Math.abs(diffMinor)

      await transactionRepo.create({
        userId: account.userId,
        type: 'adjustment',
        accountId: account.id,
        toAccountId: null,
        amountMinor,
        toAmountMinor: null,
        baseAmountMinor: amountMinor,
        fxRate: '1',
        occurredOn: new Date().toISOString().substring(0, 10),
        occurredTime: null,
        categoryId: null,
        payee: t('transactions.reconciliationAdjustment', 'Balance Reconciliation'),
        note: reconcileNote.trim() || null,
        paymentMethod: null,
        adjustmentSign: sign,
        recurringRuleId: null,
        recurringOccurrenceDate: null,
        source: 'manual',
      })
    }

    setIsReconcileOpen(false)
    setActualBalanceStr('')
    setReconcileNote('')
  }

  const handleArchiveToggle = async () => {
    await accountRepo.archive(account.id, !account.archivedAt)
  }

  const handleDelete = async () => {
    if (window.confirm(t('accounts.deleteConfirm', 'Are you sure you want to delete this account?'))) {
      await accountRepo.delete(account.id)
      navigate('/accounts')
    }
  }

  return (
    <Page width="default" className="space-y-6 pb-20">
      {/* Header */}
      <PageHeader
        title={account.name}
        subtitle={
          <div className="flex items-center gap-2 mt-1">
            <span className="capitalize">{t(`account.kinds.${account.kind}`, account.kind.replace('_', ' '))}</span>
            <span>•</span>
            <span className="uppercase font-semibold">{account.currency}</span>
            {account.archivedAt && (
              <Badge variant="neutral" size="sm">
                Archived
              </Badge>
            )}
          </div>
        }
        backTo="/accounts"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<SlidersHorizontal size={15} />}
              onClick={() => {
                setActualBalanceStr((currentBalance / 100).toString())
                setIsReconcileOpen(true)
              }}
            >
              {t('account.reconcile', 'Reconcile')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Archive size={15} />}
              onClick={handleArchiveToggle}
            >
              {account.archivedAt ? 'Unarchive' : 'Archive'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              title={t('common.delete', 'Delete')}
            >
              <Trash2 size={16} className="text-danger" />
            </Button>
          </div>
        }
      />

      {/* Hero Balance & Details Card */}
      <Card variant="hero" className="p-6 sm:p-7 rounded-3xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted block">
              {t('accounts.currentBalance', 'Current Balance')}
            </span>
            <div className="mt-1">
              <Amount
                minor={currentBalance}
                currency={account.currency}
                tone={currentBalance < 0 ? 'danger' : 'neutral'}
                showSign={false}
                size="display"
                className="font-extrabold text-text"
              />
            </div>
            {account.openingDate && (
              <span className="text-xs text-text-muted block mt-1">
                Opened {account.openingDate} · Opening:{' '}
                {formatMoney(account.openingBalanceMinor, account.currency, locale)}
              </span>
            )}
          </div>

          {/* Sparkline */}
          {sparklineData.length > 1 && !hideBalances && (
            <div className="w-full sm:w-44 pt-2">
              <span className="text-[11px] text-text-muted block mb-1">30-day balance trend</span>
              <Sparkline data={sparklineData} height={44} className="w-full" />
            </div>
          )}
        </div>

        {/* Credit Card Specific Progress & Dates */}
        {isCreditCard && cardSummary && (
          <div className="mt-6 pt-5 border-t border-border/40 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">
                Limit: {formatMoney(cardSummary.creditLimitMinor ?? 0, account.currency, locale)}
              </span>
              <span className="font-semibold text-text">
                Available: {formatMoney(cardSummary.availableCreditMinor ?? 0, account.currency, locale)}
              </span>
            </div>

            <ProgressBar
              value={cardSummary.utilizationPercent ?? 0}
              max={100}
              tone={
                (cardSummary.utilizationPercent ?? 0) > 80
                  ? 'danger'
                  : (cardSummary.utilizationPercent ?? 0) > 50
                  ? 'warning'
                  : 'primary'
              }
              showLabel={true}
            />

            {(account.statementDay || account.dueDay) && (
              <div className="flex gap-4 pt-1 text-xs text-text-muted">
                {account.statementDay && <span>Statement day: {account.statementDay}th</span>}
                {account.dueDay && <span>Payment due: {account.dueDay}th</span>}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Transaction History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-text">
            {t('transactions.title', 'Transactions')} ({transactions?.length ?? 0})
          </h3>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={16} />}
            onClick={() => navigate(`/transactions/new?type=expense`)}
          >
            {t('transactions.addTransaction', 'Add')}
          </Button>
        </div>

        {groupedByDay.length === 0 ? (
          <EmptyState
            icon={<Receipt size={28} />}
            title="No transactions recorded"
            description="Transactions linked to this account will show up here."
            actionLabel={t('transactions.addTransaction', 'Add Transaction')}
            onAction={() => navigate('/transactions/new')}
          />
        ) : (
          <div className="space-y-4">
            {groupedByDay.map(({ date, items }) => (
              <Card key={date} className="p-0 overflow-hidden rounded-2xl border-border/60">
                <div className="px-4 py-2 bg-surface-elevated/90 border-b border-border/40 text-xs font-bold text-text">
                  {formatDayLabel(date, todayStr)}
                </div>
                <div className="divide-y divide-border/30 p-1">
                  {items.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      transaction={tx}
                      category={tx.categoryId ? categoryMap.get(tx.categoryId) : undefined}
                      account={account}
                    />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Reconcile Modal */}
      <Modal
        isOpen={isReconcileOpen}
        onClose={() => setIsReconcileOpen(false)}
        title={t('accounts.reconcileTitle', 'Reconcile Account Balance')}
      >
        <form onSubmit={handleReconcile} className="space-y-4 py-1">
          <p className="text-xs text-text-muted">
            {t(
              'accounts.reconcileDesc',
              'Enter your actual current statement balance. Sanchay will record an automatic adjustment transaction for the difference.',
            )}
          </p>

          <Input
            type="text"
            inputMode="decimal"
            label={t('accounts.actualBalance', 'Actual Statement Balance')}
            value={actualBalanceStr}
            onChange={(e) => setActualBalanceStr(e.target.value)}
            required
          />

          <Input
            label={t('common.note', 'Note (Optional)')}
            placeholder="e.g. October bank statement check"
            value={reconcileNote}
            onChange={(e) => setReconcileNote(e.target.value)}
          />

          <div className="flex items-center gap-3 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setIsReconcileOpen(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary" className="flex-1">
              {t('accounts.reconcile', 'Reconcile')}
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
  )
}
