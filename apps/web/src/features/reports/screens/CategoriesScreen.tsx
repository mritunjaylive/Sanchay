import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { useAuthStore } from '../../auth/stores/authStore'
import { calculateCategoryBreakdown } from '../../../domain/reports'
import { periodFor, addOneMonth, subtractOneMonth } from '../../../domain/dates'
import { formatMoney } from '../../../lib/money'
import {
  Page,
  PageHeader,
  Card,
  Amount,
  SegmentedControl,
  Button,
  Badge,
  CategoryIcon,
  EmptyState,
  SkeletonCard,
  ProgressBar,
} from '../../../ui'
import { ReportHeader } from '../components/ReportHeader'
import { PieChart, Table as TableIcon, ChevronLeft, ChevronRight, FolderMinus } from 'lucide-react'

const DEFAULT_COLORS = [
  '#0F766E', // teal
  '#D97706', // amber/gold
  '#2563EB', // blue
  '#7C3AED', // violet
  '#EC4899', // pink
  '#10B981', // emerald
  '#F59E0B', // yellow
  '#6366F1', // indigo
  '#14B8A6', // cyan
  '#64748B', // slate
]

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

  const categoryMap = useMemo(() => {
    const map = new Map<string, (typeof categories extends (infer U)[] | undefined ? U : never)>()
    categories?.forEach((c) => map.set(c.id, c))
    return map
  }, [categories])

  const breakdown = useMemo(() => {
    if (!transactions || !categories) return []
    return calculateCategoryBreakdown(transactions, categories, start, end, kind)
  }, [transactions, categories, start, end, kind])

  const totalAmount = useMemo(() => {
    return breakdown.reduce((sum, item) => sum + item.amountMinor, 0)
  }, [breakdown])

  const chartData = useMemo(() => {
    return breakdown.map((item, idx) => ({
      name: item.name,
      value: item.amountMinor,
      percentage: item.percentage,
      color: item.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length] || '#0F766E',
    }))
  }, [breakdown])

  if (transactions === undefined || categories === undefined) {
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
        title={t('reports.categoryBreakdown', 'Category Breakdown')}
        subtitle={`${kind === 'expense' ? 'Spending distribution' : 'Income distribution'} (${start} → ${end})`}
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

            {/* View Mode Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode(viewMode === 'visual' ? 'table' : 'visual')}
              aria-label={viewMode === 'visual' ? 'View as table' : 'View chart'}
              className="h-9 px-2.5"
            >
              {viewMode === 'visual' ? <TableIcon size={16} /> : <PieChart size={16} />}
            </Button>
          </div>
        }
      />

      {/* Kind selector (Expenses vs Income) */}
      <div className="flex justify-center sm:justify-start">
        <SegmentedControl
          value={kind}
          onChange={(v) => setKind(v as 'expense' | 'income')}
          options={[
            { value: 'expense', label: t('reports.expenses', 'Expenses') },
            { value: 'income', label: t('reports.income', 'Income') },
          ]}
          size="sm"
          className="w-full sm:w-64"
        />
      </div>

      {breakdown.length === 0 ? (
        <EmptyState
          icon={<FolderMinus size={32} />}
          title={t('reports.noDataForPeriod', 'No category data recorded for this month.')}
          description="Transactions recorded in this period will appear with full breakdown and donut chart."
        />
      ) : (
        <div className="space-y-6">
          {/* Total Hero Banner */}
          <Card className="p-5 rounded-2xl flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Total {kind === 'expense' ? 'Spent' : 'Earned'}
            </span>
            <Amount
              minor={totalAmount}
              currency={baseCurrency}
              tone={kind === 'expense' ? 'neutral' : 'income'}
              showSign={false}
              size="lg"
              className="font-black"
            />
          </Card>

          {viewMode === 'visual' ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Donut Chart with Center Total */}
              <Card className="md:col-span-5 p-6 rounded-2xl flex flex-col items-center justify-center relative">
                <div className="w-full h-64 relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
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
                      <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={68}
                        outerRadius={92}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </RechartsPie>
                  </ResponsiveContainer>

                  {/* Donut Center Label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
                    <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">
                      {breakdown.length} Categories
                    </span>
                    <span className="text-base font-black text-text mt-0.5 truncate max-w-[120px]">
                      {formatMoney(totalAmount, baseCurrency, locale)}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Category Breakdown List */}
              <Card className="md:col-span-7 p-5 rounded-2xl divide-y divide-border/40 space-y-3">
                <div className="flex items-center justify-between pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    Ranked Breakdown
                  </h3>
                  <span className="text-xs text-text-muted">100% Total</span>
                </div>

                {breakdown.map((item, idx) => {
                  const cat = categoryMap.get(item.categoryId)
                  const color = item.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length] || '#0F766E'

                  return (
                    <div key={item.categoryId} className="pt-3 first:pt-0 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <CategoryIcon
                            icon={cat?.icon ?? 'folder'}
                            color={color}
                            size="sm"
                          />
                          <span className="font-bold text-sm text-text">{item.name}</span>
                          <Badge variant="neutral" size="sm">
                            {item.percentage}%
                          </Badge>
                        </div>
                        <Amount
                          minor={item.amountMinor}
                          currency={baseCurrency}
                          tone="neutral"
                          showSign={false}
                          className="font-bold text-sm text-text"
                        />
                      </div>

                      <ProgressBar
                        value={item.percentage}
                        max={100}
                        tone="auto"
                        size="sm"
                      />

                      {item.subcategories && item.subcategories.length > 0 && (
                        <div className="pl-9 pt-1 space-y-1 text-xs text-text-muted">
                          {item.subcategories.map((sub) => (
                            <div key={sub.categoryId} className="flex justify-between">
                              <span>↳ {sub.name}</span>
                              <span>
                                {formatMoney(sub.amountMinor, baseCurrency, locale)} ({sub.percentage}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </Card>
            </div>
          ) : (
            <Card className="p-0 rounded-2xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-overlay text-text-muted uppercase text-[10px] tracking-wider border-b border-border/50">
                  <tr>
                    <th className="p-3.5">Category</th>
                    <th className="p-3.5">Transactions</th>
                    <th className="p-3.5">Share</th>
                    <th className="p-3.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 text-text">
                  {breakdown.map((item) => (
                    <tr key={item.categoryId} className="hover:bg-surface-overlay/40 transition-colors">
                      <td className="p-3.5 font-bold flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color || '#0F766E' }}
                        />
                        {item.name}
                      </td>
                      <td className="p-3.5 text-text-muted">{item.transactionCount}</td>
                      <td className="p-3.5 font-medium">{item.percentage}%</td>
                      <td className="p-3.5 text-right font-black">
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
    </Page>
  )
}
