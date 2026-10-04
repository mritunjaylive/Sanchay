import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { useAuthStore } from '../../auth/stores/authStore'
import { calculateBudgetStatus, getEffectiveBudget } from '../../../domain/budgets'
import { formatMoney } from '../../../lib/money'
import { Card, CardHeader, CardTitle, CardContent, Badge } from '../../../ui'
import { ReportHeader } from '../components/ReportHeader'

export default function BudgetReportScreen() {
  const { t } = useTranslation()
  const { baseCurrency, locale } = useSettingsStore()
  const monthStartDay = useAuthStore((s) => s.profile?.monthStartDay) ?? 1

  const todayStr = new Date().toISOString().substring(0, 10)
  const [currentMonth, setCurrentMonth] = useState(todayStr.substring(0, 7))

  const allBudgets = useLiveQuery(() => db.budgets.filter((b) => !b.deletedAt).toArray(), [])
  const categories = useLiveQuery(() => db.categories.filter((c) => !c.deletedAt).toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>()
    categories?.forEach((c) => map.set(c.id, c.name))
    return map
  }, [categories])

  const reports = useMemo(() => {
    if (!allBudgets || !transactions) return []

    const list = []
    const overallEffective = getEffectiveBudget(allBudgets, null, currentMonth)
    if (overallEffective) list.push(overallEffective)

    const categoryIds = Array.from(new Set(allBudgets.map((b) => b.categoryId).filter(Boolean))) as string[]
    for (const catId of categoryIds) {
      const eff = getEffectiveBudget(allBudgets, catId, currentMonth)
      if (eff) list.push(eff)
    }

    return list.map((b) =>
      calculateBudgetStatus(
        b,
        allBudgets,
        transactions,
        `${currentMonth}-01`,
        monthStartDay,
        todayStr,
      ),
    )
  }, [allBudgets, transactions, currentMonth, monthStartDay, todayStr])

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-4xl mx-auto">
      <ReportHeader />

      <div>
        <h1 className="text-xl font-bold text-text">{t('reports.budgetVsActual', 'Budget vs Actual')}</h1>
        <p className="text-xs text-text-muted mt-0.5">
          Budget adherence and variance for {currentMonth}
        </p>
      </div>

      {reports.length === 0 ? (
        <Card className="py-16 text-center text-text-muted text-sm">
          No budgets configured for this period.
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-overlay text-text-muted uppercase text-[10px]">
              <tr>
                <th className="p-3">Category</th>
                <th className="p-3">Budget</th>
                <th className="p-3">Actual Spent</th>
                <th className="p-3">Remaining</th>
                <th className="p-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-text">
              {reports.map((item) => {
                const title = item.budget.categoryId ? categoryMap.get(item.budget.categoryId) ?? 'Category' : 'Overall Budget'
                const isOver = item.status === 'over'
                const isWarning = item.status === 'warning'

                return (
                  <tr key={item.budget.id} className="hover:bg-surface-overlay/50">
                    <td className="p-3 font-semibold">{title}</td>
                    <td className="p-3 font-medium">
                      {formatMoney(item.totalAllowedMinor, baseCurrency, locale)}
                    </td>
                    <td className="p-3 font-medium">
                      {formatMoney(item.spentMinor, baseCurrency, locale)}
                    </td>
                    <td className={`p-3 font-bold ${item.remainingMinor < 0 ? 'text-danger' : 'text-success'}`}>
                      {formatMoney(item.remainingMinor, baseCurrency, locale)}
                    </td>
                    <td className="p-3 text-right">
                      <Badge variant={isOver ? 'danger' : isWarning ? 'warning' : 'success'} size="sm">
                        {item.percentUsed}%
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
