import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { useAuthStore } from '../../auth/stores/authStore'
import { calculatePeriodSummary, calculateTopPayees } from '../../../domain/reports'
import { periodFor, subtractOneMonth } from '../../../domain/dates'
import { formatMoney } from '../../../lib/money'
import {
  Page,
  PageHeader,
  Card,
  Amount,
  ProgressBar,
  Select,
  Badge,
  EmptyState,
  SkeletonCard,
} from '../../../ui'
import { ReportHeader } from '../components/ReportHeader'
import { TrendingUp, TrendingDown, PiggyBank, Receipt } from 'lucide-react'

export default function SummaryScreen() {
  const { t } = useTranslation()
  const { baseCurrency, locale } = useSettingsStore()
  const monthStartDay = useAuthStore((s) => s.profile?.monthStartDay) ?? 1

  const todayStr = new Date().toISOString().substring(0, 10)
  const [periodPreset, setPeriodPreset] = useState<'thisMonth' | 'lastMonth' | 'thisYear'>('thisMonth')

  const { start, end } = useMemo(() => {
    if (periodPreset === 'thisMonth') {
      return periodFor(todayStr, monthStartDay)
    } else if (periodPreset === 'lastMonth') {
      const lastMonthStr = subtractOneMonth(todayStr.substring(0, 7))
      return periodFor(`${lastMonthStr}-01`, monthStartDay)
    } else {
      const year = todayStr.substring(0, 4)
      return { start: `${year}-01-01`, end: `${year}-12-31` }
    }
  }, [periodPreset, todayStr, monthStartDay])

  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])

  const summary = useMemo(() => {
    if (!transactions) {
      return { incomeMinor: 0, expenseMinor: 0, netSavingsMinor: 0, savingsRatePercent: 0, transactionCount: 0 }
    }
    return calculatePeriodSummary(transactions, start, end)
  }, [transactions, start, end])

  const topPayees = useMemo(() => {
    if (!transactions) return []
    return calculateTopPayees(transactions, start, end, 8)
  }, [transactions, start, end])

  if (transactions === undefined) {
    return (
      <Page width="default" className="space-y-6">
        <ReportHeader />
        <SkeletonCard className="h-40" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SkeletonCard className="h-28" />
          <SkeletonCard className="h-28" />
          <SkeletonCard className="h-28" />
        </div>
      </Page>
    )
  }

  return (
    <Page width="default" className="space-y-6">
      <ReportHeader />

      <PageHeader
        title={t('reports.financialSummary', 'Financial Summary')}
        subtitle={`${start} → ${end}`}
        action={
          <Select
            value={periodPreset}
            onChange={(e) => setPeriodPreset(e.target.value as 'thisMonth' | 'lastMonth' | 'thisYear')}
            className="w-40 text-xs h-9"
            options={[
              { value: 'thisMonth', label: t('reports.thisMonth', 'This Month') },
              { value: 'lastMonth', label: t('reports.lastMonth', 'Last Month') },
              { value: 'thisYear', label: t('reports.thisYear', 'This Year') },
            ]}
          />
        }
      />

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Income */}
        <Card className="p-5 rounded-2xl relative overflow-hidden space-y-3">
          <div className="flex items-center justify-between text-text-muted text-xs">
            <span className="font-semibold uppercase tracking-wider">{t('reports.totalIncome', 'Income')}</span>
            <div className="w-8 h-8 rounded-xl bg-success/10 text-success flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <Amount
            minor={summary.incomeMinor}
            currency={baseCurrency}
            tone="income"
            showSign={false}
            size="lg"
            className="font-black block"
          />
        </Card>

        {/* Expense */}
        <Card className="p-5 rounded-2xl relative overflow-hidden space-y-3">
          <div className="flex items-center justify-between text-text-muted text-xs">
            <span className="font-semibold uppercase tracking-wider">{t('reports.totalExpense', 'Expense')}</span>
            <div className="w-8 h-8 rounded-xl bg-surface-overlay text-text-muted flex items-center justify-center">
              <TrendingDown size={16} />
            </div>
          </div>
          <Amount
            minor={summary.expenseMinor}
            currency={baseCurrency}
            tone="neutral"
            showSign={false}
            size="lg"
            className="font-black block"
          />
        </Card>

        {/* Net Savings */}
        <Card className="p-5 rounded-2xl relative overflow-hidden space-y-3">
          <div className="flex items-center justify-between text-text-muted text-xs">
            <span className="font-semibold uppercase tracking-wider">{t('reports.netSavings', 'Net Savings')}</span>
            <div className="flex items-center gap-1.5">
              <Badge variant={summary.netSavingsMinor >= 0 ? 'success' : 'danger'} size="sm">
                {summary.savingsRatePercent}%
              </Badge>
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <PiggyBank size={16} />
              </div>
            </div>
          </div>
          <Amount
            minor={summary.netSavingsMinor}
            currency={baseCurrency}
            tone={summary.netSavingsMinor >= 0 ? 'income' : 'danger'}
            showSign={summary.netSavingsMinor < 0}
            size="lg"
            className="font-black block"
          />
          <p className="text-[11px] text-text-muted">
            {summary.transactionCount} transactions recorded
          </p>
        </Card>
      </div>

      {/* Top Payees / Merchants */}
      <Card className="p-6 rounded-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-text">{t('reports.topPayees', 'Top Payees / Merchants')}</h2>
          <span className="text-xs text-text-muted">{topPayees.length} payees</span>
        </div>

        {topPayees.length === 0 ? (
          <EmptyState
            icon={<Receipt size={28} />}
            title={t('reports.noPayeeData', 'No expense payees in this period.')}
            description="Add transactions to see your top merchants and payees ranked here."
          />
        ) : (
          <div className="space-y-4">
            {topPayees.map((p, idx) => {
              const percentOfTotal =
                summary.expenseMinor > 0 ? (p.amountMinor / summary.expenseMinor) * 100 : 0

              return (
                <div key={p.payee} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-text flex items-center gap-2">
                      <span className="text-[11px] text-text-muted w-4 font-normal">{idx + 1}.</span>
                      {p.payee}
                    </span>
                    <span className="text-text">
                      {formatMoney(p.amountMinor, baseCurrency, locale)}{' '}
                      <span className="text-[10px] text-text-muted font-normal">
                        ({Math.round(percentOfTotal)}%)
                      </span>
                    </span>
                  </div>
                  <ProgressBar
                    value={percentOfTotal}
                    max={100}
                    tone="primary"
                    size="sm"
                  />
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </Page>
  )
}
