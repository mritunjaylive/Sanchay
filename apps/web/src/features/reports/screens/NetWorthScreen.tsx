import React, { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { netWorth } from '../../../domain/balance'
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
import { ShieldCheck, TrendingUp, Table as TableIcon, AreaChart as AreaChartIcon } from 'lucide-react'

export default function NetWorthScreen() {
  const { t } = useTranslation()
  const { baseCurrency, locale } = useSettingsStore()
  const [viewMode, setViewMode] = useState<'visual' | 'table'>('visual')

  const todayStr = new Date().toISOString().substring(0, 10)
  const currentMonth = todayStr.substring(0, 7)

  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])

  const getBaseAmount = (minor: number) => minor

  // Current Net Worth
  const currentNW = useMemo(() => {
    if (!accounts || !transactions) return { assets: 0, liabilities: 0, netWorth: 0 }
    return netWorth(accounts, transactions, getBaseAmount)
  }, [accounts, transactions])

  // Month-end points for the last 6 months
  const monthlyHistory = useMemo(() => {
    if (!accounts || !transactions) return []

    const history: Array<{
      month: string
      monthLabel: string
      date: string
      assets: number
      liabilities: number
      netWorth: number
    }> = []

    let cursor = currentMonth
    const months: string[] = []
    for (let i = 0; i < 6; i++) {
      months.unshift(cursor)
      cursor = subtractOneMonth(cursor)
    }

    for (const m of months) {
      const parts = m.split('-').map(Number)
      const year = parts[0] ?? 2026
      const month = parts[1] ?? 1
      const lastDay = new Date(year, month, 0).getDate()
      const dateStr = `${m}-${String(lastDay).padStart(2, '0')}`

      const txUpToDate = transactions.filter((tx) => tx.occurredOn <= dateStr)
      const nw = netWorth(accounts, txUpToDate, getBaseAmount)
      history.push({
        month: m,
        monthLabel: m.substring(5),
        date: dateStr,
        ...nw,
      })
    }

    return history
  }, [accounts, transactions, currentMonth])

  if (accounts === undefined || transactions === undefined) {
    return (
      <Page width="default" className="space-y-6">
        <ReportHeader />
        <SkeletonCard className="h-44" />
        <SkeletonCard className="h-64" />
      </Page>
    )
  }

  return (
    <Page width="default" className="space-y-6">
      <ReportHeader />

      <PageHeader
        title={t('reports.netWorthHistory', 'Net Worth History')}
        subtitle="Assets vs Liabilities trajectory over the last 6 months"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode(viewMode === 'visual' ? 'table' : 'visual')}
            aria-label={viewMode === 'visual' ? 'View as table' : 'View chart'}
            className="h-9 px-2.5"
          >
            {viewMode === 'visual' ? <TableIcon size={16} /> : <AreaChartIcon size={16} />}
          </Button>
        }
      />

      {/* Hero Net Worth Card */}
      <Card variant="hero" className="p-6 rounded-3xl relative overflow-hidden space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Current Net Worth
          </span>
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ShieldCheck size={18} />
          </div>
        </div>

        <Amount
          minor={currentNW.netWorth}
          currency={baseCurrency}
          tone="neutral"
          showSign={currentNW.netWorth < 0}
          size="display"
          className="font-black block"
        />

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/40 text-xs">
          <div>
            <span className="text-text-muted block">Total Assets</span>
            <Amount
              minor={currentNW.assets}
              currency={baseCurrency}
              tone="income"
              showSign={false}
              size="lg"
              className="font-bold block mt-0.5"
            />
          </div>
          <div>
            <span className="text-text-muted block">Total Liabilities</span>
            <Amount
              minor={currentNW.liabilities}
              currency={baseCurrency}
              tone="danger"
              showSign={false}
              size="lg"
              className="font-bold block mt-0.5"
            />
          </div>
        </div>
      </Card>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={32} />}
          title="No accounts found"
          description="Add bank accounts, credit cards, or investments to start tracking your net worth."
        />
      ) : (
        <div className="space-y-6">
          {viewMode === 'visual' ? (
            <Card className="p-6 rounded-2xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border/40 text-xs">
                <span className="font-bold text-text-muted uppercase tracking-wider">
                  6-Month Valuation Trajectory
                </span>
                <span className="text-text-muted font-medium">Month-end balances</span>
              </div>

              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0F766E" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#0F766E" stopOpacity={0.0} />
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
                      dataKey="netWorth"
                      name="Net Worth"
                      stroke="#0F766E"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#netWorthGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : (
            <Card className="p-0 rounded-2xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-overlay text-text-muted uppercase text-[10px] tracking-wider border-b border-border/50">
                  <tr>
                    <th className="p-3.5">Month</th>
                    <th className="p-3.5">Assets</th>
                    <th className="p-3.5">Liabilities</th>
                    <th className="p-3.5 text-right">Net Worth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 text-text">
                  {monthlyHistory.map((row) => (
                    <tr key={row.month} className="hover:bg-surface-overlay/40 transition-colors">
                      <td className="p-3.5 font-bold">{row.month}</td>
                      <td className="p-3.5 text-success font-semibold">
                        {formatMoney(row.assets, baseCurrency, locale)}
                      </td>
                      <td className="p-3.5 text-danger font-semibold">
                        {formatMoney(row.liabilities, baseCurrency, locale)}
                      </td>
                      <td className="p-3.5 text-right font-black">
                        {formatMoney(row.netWorth, baseCurrency, locale)}
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
