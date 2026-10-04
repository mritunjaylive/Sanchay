import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { useAuthStore } from '../../auth/stores/authStore'
import { calculatePeriodSummary, calculateTopPayees } from '../../../domain/reports'
import { periodFor, subtractOneMonth } from '../../../domain/dates'
import { formatMoney } from '../../../lib/money'
import { Card, CardHeader, CardTitle, CardContent, Select, Badge } from '../../../ui'
import { ReportHeader } from '../components/ReportHeader'
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react'

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
      // thisYear
      const year = todayStr.substring(0, 4)
      return { start: `${year}-01-01`, end: `${year}-12-31` }
    }
  }, [periodPreset, todayStr, monthStartDay])

  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])

  const summary = useMemo(() => {
    if (!transactions)
      return { incomeMinor: 0, expenseMinor: 0, netSavingsMinor: 0, savingsRatePercent: 0, transactionCount: 0 }
    return calculatePeriodSummary(transactions, start, end)
  }, [transactions, start, end])

  const topPayees = useMemo(() => {
    if (!transactions) return []
    return calculateTopPayees(transactions, start, end, 8)
  }, [transactions, start, end])

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-4xl mx-auto">
      <ReportHeader />

      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">{t('reports.financialSummary', 'Financial Summary')}</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {start} → {end}
          </p>
        </div>

        <Select
          value={periodPreset}
          onChange={(e) => setPeriodPreset(e.target.value as 'thisMonth' | 'lastMonth' | 'thisYear')}
          className="w-44 text-xs h-9"
          options={[
            { value: 'thisMonth', label: t('reports.thisMonth', 'This Month') },
            { value: 'lastMonth', label: t('reports.lastMonth', 'Last Month') },
            { value: 'thisYear', label: t('reports.thisYear', 'This Year') },
          ]}
        />
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between text-text-muted mb-1 text-xs">
            <span className="font-semibold uppercase tracking-wider">{t('reports.totalIncome', 'Income')}</span>
            <div className="w-8 h-8 rounded-full bg-success/10 text-success flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-success mt-1">
            {formatMoney(summary.incomeMinor, baseCurrency, locale)}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-text-muted mb-1 text-xs">
            <span className="font-semibold uppercase tracking-wider">{t('reports.totalExpense', 'Expense')}</span>
            <div className="w-8 h-8 rounded-full bg-danger/10 text-danger flex items-center justify-center">
              <TrendingDown size={16} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-danger mt-1">
            {formatMoney(summary.expenseMinor, baseCurrency, locale)}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-text-muted mb-1 text-xs">
            <span className="font-semibold uppercase tracking-wider">{t('reports.netSavings', 'Net Savings')}</span>
            <Badge variant={summary.netSavingsMinor >= 0 ? 'success' : 'danger'}>
              {summary.savingsRatePercent}%
            </Badge>
          </div>
          <div
            className={`text-2xl font-extrabold mt-1 ${
              summary.netSavingsMinor >= 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {formatMoney(summary.netSavingsMinor, baseCurrency, locale)}
          </div>
          <p className="text-[11px] text-text-muted mt-1">
            {summary.transactionCount} transactions recorded
          </p>
        </Card>
      </div>

      {/* Top Payees / Merchants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('reports.topPayees', 'Top Payees / Merchants')}</CardTitle>
        </CardHeader>
        <CardContent>
          {topPayees.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-xs">
              {t('reports.noPayeeData', 'No expense payees in this period.')}
            </div>
          ) : (
            <div className="space-y-3">
              {topPayees.map((p, idx) => {
                const percentOfTotal =
                  summary.expenseMinor > 0 ? (p.amountMinor / summary.expenseMinor) * 100 : 0

                return (
                  <div key={p.payee} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-text">
                        {idx + 1}. {p.payee}
                      </span>
                      <span>{formatMoney(p.amountMinor, baseCurrency, locale)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-surface-overlay rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, percentOfTotal)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
