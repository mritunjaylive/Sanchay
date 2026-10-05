import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { accountRepo } from '../../../db/repositories/accountRepo'
import { transactionRepo } from '../../../db/repositories/transactionRepo'
import { useAuthStore } from '../../auth/stores/authStore'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import {
  computeReducingEmi,
  amortizationSchedule,
  recordEmiTransactions,
  percentToBps,
} from '../../../domain/loans'
import { accountBalance } from '../../../domain/balance'
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
  Calendar,
  CheckCircle2,
  Building,
  CreditCard,
  DollarSign,
  PieChart,
} from 'lucide-react'
import type { Account, LoanTerms } from '@sanchay/shared'
import { cn } from '../../../lib/cn'

export default function LoansScreen() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.session?.user)
  const { baseCurrency, locale } = useSettingsStore()

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [isRecordEmiOpen, setIsRecordEmiOpen] = useState(false)
  const [payingAccountId, setPayingAccountId] = useState('')
  const [isNewLoanOpen, setIsNewLoanOpen] = useState(false)

  // New loan form
  const [loanName, setLoanName] = useState('')
  const [direction, setDirection] = useState<'borrowed' | 'lent'>('borrowed')
  const [principalStr, setPrincipalStr] = useState('')
  const [rateStr, setRateStr] = useState('8.5')
  const [tenureMonths, setTenureMonths] = useState('36')
  const [paymentDay, setPaymentDay] = useState('5')

  // DB queries
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).toArray(), [])
  const loanTerms = useLiveQuery(() => db.loanTerms.filter((l) => !l.deletedAt).toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])

  const isLoading = accounts === undefined || loanTerms === undefined || transactions === undefined

  // Filter loan accounts
  const loanAccounts = useMemo(() => {
    return (accounts ?? []).filter((a) => a.kind === 'loan')
  }, [accounts])

  const selectedAccount = useMemo(() => {
    if (selectedAccountId) return loanAccounts.find((a) => a.id === selectedAccountId)
    return loanAccounts[0]
  }, [loanAccounts, selectedAccountId])

  const selectedTerms = useMemo(() => {
    if (!selectedAccount || !loanTerms) return undefined
    return loanTerms.find((l) => l.accountId === selectedAccount.id)
  }, [selectedAccount, loanTerms])

  // Compute Amortization Schedule
  const schedule = useMemo(() => {
    if (!selectedTerms) return []
    return amortizationSchedule(selectedTerms)
  }, [selectedTerms])

  // Current balance of selected loan
  const currentBalanceMinor = useMemo(() => {
    if (!selectedAccount || !transactions) return 0
    return Math.abs(accountBalance(selectedAccount, transactions))
  }, [selectedAccount, transactions])

  // Payoff calculations
  const payoff = useMemo(() => {
    if (!selectedTerms) return { originalPrincipal: 0, paidPrincipal: 0, percentPaid: 0 }
    const originalPrincipal = selectedTerms.principalMinor
    const paidPrincipal = Math.max(0, originalPrincipal - currentBalanceMinor)
    const percentPaid = originalPrincipal > 0 ? Math.min(100, Math.round((paidPrincipal / originalPrincipal) * 100)) : 0
    return { originalPrincipal, paidPrincipal, percentPaid }
  }, [selectedTerms, currentBalanceMinor])

  const handleRecordEmi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !selectedAccount || !selectedTerms || !payingAccountId) return

    // Find the next unpaid installment
    const installmentIndex = 0
    const installment = schedule[installmentIndex]
    if (!installment) return

    const now = new Date().toISOString()
    const occurredOn = new Date().toISOString().substring(0, 10)

    const params = {
      userId: user.id,
      loanAccount: selectedAccount,
      payingAccountId,
      terms: selectedTerms,
      installmentNumber: installment.installmentNumber,
      principalMinor: installment.principalPartMinor,
      interestMinor: installment.interestPartMinor,
      occurredOn,
      now,
    }

    const { principalTx, interestTx } = recordEmiTransactions(params)

    await transactionRepo.create(principalTx as unknown as Parameters<typeof transactionRepo.create>[0])
    await transactionRepo.create(interestTx as unknown as Parameters<typeof transactionRepo.create>[0])

    setIsRecordEmiOpen(false)
  }

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !loanName.trim() || !principalStr.trim()) return

    const principalMinor = parseAmountToMinor(principalStr, baseCurrency)
    const ratePercent = parseFloat(rateStr) || 0
    const rateBps = percentToBps(ratePercent)
    const tenure = parseInt(tenureMonths, 10) || 12
    const payDay = parseInt(paymentDay, 10) || 1
    const today = new Date().toISOString().substring(0, 10)

    // Compute monthly EMI
    const emiMinor = computeReducingEmi(principalMinor, rateBps, tenure)

    // 1. Create the loan Account
    const createdAccount = await accountRepo.create({
      userId: user.id,
      name: loanName.trim(),
      kind: 'loan',
      currency: baseCurrency,
      openingBalanceMinor: -principalMinor, // Debt is negative balance
      openingDate: today,
      creditLimitMinor: null,
      statementDay: null,
      dueDay: payDay,
      excludeFromNetWorth: false,
      icon: null,
      color: null,
      sortOrder: (accounts?.length ?? 0) + 1,
      archivedAt: null,
      note: null,
    })

    // 2. Create the associated LoanTerms
    const newTerms: LoanTerms = {
      id: crypto.randomUUID(),
      userId: user.id,
      accountId: createdAccount.id,
      direction,
      counterparty: null,
      principalMinor,
      annualRateBps: rateBps,
      tenureMonths: tenure,
      startDate: today,
      emiMinor,
      paymentDay: payDay,
      interestCategoryId: null,
      rateType: 'reducing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      serverSeq: null,
      version: 1,
    }

    await db.loanTerms.add(newTerms)

    setIsNewLoanOpen(false)
    setLoanName('')
    setPrincipalStr('')
    setSelectedAccountId(createdAccount.id)
  }

  if (isLoading) {
    return (
      <Page width="default" className="space-y-6">
        <SkeletonCard className="h-48" />
        <SkeletonCard className="h-32" />
      </Page>
    )
  }

  return (
    <Page width="default" className="space-y-6 pb-20">
      {/* Header */}
      <PageHeader
        title={t('nav.loans', 'Loans & Debt')}
        subtitle="Track mortgages, personal loans, EMI schedules, and payoff progress"
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={16} />}
            onClick={() => setIsNewLoanOpen(true)}
          >
            New Loan
          </Button>
        }
      />

      {loanAccounts.length === 0 ? (
        <EmptyState
          icon={<Building size={28} />}
          title="No active loans"
          description="Track home loans, car loans, education debt, or money lent to friends with full amortization schedules."
          actionLabel="New Loan"
          onAction={() => setIsNewLoanOpen(true)}
        />
      ) : (
        <div className="space-y-6">
          {/* Loan Account Switcher Pills */}
          {loanAccounts.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {loanAccounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setSelectedAccountId(acc.id)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-xs font-semibold border transition-all shrink-0',
                    selectedAccount?.id === acc.id
                      ? 'border-primary bg-primary/10 text-primary shadow-xs'
                      : 'border-border bg-surface-elevated text-text hover:bg-surface-overlay',
                  )}
                >
                  {acc.name}
                </button>
              ))}
            </div>
          )}

          {selectedAccount && selectedTerms && (
            <>
              {/* Hero Payoff Progress Card */}
              <Card variant="hero" className="p-6 sm:p-7 rounded-3xl relative overflow-hidden space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted block">
                      Outstanding Principal
                    </span>
                    <Amount
                      minor={currentBalanceMinor}
                      currency={selectedAccount.currency}
                      tone="danger"
                      showSign={false}
                      size="display"
                      className="font-extrabold block mt-1"
                    />
                    <span className="text-xs text-text-muted mt-1 block">
                      Original: {formatMoney(selectedTerms.principalMinor, selectedAccount.currency, locale)} •{' '}
                      {(selectedTerms.annualRateBps / 100).toFixed(2)}% p.a.
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<CheckCircle2 size={16} />}
                      onClick={() => {
                        const bankAccounts = accounts?.filter((a) => a.kind !== 'loan')
                        if (bankAccounts && bankAccounts.length > 0 && !payingAccountId) {
                          setPayingAccountId(bankAccounts[0]!.id)
                        }
                        setIsRecordEmiOpen(true)
                      }}
                    >
                      Record EMI Payment
                    </Button>
                  </div>
                </div>

                {/* Payoff Progress */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-text-muted font-medium">Payoff Progress</span>
                    <span className="font-bold text-text">{payoff.percentPaid}% paid off</span>
                  </div>
                  <ProgressBar
                    value={payoff.percentPaid}
                    max={100}
                    tone="primary"
                    size="md"
                  />
                  <div className="flex justify-between text-[11px] text-text-muted">
                    <span>Paid: {formatMoney(payoff.paidPrincipal, selectedAccount.currency, locale)}</span>
                    <span>Remaining: {formatMoney(currentBalanceMinor, selectedAccount.currency, locale)}</span>
                  </div>
                </div>

                {/* Next Payment info */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-3 border-t border-border/40 text-xs">
                  <div>
                    <span className="text-text-muted block">Monthly EMI</span>
                    <Amount
                      minor={selectedTerms.emiMinor ?? 0}
                      currency={selectedAccount.currency}
                      tone="neutral"
                      showSign={false}
                      className="font-bold text-sm text-text block mt-0.5"
                    />
                  </div>
                  <div>
                    <span className="text-text-muted block">Payment Day</span>
                    <span className="font-bold text-sm text-text block mt-0.5">
                      {selectedTerms.paymentDay}th of month
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted block">Remaining Tenure</span>
                    <span className="font-bold text-sm text-text block mt-0.5">
                      {schedule.length} months
                    </span>
                  </div>
                </div>
              </Card>

              {/* Amortization Schedule Preview */}
              <Card className="p-5 space-y-4 rounded-2xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-text">Amortization Schedule</h3>
                  <span className="text-xs text-text-muted">{schedule.length} installments</span>
                </div>

                <div className="overflow-x-auto no-scrollbar -mx-5 px-5">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-text-muted uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 pr-3">#</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">EMI</th>
                        <th className="py-2.5 px-3">Principal</th>
                        <th className="py-2.5 px-3">Interest</th>
                        <th className="py-2.5 pl-3 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {schedule.slice(0, 12).map((row) => (
                        <tr key={row.installmentNumber} className="hover:bg-surface-overlay/40 transition-colors">
                          <td className="py-2.5 pr-3 font-semibold text-text">{row.installmentNumber}</td>
                          <td className="py-2.5 px-3 text-text-muted">{row.dueDate}</td>
                          <td className="py-2.5 px-3 font-bold text-text">
                            {formatMoney(row.emiMinor, selectedAccount.currency, locale)}
                          </td>
                          <td className="py-2.5 px-3 text-success font-medium">
                            {formatMoney(row.principalPartMinor, selectedAccount.currency, locale)}
                          </td>
                          <td className="py-2.5 px-3 text-danger font-medium">
                            {formatMoney(row.interestPartMinor, selectedAccount.currency, locale)}
                          </td>
                          <td className="py-2.5 pl-3 text-right text-text-muted">
                            {formatMoney(row.outstandingAfterMinor, selectedAccount.currency, locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {schedule.length > 12 && (
                  <p className="text-center text-[11px] text-text-muted pt-1">
                    Showing first 12 of {schedule.length} installments
                  </p>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* Record EMI Modal */}
      <Modal
        isOpen={isRecordEmiOpen}
        onClose={() => setIsRecordEmiOpen(false)}
        title="Record EMI Installment"
      >
        <form onSubmit={handleRecordEmi} className="space-y-4 py-1">
          {schedule[0] && (
            <div className="p-3 bg-surface-overlay/50 rounded-xl space-y-1.5 text-xs border border-border/40">
              <div className="flex justify-between">
                <span className="text-text-muted">EMI Amount:</span>
                <span className="font-bold text-text">
                  {formatMoney(schedule[0].emiMinor, selectedAccount?.currency ?? baseCurrency, locale)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Principal Component:</span>
                <span className="font-medium text-success">
                  {formatMoney(schedule[0].principalPartMinor, selectedAccount?.currency ?? baseCurrency, locale)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Interest Component:</span>
                <span className="font-medium text-danger">
                  {formatMoney(schedule[0].interestPartMinor, selectedAccount?.currency ?? baseCurrency, locale)}
                </span>
              </div>
            </div>
          )}

          <Select
            label="Paid from Account"
            value={payingAccountId}
            onChange={(e) => setPayingAccountId(e.target.value)}
            required
            options={
              accounts
                ?.filter((a) => a.kind !== 'loan')
                .map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })) ?? []
            }
          />

          <div className="flex items-center gap-3 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setIsRecordEmiOpen(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary" className="flex-1">
              Confirm Payment
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Loan Modal */}
      <Modal
        isOpen={isNewLoanOpen}
        onClose={() => setIsNewLoanOpen(false)}
        title="Add New Loan"
      >
        <form onSubmit={handleCreateLoan} className="space-y-4 py-1">
          <Input
            label="Loan / Debt Name"
            placeholder="e.g. HDFC Home Loan, Car Loan"
            value={loanName}
            onChange={(e) => setLoanName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'borrowed' | 'lent')}
              options={[
                { value: 'borrowed', label: 'Borrowed (I owe)' },
                { value: 'lent', label: 'Lent (Someone owes me)' },
              ]}
            />

            <Input
              type="text"
              inputMode="decimal"
              label="Principal Amount"
              placeholder="0.00"
              value={principalStr}
              onChange={(e) => setPrincipalStr(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              type="number"
              step="0.01"
              label="Interest % p.a."
              value={rateStr}
              onChange={(e) => setRateStr(e.target.value)}
              required
            />

            <Input
              type="number"
              label="Tenure (Months)"
              value={tenureMonths}
              onChange={(e) => setTenureMonths(e.target.value)}
              required
            />

            <Input
              type="number"
              min="1"
              max="28"
              label="Payment Day"
              value={paymentDay}
              onChange={(e) => setPaymentDay(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setIsNewLoanOpen(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary" className="flex-1">
              Create Loan
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
  )
}
