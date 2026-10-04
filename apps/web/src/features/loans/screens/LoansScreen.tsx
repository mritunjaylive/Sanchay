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
import { formatMoney, parseAmountToMinor } from '../../../lib/money'
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Select, Modal, Badge } from '../../../ui'
import { Plus, Landmark, DollarSign, Calendar, CheckCircle2, ArrowRight } from 'lucide-react'
import type { Account, LoanTerms } from '@sanchay/shared'

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

  const handleRecordEmi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !selectedAccount || !selectedTerms || !payingAccountId) return

    // Find the next unpaid installment
    const installmentIndex = 0 // first row of schedule
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
    const annualRatePercent = parseFloat(rateStr) || 0
    const annualRateBps = percentToBps(annualRatePercent)
    const tenure = parseInt(tenureMonths, 10) || 12
    const pDay = parseInt(paymentDay, 10) || 1

    const emiMinor = computeReducingEmi(principalMinor, annualRateBps, tenure)

    // 1. Create account
    const account = await accountRepo.create({
      userId: user.id,
      name: loanName.trim(),
      kind: 'loan',
      currency: baseCurrency,
      openingBalanceMinor: direction === 'borrowed' ? -principalMinor : principalMinor,
      openingDate: new Date().toISOString().substring(0, 10),
      creditLimitMinor: null,
      statementDay: null,
      dueDay: pDay,
      note: null,
      excludeFromNetWorth: false,
      icon: 'Building',
      color: '#6366f1',
      sortOrder: accounts?.length ?? 0,
      archivedAt: null,
    })

    // 2. Save loan terms
    await accountRepo.saveLoanTerms({
      accountId: account.id,
      userId: user.id,
      direction,
      principalMinor,
      annualRateBps,
      rateType: 'reducing',
      tenureMonths: tenure,
      startDate: new Date().toISOString().substring(0, 10),
      paymentDay: pDay,
      emiMinor,
      counterparty: null,
      interestCategoryId: null,
    })

    setIsNewLoanOpen(false)
    setSelectedAccountId(account.id)
  }

  const regularAccounts = (accounts ?? []).filter((a) => a.kind !== 'loan' && a.kind !== 'credit_card')

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('loans.title', 'Loans & Debts')}</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {t('loans.subtitle', 'Track borrowed/lent loans, amortization schedules, and EMI payments')}
          </p>
        </div>

        <Button
          variant="primary"
          leftIcon={<Plus size={16} />}
          onClick={() => setIsNewLoanOpen(true)}
        >
          {t('loans.newLoan', 'Add Loan / Debt')}
        </Button>
      </div>

      {loanAccounts.length === 0 ? (
        <Card className="py-16 text-center text-text-muted">
          <p className="text-base font-medium">{t('loans.noLoans', 'No active loans or debts.')}</p>
          <p className="text-xs mt-1">
            {t('loans.createHint', 'Add home loans, personal loans, vehicle finance, or money lent to friends.')}
          </p>
          <Button variant="primary" size="sm" className="mt-4" onClick={() => setIsNewLoanOpen(true)}>
            {t('loans.newLoan', 'Add Loan / Debt')}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Loan Selector & Summary */}
          <div className="space-y-4">
            <div className="space-y-2">
              {loanAccounts.map((acc) => {
                const terms = loanTerms?.find((l) => l.accountId === acc.id)
                const isSelected = selectedAccount?.id === acc.id

                return (
                  <Card
                    key={acc.id}
                    onClick={() => setSelectedAccountId(acc.id)}
                    className={`cursor-pointer transition-all p-4 ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                        : 'hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-text text-sm">{acc.name}</h4>
                      <Badge variant={terms?.direction === 'lent' ? 'success' : 'danger'} size="sm">
                        {terms?.direction === 'lent' ? 'Lent' : 'Borrowed'}
                      </Badge>
                    </div>
                    {terms && (
                      <div className="mt-2 text-xs text-text-muted flex justify-between">
                        <span>EMI: {formatMoney(terms.emiMinor ?? 0, acc.currency, locale)}</span>
                        <span>{(terms.annualRateBps / 100).toFixed(1)}% APR</span>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>

            {selectedAccount && selectedTerms && (
              <Card className="p-4 space-y-3 bg-surface-elevated">
                <CardTitle className="text-sm">{t('loans.loanSummary', 'Loan Overview')}</CardTitle>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-text-muted">{t('loans.principal', 'Principal')}</span>
                    <span className="font-bold text-text">
                      {formatMoney(selectedTerms.principalMinor, selectedAccount.currency, locale)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">{t('loans.rate', 'Interest Rate')}</span>
                    <span className="font-bold text-text">{(selectedTerms.annualRateBps / 100).toFixed(1)}% ({selectedTerms.rateType})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">{t('loans.tenure', 'Tenure')}</span>
                    <span className="font-bold text-text">{selectedTerms.tenureMonths} months</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">{t('loans.monthlyEmi', 'Monthly EMI')}</span>
                    <span className="font-bold text-primary">
                      {formatMoney(selectedTerms.emiMinor ?? 0, selectedAccount.currency, locale)}
                    </span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  className="w-full mt-2"
                  onClick={() => {
                    if (regularAccounts.length > 0) setPayingAccountId(regularAccounts[0]!.id)
                    setIsRecordEmiOpen(true)
                  }}
                >
                  {t('loans.recordEmi', 'Record EMI Payment')}
                </Button>
              </Card>
            )}
          </div>

          {/* Right Column (2 cols): Amortization Schedule */}
          <div className="lg:col-span-2">
            <Card className="p-0 overflow-hidden">
              <CardHeader className="p-4">
                <CardTitle className="text-sm">{t('loans.amortizationSchedule', 'Amortization Schedule')}</CardTitle>
                <span className="text-xs text-text-muted">{schedule.length} installments</span>
              </CardHeader>
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-surface-overlay text-text-muted sticky top-0 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Due Date</th>
                      <th className="p-3">Principal</th>
                      <th className="p-3">Interest</th>
                      <th className="p-3">EMI</th>
                      <th className="p-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50 text-text">
                    {schedule.slice(0, 36).map((inst) => (
                      <tr key={inst.installmentNumber} className="hover:bg-surface-overlay/50">
                        <td className="p-3 font-semibold">{inst.installmentNumber}</td>
                        <td className="p-3 text-text-muted">{inst.dueDate}</td>
                        <td className="p-3">{formatMoney(inst.principalPartMinor, selectedAccount?.currency ?? baseCurrency, locale)}</td>
                        <td className="p-3 text-danger">{formatMoney(inst.interestPartMinor, selectedAccount?.currency ?? baseCurrency, locale)}</td>
                        <td className="p-3 font-bold">{formatMoney(inst.emiMinor, selectedAccount?.currency ?? baseCurrency, locale)}</td>
                        <td className="p-3 text-right font-medium">{formatMoney(inst.outstandingAfterMinor, selectedAccount?.currency ?? baseCurrency, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Record EMI Modal */}
      <Modal
        isOpen={isRecordEmiOpen}
        onClose={() => setIsRecordEmiOpen(false)}
        title={t('loans.recordEmiTitle', 'Record EMI')}
        description={t(
          'loans.recordEmiDesc',
          'This will record a transfer for the principal and an expense for the interest part.',
        )}
      >
        <form onSubmit={handleRecordEmi} className="space-y-4">
          <Select
            label={t('loans.payingAccount', 'Paying Bank / Account')}
            value={payingAccountId}
            onChange={(e) => setPayingAccountId(e.target.value)}
            required
            options={regularAccounts.map((a) => ({ value: a.id, label: a.name }))}
          />

          {schedule.length > 0 && (
            <div className="p-3 bg-surface rounded-xl border border-border space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Principal Part:</span>
                <span className="font-semibold text-text">
                  {formatMoney(schedule[0]!.principalPartMinor, selectedAccount?.currency ?? baseCurrency, locale)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Interest Part:</span>
                <span className="font-semibold text-danger">
                  {formatMoney(schedule[0]!.interestPartMinor, selectedAccount?.currency ?? baseCurrency, locale)}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-border font-bold text-sm">
                <span>Total EMI:</span>
                <span className="text-primary">
                  {formatMoney(schedule[0]!.emiMinor, selectedAccount?.currency ?? baseCurrency, locale)}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsRecordEmiOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('loans.confirmEmi', 'Confirm EMI Payment')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Loan Modal */}
      <Modal
        isOpen={isNewLoanOpen}
        onClose={() => setIsNewLoanOpen(false)}
        title={t('loans.newLoanTitle', 'Add Loan / Debt')}
      >
        <form onSubmit={handleCreateLoan} className="space-y-4">
          <Input
            label={t('loans.loanName', 'Loan / Counterparty Name')}
            placeholder="e.g. HDFC Home Loan, Lent to Aman"
            value={loanName}
            onChange={(e) => setLoanName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('loans.direction', 'Direction')}
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'borrowed' | 'lent')}
              options={[
                { value: 'borrowed', label: 'Borrowed (I owe)' },
                { value: 'lent', label: 'Lent (They owe me)' },
              ]}
            />
            <Input
              type="text"
              inputMode="decimal"
              label={t('loans.principal', 'Principal Amount')}
              placeholder="e.g. 500000"
              value={principalStr}
              onChange={(e) => setPrincipalStr(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              type="text"
              inputMode="decimal"
              label={t('loans.annualRate', 'Interest %')}
              value={rateStr}
              onChange={(e) => setRateStr(e.target.value)}
              required
            />
            <Input
              type="number"
              min="1"
              max="360"
              label={t('loans.tenureMonths', 'Months')}
              value={tenureMonths}
              onChange={(e) => setTenureMonths(e.target.value)}
              required
            />
            <Input
              type="number"
              min="1"
              max="31"
              label={t('loans.paymentDay', 'Day (1-31)')}
              value={paymentDay}
              onChange={(e) => setPaymentDay(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsNewLoanOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('common.save', 'Save Loan')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
