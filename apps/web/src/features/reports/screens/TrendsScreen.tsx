import React, { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { calculateMonthlyTrends } from '../../../domain/reports'
import { subtractOneMonth } from '../../../domain/dates'
import { formatMoney } from '../../../lib/money'
import { Card, CardHeader, CardTitle, CardContent } from '../../../ui'
import { ReportHeader } from '../components/ReportHeader'

export default function TrendsScreen() {
  const { t } = useTranslation()
  const { baseCurrency, locale } = useSettingsStore()

  const todayStr = new Date().toISOString().substring(0, 10)
  const currentMonth = todayStr.substring(0, 7)

  // Past 6 months in chronological order
  const past6Months = useMemo(() => {
    const list: string[] = []
    let cursor = currentMonth
    for (let i = 0; i < 6; i++) {
      list.unshift(cursor)
      cursor = subtractOneMonth(cursor)
    }
    return list
  }, [currentMonth])

  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])

  const trends = useMemo(() => {
    if (!transactions) return []
    return calculateMonthlyTrends(transactions, past6Months)
  }, [transactions, past6Months])

  const maxAmount = useMemo(() => {
    let max = 0
    for (const t of trends) {
      if (t.incomeMinor > max) max = t.incomeMinor
      if (t.expenseMinor > max) max = t.expenseMinor
    }
    return Math.max(1, max)
  }, [trends])

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-4xl mx-auto">
      <ReportHeader />

      <div>
        <h1 className="text-xl font-bold text-text">{t('reports.monthlyTrends', 'Monthly Cash Flow Trends')}</h1>
        <p className="text-xs text-text-muted mt-0.5">
          Income vs Expense comparisons across the last 6 months
        </p>
      </div>

      {/* Visual Bar Chart */}
      <Card className="p-6">
        <div className="flex items-center justify-end gap-4 text-xs font-semibold mb-6">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-xs bg-success" />
            <span>{t('reports.income', 'Income')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-xs bg-danger" />
            <span>{t('reports.expenses', 'Expenses')}</span>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-2 sm:gap-6 items-end h-64 border-b border-border pb-2">
          {trends.map((item) => {
            const incomeHeight = (item.incomeMinor / maxAmount) * 100
            const expenseHeight = (item.expenseMinor / maxAmount) * 100

            return (
              <div key={item.month} className="flex flex-col items-center gap-2 h-full justify-end">
                <div className="flex items-end gap-1 w-full justify-center h-48">
                  {/* Income Bar */}
                  <div
                    className="w-1/2 max-w-[20px] bg-success rounded-t-sm transition-all duration-300"
                    style={{ height: `${Math.max(4, incomeHeight)}%` }}
                    title={`Income: ${formatMoney(item.incomeMinor, baseCurrency, locale)}`}
                  />
                  {/* Expense Bar */}
                  <div
                    className="w-1/2 max-w-[20px] bg-danger rounded-t-sm transition-all duration-300"
                    style={{ height: `${Math.max(4, expenseHeight)}%` }}
                    title={`Expense: ${formatMoney(item.expenseMinor, baseCurrency, locale)}`}
                  />
                </div>
                <span className="text-[11px] font-semibold text-text-muted rotate-[-30deg] sm:rotate-0 mt-1">
                  {item.month.substring(5)}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Accessible Data Table */}
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-xs text-left">
          <thead className="bg-surface-overlay text-text-muted uppercase text-[10px]">
            <tr>
              <th className="p-3">Month</th>
              <th className="p-3">Income</th>
              <th className="p-3">Expense</th>
              <th className="p-3 text-right">Net Savings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-text">
            {trends.map((item) => (
              <tr key={item.month} className="hover:bg-surface-overlay/50">
                <td className="p-3 font-semibold">{item.month}</td>
                <td className="p-3 text-success font-medium">
                  +{formatMoney(item.incomeMinor, baseCurrency, locale)}
                </td>
                <td className="p-3 text-danger font-medium">
                  -{formatMoney(item.expenseMinor, baseCurrency, locale)}
                </td>
                <td
                  className={`p-3 text-right font-bold ${
                    item.netMinor >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {formatMoney(item.netMinor, baseCurrency, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
