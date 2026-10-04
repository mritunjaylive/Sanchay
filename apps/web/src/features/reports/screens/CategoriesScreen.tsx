import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { useAuthStore } from '../../auth/stores/authStore'
import { calculateCategoryBreakdown } from '../../../domain/reports'
import { periodFor } from '../../../domain/dates'
import { formatMoney } from '../../../lib/money'
import { Card, CardHeader, CardTitle, CardContent, Select, Button, Badge } from '../../../ui'
import { ReportHeader } from '../components/ReportHeader'
import { PieChart, Table as TableIcon } from 'lucide-react'

export default function CategoriesScreen() {
  const { t } = useTranslation()
  const { baseCurrency, locale } = useSettingsStore()
  const monthStartDay = useAuthStore((s) => s.profile?.monthStartDay) ?? 1

  const todayStr = new Date().toISOString().substring(0, 10)
  const [currentMonth, setCurrentMonth] = useState(todayStr.substring(0, 7))
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [viewMode, setViewMode] = useState<'visual' | 'table'>('visual')

  const { start, end } = useMemo(() => {
    return periodFor(`${currentMonth}-01`, monthStartDay)
  }, [currentMonth, monthStartDay])

  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])
  const categories = useLiveQuery(() => db.categories.filter((c) => !c.deletedAt).toArray(), [])

  const breakdown = useMemo(() => {
    if (!transactions || !categories) return []
    return calculateCategoryBreakdown(transactions, categories, start, end, kind)
  }, [transactions, categories, start, end, kind])

  const totalAmount = useMemo(() => {
    return breakdown.reduce((sum, item) => sum + item.amountMinor, 0)
  }, [breakdown])

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-4xl mx-auto">
      <ReportHeader />

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text">{t('reports.categoryBreakdown', 'Category Breakdown')}</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {kind === 'expense' ? 'Spending distribution' : 'Income distribution'} for {currentMonth}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Expense vs Income toggle */}
          <div className="flex bg-surface-elevated border border-border rounded-lg p-1">
            <button
              type="button"
              onClick={() => setKind('expense')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                kind === 'expense' ? 'bg-danger text-white' : 'text-text-muted hover:text-text'
              }`}
            >
              {t('reports.expenses', 'Expenses')}
            </button>
            <button
              type="button"
              onClick={() => setKind('income')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                kind === 'income' ? 'bg-success text-white' : 'text-text-muted hover:text-text'
              }`}
            >
              {t('reports.income', 'Income')}
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode(viewMode === 'visual' ? 'table' : 'visual')}
            title="Toggle table view"
          >
            {viewMode === 'visual' ? <TableIcon size={16} /> : <PieChart size={16} />}
          </Button>
        </div>
      </div>

      {breakdown.length === 0 ? (
        <Card className="py-16 text-center text-text-muted text-sm">
          {t('reports.noDataForPeriod', 'No category data recorded for this month.')}
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Total Banner */}
          <Card className="p-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-text-muted">Total {kind === 'expense' ? 'Spent' : 'Earned'}</span>
            <span className="text-2xl font-extrabold text-text">
              {formatMoney(totalAmount, baseCurrency, locale)}
            </span>
          </Card>

          {/* Ranked Category List with Progress bars or Accessible Table */}
          {viewMode === 'visual' ? (
            <Card className="divide-y divide-border/50 p-2">
              {breakdown.map((item) => (
                <div key={item.categoryId} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-text">{item.name}</span>
                      <Badge variant="neutral" size="sm">
                        {item.percentage}%
                      </Badge>
                    </div>
                    <span className="font-bold text-sm text-text">
                      {formatMoney(item.amountMinor, baseCurrency, locale)}
                    </span>
                  </div>

                  <div className="w-full h-2 bg-surface-overlay rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, item.percentage)}%`,
                        backgroundColor: item.color || '#3b82f6',
                      }}
                    />
                  </div>

                  {item.subcategories && item.subcategories.length > 0 && (
                    <div className="pl-4 pt-1 space-y-1 text-xs text-text-muted">
                      {item.subcategories.map((sub) => (
                        <div key={sub.categoryId} className="flex justify-between">
                          <span>↳ {sub.name}</span>
                          <span>{formatMoney(sub.amountMinor, baseCurrency, locale)} ({sub.percentage}%)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </Card>
          ) : (
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-overlay text-text-muted uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Category</th>
                    <th className="p-3">Transactions</th>
                    <th className="p-3">Share</th>
                    <th className="p-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 text-text">
                  {breakdown.map((item) => (
                    <tr key={item.categoryId} className="hover:bg-surface-overlay/50">
                      <td className="p-3 font-semibold">{item.name}</td>
                      <td className="p-3 text-text-muted">{item.transactionCount}</td>
                      <td className="p-3 font-medium">{item.percentage}%</td>
                      <td className="p-3 text-right font-bold">
                        {formatMoney(item.amountMinor, baseCurrency, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
