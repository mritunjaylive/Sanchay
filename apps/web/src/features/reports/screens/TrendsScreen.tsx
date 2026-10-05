import React, { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { calculateMonthlyTrends } from '../../../domain/reports'
import { subtractOneMonth } from '../../../domain/dates'
import { formatMoney } from '../../../lib/money'
import {
  Page,
  PageHeader,
  Card,
  Amount,
  Button,
  EmptyState,
  SkeletonCard,
} from '../../../ui'
import { ReportHeader } from '../components/ReportHeader'
import { Table as TableIcon, BarChart3, TrendingUp, TrendingDown, LineChart } from 'lucide-react'

export default function TrendsScreen() {
  const { t } = useTranslation()
  const { baseCurrency, locale } = useSettingsStore()
  const [viewMode, setViewMode] = useState<'visual' | 'table'>('visual')

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

  const chartData = useMemo(() => {
    return trends.map((item) => ({
      month: item.month,
      monthLabel: item.month.substring(5), // MM
      income: item.incomeMinor,
      expense: item.expenseMinor,
      savings: item.incomeMinor - item.expenseMinor,
    }))
  }, [trends])

  const totals = useMemo(() => {
    const totalIncome = trends.reduce((acc, t) => acc + t.incomeMinor, 0)
    const totalExpense = trends.reduce((acc, t) => acc + t.expenseMinor, 0)
    const count = trends.length || 1
    return {
      avgIncome: Math.round(totalIncome / count),
      avgExpense: Math.round(totalExpense / count),
      netSavings: totalIncome - totalExpense,
    }
  }, [trends])

  if (transactions === undefined) {
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
        title={t('reports.monthlyTrends', 'Monthly Cash Flow Trends')}
        subtitle="Income vs Expense comparisons across the last 6 months"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode(viewMode === 'visual' ? 'table' : 'visual')}
            aria-label={viewMode === 'visual' ? 'View as table' : 'View chart'}
            className="h-9 px-2.5"
          >
            {viewMode === 'visual' ? <TableIcon size={16} /> : <BarChart3 size={16} />}
          </Button>
        }
      />

      {/* 6-Month Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="font-semibold uppercase tracking-wider">Avg Monthly Income</span>
            <div className="w-7 h-7 rounded-lg bg-success/10 text-success flex items-center justify-center">
              <TrendingUp size={14} />
            </div>
          </div>
          <Amount
            minor={totals.avgIncome}
            currency={baseCurrency}
            tone="income"
            showSign={false}
            size="lg"
            className="font-black block"
          />
        </Card>

        <Card className="p-4 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="font-semibold uppercase tracking-wider">Avg Monthly Expense</span>
            <div className="w-7 h-7 rounded-lg bg-surface-overlay text-text-muted flex items-center justify-center">
              <TrendingDown size={14} />
            </div>
          </div>
          <Amount
            minor={totals.avgExpense}
            currency={baseCurrency}
            tone="neutral"
            showSign={false}
            size="lg"
            className="font-black block"
          />
        </Card>

        <Card className="p-4 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="font-semibold uppercase tracking-wider">6-Month Net Savings</span>
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <LineChart size={14} />
            </div>
          </div>
          <Amount
            minor={totals.netSavings}
            currency={baseCurrency}
            tone={totals.netSavings >= 0 ? 'income' : 'danger'}
            showSign={totals.netSavings < 0}
            size="lg"
            className="font-black block"
          />
        </Card>
      </div>

      {trends.length === 0 ? (
        <EmptyState
          icon={<LineChart size={32} />}
          title="No trend data available"
          description="Log income and expense transactions to see historical trends here."
        />
      ) : (
        <div className="space-y-6">
          {viewMode === 'visual' ? (
            <Card className="p-6 rounded-2xl space-y-4">
              {/* Legend */}
              <div className="flex items-center justify-between text-xs pb-2 border-b border-border/40">
                <span className="font-bold text-text-muted uppercase tracking-wider">6-Month Trajectory</span>
                <div className="flex items-center gap-4 font-semibold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-success/80" />
                    <span className="text-text">{t('reports.income', 'Income')} (Area)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#0F766E]" />
                    <span className="text-text">{t('reports.expenses', 'Expenses')} (Bar)</span>
                  </div>
                </div>
              </div>

              {/* Recharts ComposedChart: Area (Income) + Bar (Expense) */}
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="incomeTrendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                    <XAxis
                      dataKey="monthLabel"
                      stroke="var(--color-text-muted)"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="var(--color-text-muted)"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(val) => formatMoney(val, baseCurrency, locale)}
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
                    <Area
                      type="monotone"
                      dataKey="income"
                      name="Income"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#incomeTrendGrad)"
                    />
                    <Bar
                      dataKey="expense"
                      name="Expense"
                      fill="#0F766E"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : (
            <Card className="p-0 rounded-2xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-overlay text-text-muted uppercase text-[10px] tracking-wider border-b border-border/50">
                  <tr>
                    <th className="p-3.5">Month</th>
                    <th className="p-3.5">Income</th>
                    <th className="p-3.5">Expense</th>
                    <th className="p-3.5 text-right">Net Savings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 text-text">
                  {trends.map((item) => {
                    const net = item.incomeMinor - item.expenseMinor
                    return (
                      <tr key={item.month} className="hover:bg-surface-overlay/40 transition-colors">
                        <td className="p-3.5 font-bold">{item.month}</td>
                        <td className="p-3.5 text-success font-semibold">
                          +{formatMoney(item.incomeMinor, baseCurrency, locale)}
                        </td>
                        <td className="p-3.5 text-text font-semibold">
                          -{formatMoney(item.expenseMinor, baseCurrency, locale)}
                        </td>
                        <td className={`p-3.5 text-right font-black ${net >= 0 ? 'text-success' : 'text-danger'}`}>
                          {net >= 0 ? '+' : ''}{formatMoney(net, baseCurrency, locale)}
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
