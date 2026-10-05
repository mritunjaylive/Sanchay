import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { useAuthStore } from '../../auth/stores/authStore'
import { calculateBudgetStatus, getEffectiveBudget } from '../../../domain/budgets'
import { addOneMonth, subtractOneMonth } from '../../../domain/dates'
import { formatMoney } from '../../../lib/money'
import {
  Page,
  PageHeader,
  Card,
  Amount,
  Badge,
  Button,
  EmptyState,
  SkeletonCard,
  ProgressBar,
} from '../../../ui'
import { ReportHeader } from '../components/ReportHeader'
import { ChevronLeft, ChevronRight, Table as TableIcon, BarChart2, Target } from 'lucide-react'

export default function BudgetReportScreen() {
  const { t } = useTranslation()
  const { baseCurrency, locale } = useSettingsStore()
  const monthStartDay = useAuthStore((s) => s.profile?.monthStartDay) ?? 1
  const [viewMode, setViewMode] = useState<'visual' | 'table'>('visual')

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

  const chartData = useMemo(() => {
    return reports.map((item) => {
      const title = item.budget.categoryId
        ? categoryMap.get(item.budget.categoryId) ?? 'Category'
        : 'Overall'
      return {
        name: title,
        budget: item.totalAllowedMinor,
        spent: item.spentMinor,
        remaining: item.remainingMinor,
        status: item.status,
      }
    })
  }, [reports, categoryMap])

  if (allBudgets === undefined || transactions === undefined || categories === undefined) {
    return (
      <Page width="default" className="space-y-6">
        <ReportHeader />
        <SkeletonCard className="h-40" />
        <SkeletonCard className="h-64" />
      </Page>
    )
  }

  return (
    <Page width="default" className="space-y-6">
      <ReportHeader />

      <PageHeader
        title={t('reports.budgetVsActual', 'Budget vs Actual')}
        subtitle={`Adherence and variance for ${currentMonth}`}
        action={
          <div className="flex items-center gap-2">
            {/* Month Switcher */}
            <div className="flex items-center gap-1 bg-surface-elevated border border-border/60 rounded-xl p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setCurrentMonth(subtractOneMonth(currentMonth))}
                className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-overlay focus:outline-none focus:ring-1 focus:ring-primary min-w-[32px] min-h-[32px] flex items-center justify-center transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 text-xs font-bold text-text min-w-[64px] text-center">
                {currentMonth}
              </span>
              <button
                type="button"
                onClick={() => setCurrentMonth(addOneMonth(currentMonth))}
                className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-overlay focus:outline-none focus:ring-1 focus:ring-primary min-w-[32px] min-h-[32px] flex items-center justify-center transition-colors"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode(viewMode === 'visual' ? 'table' : 'visual')}
              aria-label={viewMode === 'visual' ? 'View as table' : 'View chart'}
              className="h-9 px-2.5"
            >
              {viewMode === 'visual' ? <TableIcon size={16} /> : <BarChart2 size={16} />}
            </Button>
          </div>
        }
      />

      {reports.length === 0 ? (
        <EmptyState
          icon={<Target size={32} />}
          title="No budgets configured"
          description={`Set up spending limits in Budgets to compare limits against actual expenses for ${currentMonth}.`}
        />
      ) : (
        <div className="space-y-6">
          {viewMode === 'visual' ? (
            <Card className="p-6 rounded-2xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border/40 text-xs">
                <span className="font-bold text-text-muted uppercase tracking-wider">
                  Limits vs Actual Spending
                </span>
                <div className="flex items-center gap-3 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#CBD5E1] dark:bg-slate-700" />
                    Budget Limit
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#0F766E]" />
                    Actual Spent
                  </span>
                </div>
              </div>

              <div className="h-80 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                    <XAxis
                      type="number"
                      stroke="var(--color-text-muted)"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(val) => formatMoney(val, baseCurrency, locale)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="var(--color-text)"
                      fontSize={11}
                      tickLine={false}
                      width={90}
                    />
                    <Tooltip
                      formatter={(val: number) => formatMoney(val, baseCurrency, locale)}
                      contentStyle={{
                        backgroundColor: 'var(--color-surface-elevated)',
                        borderColor: 'var(--color-border)',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                        color: 'var(--color-text)',
                      }}
                    />
                    <Bar dataKey="budget" name="Budget" fill="#94A3B8" radius={[0, 4, 4, 0]} maxBarSize={18} />
                    <Bar dataKey="spent" name="Spent" fill="#0F766E" radius={[0, 4, 4, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : (
            <Card className="p-0 rounded-2xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-overlay text-text-muted uppercase text-[10px] tracking-wider border-b border-border/50">
                  <tr>
                    <th className="p-3.5">Category</th>
                    <th className="p-3.5">Budget</th>
                    <th className="p-3.5">Actual Spent</th>
                    <th className="p-3.5">Remaining</th>
                    <th className="p-3.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 text-text">
                  {reports.map((item) => {
                    const title = item.budget.categoryId
                      ? categoryMap.get(item.budget.categoryId) ?? 'Category'
                      : 'Overall Budget'
                    const isOver = item.status === 'over'
                    const isWarning = item.status === 'warning'

                    return (
                      <tr key={item.budget.id} className="hover:bg-surface-overlay/40 transition-colors">
                        <td className="p-3.5 font-bold">{title}</td>
                        <td className="p-3.5 font-semibold text-text-muted">
                          {formatMoney(item.totalAllowedMinor, baseCurrency, locale)}
                        </td>
                        <td className="p-3.5 font-bold text-text">
                          {formatMoney(item.spentMinor, baseCurrency, locale)}
                        </td>
                        <td
                          className={`p-3.5 font-black ${
                            item.remainingMinor < 0 ? 'text-danger' : 'text-success'
                          }`}
                        >
                          {formatMoney(item.remainingMinor, baseCurrency, locale)}
                        </td>
                        <td className="p-3.5 text-right">
                          <Badge
                            variant={isOver ? 'danger' : isWarning ? 'warning' : 'success'}
                            size="sm"
                          >
                            {isOver ? 'Over' : isWarning ? 'Warning' : 'On Track'}
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
      )}
    </Page>
  )
}
