import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { accountRepo } from '../../../db/repositories/accountRepo'
import { transactionRepo } from '../../../db/repositories/transactionRepo'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { accountBalance } from '../../../domain/balance'
import { getCreditCardSummary } from '../../../domain/creditCards'
import { formatMoney, parseAmountToMinor } from '../../../lib/money'
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Modal, Badge } from '../../../ui'
import { ArrowLeft, CheckCircle2, SlidersHorizontal, Archive, Trash2, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'

export default function AccountDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hideBalances, locale } = useSettingsStore()

  const [isReconcileOpen, setIsReconcileOpen] = useState(false)
  const [actualBalanceStr, setActualBalanceStr] = useState('')
  const [reconcileNote, setReconcileNote] = useState('')

  const account = useLiveQuery(() => (id ? db.accounts.get(id) : undefined), [id])
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

  if (!account) {
    return (
      <div className="p-8 text-center text-text-muted">
        {t('accounts.accountNotFound', 'Account not found.')}
      </div>
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
    <div className="space-y-6 pb-20 md:pb-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/accounts')}
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text font-medium"
        >
          <ArrowLeft size={16} />
          <span>{t('accounts.backToAccounts', 'All Accounts')}</span>
        </button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<SlidersHorizontal size={14} />}
            onClick={() => {
              setActualBalanceStr('')
              setIsReconcileOpen(true)
            }}
          >
            {t('accounts.reconcile', 'Reconcile')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleArchiveToggle}
            title={account.archivedAt ? 'Unarchive' : 'Archive'}
          >
            <Archive size={16} className={account.archivedAt ? 'text-primary' : 'text-text-muted'} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} title="Delete">
            <Trash2 size={16} className="text-danger" />
          </Button>
        </div>
      </div>

      {/* Account Balance Card */}
      <Card className="bg-gradient-to-br from-surface-elevated to-surface-overlay/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text">{account.name}</h1>
              <Badge variant="neutral">{account.kind.replace('_', ' ')}</Badge>
              {account.archivedAt && <Badge variant="warning">{t('accounts.archived', 'Archived')}</Badge>}
            </div>
            <p className="text-xs text-text-muted mt-1">
              {t('accounts.openedOn', 'Opened on')} {account.openingDate} • {account.currency}
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-text-muted uppercase tracking-wider block">
              {t('accounts.currentBalance', 'Current Balance')}
            </span>
            <div className="text-3xl font-extrabold text-text mt-0.5">
              {hideBalances ? '••••••' : formatMoney(currentBalance, account.currency, locale)}
            </div>
          </div>
        </div>

        {/* Credit Card Specific Stats */}
        {cardSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-border/50 text-xs">
            <div>
              <span className="text-text-muted block">{t('accounts.creditLimit', 'Credit Limit')}</span>
              <span className="font-semibold text-text">
                {cardSummary.creditLimitMinor ? formatMoney(cardSummary.creditLimitMinor, account.currency, locale) : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-text-muted block">{t('accounts.availableCredit', 'Available')}</span>
              <span className="font-semibold text-success">
                {cardSummary.availableCreditMinor !== null ? formatMoney(cardSummary.availableCreditMinor, account.currency, locale) : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-text-muted block">{t('accounts.utilization', 'Utilization')}</span>
              <span className="font-semibold text-text">
                {cardSummary.utilizationPercent !== null ? `${cardSummary.utilizationPercent}%` : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-text-muted block">{t('accounts.amountDue', 'Amount Due')}</span>
              <span className="font-semibold text-danger">
                {formatMoney(cardSummary.statementAmountDueMinor, account.currency, locale)}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Transactions History */}
      <Card>
        <CardHeader>
          <CardTitle>{t('transactions.title', 'Transactions')}</CardTitle>
          <span className="text-xs text-text-muted font-medium">
            {transactions?.length ?? 0} {t('transactions.records', 'records')}
          </span>
        </CardHeader>
        <CardContent>
          {!transactions || transactions.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-sm">
              {t('transactions.noTransactionsForAccount', 'No transactions recorded for this account yet.')}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {transactions.map((tx) => {
                const isIncome = tx.type === 'income'
                const isTransfer = tx.type === 'transfer'
                const isAdjustment = tx.type === 'adjustment'
                const isIncomingTransfer = isTransfer && tx.toAccountId === account.id

                return (
                  <button
                    type="button"
                    key={tx.id}
                    onClick={() => navigate(`/transactions/${tx.id}`)}
                    className="w-full text-left py-3 flex items-center justify-between hover:bg-surface-overlay/50 px-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isIncomingTransfer || isIncome
                            ? 'bg-success/10 text-success'
                            : isTransfer
                            ? 'bg-primary/10 text-primary'
                            : isAdjustment
                            ? 'bg-warning/10 text-warning'
                            : 'bg-surface-overlay text-text'
                        }`}
                      >
                        {isTransfer ? (
                          <ArrowRight size={18} />
                        ) : isIncome || isIncomingTransfer ? (
                          <TrendingUp size={18} />
                        ) : (
                          <TrendingDown size={18} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text truncate">
                          {tx.payee || tx.type.toUpperCase()}
                        </p>
                        <p className="text-xs text-text-muted">
                          {tx.occurredOn} {tx.note ? `• ${tx.note}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-sm font-bold ${
                          isIncomingTransfer || isIncome || (isAdjustment && tx.adjustmentSign === '+')
                            ? 'text-success'
                            : 'text-text'
                        }`}
                      >
                        {isIncomingTransfer || isIncome || (isAdjustment && tx.adjustmentSign === '+') ? '+' : '-'}
                        {hideBalances ? '••••••' : formatMoney(tx.amountMinor, account.currency, locale)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reconcile Modal */}
      <Modal
        isOpen={isReconcileOpen}
        onClose={() => setIsReconcileOpen(false)}
        title={t('accounts.reconcileTitle', 'Reconcile Account Balance')}
        description={t(
          'accounts.reconcileDesc',
          'Enter the actual balance shown on your bank statement or wallet. Sanchay will create an adjustment entry.',
        )}
      >
        <form onSubmit={handleReconcile} className="space-y-4">
          <div className="p-3 bg-surface rounded-xl border border-border flex justify-between items-center text-sm">
            <span className="text-text-muted">{t('accounts.recordedBalance', 'Recorded Balance')}</span>
            <span className="font-bold text-text">
              {formatMoney(currentBalance, account.currency, locale)}
            </span>
          </div>

          <Input
            type="text"
            inputMode="decimal"
            label={t('accounts.actualBalance', 'Actual Real-World Balance')}
            placeholder="0.00"
            value={actualBalanceStr}
            onChange={(e) => setActualBalanceStr(e.target.value)}
            required
          />

          <Input
            label={t('common.note', 'Note (Optional)')}
            placeholder={t('accounts.reconcileNotePlaceholder', 'e.g. Monthly statement check')}
            value={reconcileNote}
            onChange={(e) => setReconcileNote(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsReconcileOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('accounts.applyAdjustment', 'Apply Adjustment')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
