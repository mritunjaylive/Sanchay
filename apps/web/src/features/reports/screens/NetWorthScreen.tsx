import React, { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { netWorth, accountBalance, balanceOn } from '../../../domain/balance'
import { subtractOneMonth } from '../../../domain/dates'
import { formatMoney } from '../../../lib/money'
import { Card, CardHeader, CardTitle, CardContent, Badge } from '../../../ui'
import { ReportHeader } from '../components/ReportHeader'
import { ShieldCheck, TrendingUp } from 'lucide-react'

export default function NetWorthScreen() {
  const { t } = useTranslation()
  const { hideBalances, baseCurrency, locale } = useSettingsStore()

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
      // Month-end date: last day of month
      const parts = m.split('-').map(Number)
      const year = parts[0] ?? 2026
      const month = parts[1] ?? 1
      const lastDay = new Date(year, month, 0).getDate()
      const dateStr = `${m}-${String(lastDay).padStart(2, '0')}`

      const txUpToDate = transactions.filter((tx) => tx.occurredOn <= dateStr)
      const nw = netWorth(accounts, txUpToDate, getBaseAmount)
      history.push({
        month: m,
        date: dateStr,
        ...nw,
      })
    }

    return history
  }, [accounts, transactions, currentMonth])

  const renderAmount = (minor: number) => {
    if (hideBalances) return '••••••'
    return formatMoney(minor, baseCurrency, locale)
  }

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-4xl mx-auto">
      <ReportHeader />

      <div>
        <h1 className="text-xl font-bold text-text">{t('reports.netWorthHistory', 'Net Worth History')}</h1>
        <p className="text-xs text-text-muted mt-0.5">
          Assets vs Liabilities month-end trajectory
        </p>
      </div>

      {/* Big Net Worth Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="sm:col-span-3 bg-gradient-to-br from-primary/10 to-surface-elevated border-primary/20 p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted block">
            Current Total Net Worth
          </span>
          <div className="text-3xl font-black text-text mt-1">{renderAmount(currentNW.netWorth)}</div>
          <div className="flex gap-6 mt-4 pt-4 border-t border-border/50 text-xs">
            <div>
              <span className="text-text-muted block">Total Assets</span>
              <span className="font-bold text-success">{renderAmount(currentNW.assets)}</span>
            </div>
            <div>
              <span className="text-text-muted block">Total Liabilities</span>
              <span className="font-bold text-danger">{renderAmount(currentNW.liabilities)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Historical Month-end Table */}
      <Card className="p-0 overflow-hidden">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Month-End Balance History</CardTitle>
        </CardHeader>
        <table className="w-full text-xs text-left">
          <thead className="bg-surface-overlay text-text-muted uppercase text-[10px]">
            <tr>
              <th className="p-3">Period</th>
              <th className="p-3">Assets</th>
              <th className="p-3">Liabilities</th>
              <th className="p-3 text-right">Net Worth</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-text">
            {monthlyHistory.map((h) => (
              <tr key={h.month} className="hover:bg-surface-overlay/50">
                <td className="p-3 font-semibold">{h.month}</td>
                <td className="p-3 text-success font-medium">{renderAmount(h.assets)}</td>
                <td className="p-3 text-danger font-medium">{renderAmount(h.liabilities)}</td>
                <td className="p-3 text-right font-bold">{renderAmount(h.netWorth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
