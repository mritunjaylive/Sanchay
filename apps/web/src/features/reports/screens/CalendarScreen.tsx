import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { calculateDailyTotals } from '../../../domain/reports'
import { addOneMonth, subtractOneMonth } from '../../../domain/dates'
import { occurrences } from '../../../domain/recurrence'
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
} from '../../../ui'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ArrowUpRight, ArrowDownLeft, Plus } from 'lucide-react'

export default function CalendarScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { baseCurrency, locale } = useSettingsStore()

  const todayStr = new Date().toISOString().substring(0, 10)
  const [currentMonth, setCurrentMonth] = useState(todayStr.substring(0, 7)) // YYYY-MM
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)

  // Calculate days in the current month
  const { days, startPad, monthStartStr, monthEndStr } = useMemo(() => {
    const parts = currentMonth.split('-').map(Number)
    const year = parts[0] ?? 2026
    const month = parts[1] ?? 1

    const firstDayOfWeek = new Date(year, month - 1, 1).getDay() // 0 = Sunday
    const totalDays = new Date(year, month, 0).getDate()

    const dayList = []
    for (let d = 1; d <= totalDays; d++) {
      dayList.push(`${currentMonth}-${String(d).padStart(2, '0')}`)
    }

    return {
      days: dayList,
      startPad: firstDayOfWeek,
      monthStartStr: `${currentMonth}-01`,
      monthEndStr: `${currentMonth}-${String(totalDays).padStart(2, '0')}`,
    }
  }, [currentMonth])

  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).toArray(), [])
  const recurringRules = useLiveQuery(() => db.recurringRules.filter((r) => !r.deletedAt).toArray(), [])

  const accountCurrencyMap = useMemo(() => {
    const map = new Map<string, string>()
    accounts?.forEach((a) => map.set(a.id, a.currency))
    return map
  }, [accounts])

  const dailyTotals = useMemo(() => {
    if (!transactions) return new Map<string, { incomeMinor: number; expenseMinor: number; count: number }>()
    return calculateDailyTotals(transactions, monthStartStr, monthEndStr)
  }, [transactions, monthStartStr, monthEndStr])

  // Map dates to due bills in this month
  const billDatesSet = useMemo(() => {
    const set = new Set<string>()
    if (!recurringRules) return set
    for (const rule of recurringRules) {
      const occs = occurrences(rule, monthStartStr, monthEndStr)
      occs.forEach((d: string) => set.add(d))
    }
    return set
  }, [recurringRules, monthStartStr, monthEndStr])

  const selectedDayTransactions = useMemo(() => {
    if (!selectedDate || !transactions) return []
    return transactions.filter((tx) => tx.occurredOn === selectedDate)
  }, [selectedDate, transactions])

  const selectedDayTotals = useMemo(() => {
    const stats = dailyTotals.get(selectedDate)
    return {
      incomeMinor: stats?.incomeMinor ?? 0,
      expenseMinor: stats?.expenseMinor ?? 0,
      count: stats?.count ?? 0,
    }
  }, [dailyTotals, selectedDate])

  const handleDayKeyDown = (e: React.KeyboardEvent, index: number) => {
    let targetIndex = -1
    if (e.key === 'ArrowRight') targetIndex = index + 1
    else if (e.key === 'ArrowLeft') targetIndex = index - 1
    else if (e.key === 'ArrowDown') targetIndex = index + 7
    else if (e.key === 'ArrowUp') targetIndex = index - 7

    if (targetIndex >= 0 && targetIndex < days.length) {
      e.preventDefault()
      const targetBtn = document.getElementById(`calendar-day-${targetIndex}`)
      targetBtn?.focus()
      setSelectedDate(days[targetIndex]!)
    }
  }

  if (transactions === undefined) {
    return (
      <Page width="wide" className="space-y-6">
        <SkeletonCard className="h-20" />
        <SkeletonCard className="h-96" />
      </Page>
    )
  }

  return (
    <Page width="wide" className="space-y-6">
      <PageHeader
        title={t('calendar.title', 'Financial Calendar')}
        subtitle="Daily cash flow distribution, transactions, and scheduled bills"
        action={
          <div className="flex items-center gap-1 bg-surface-elevated border border-border/60 rounded-xl p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setCurrentMonth(subtractOneMonth(currentMonth))}
              className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-overlay focus:outline-none focus:ring-1 focus:ring-primary min-w-[32px] min-h-[32px] flex items-center justify-center transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 text-xs font-bold text-text min-w-[70px] text-center">
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
        }
      />

      {/* Two-column layout: Calendar Grid Left (8 cols), Selected-Day Panel Right (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Calendar Grid */}
        <Card className="lg:col-span-8 p-3 sm:p-5 rounded-3xl space-y-3">
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-text-muted uppercase pb-2 border-b border-border/50">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 pt-1" role="grid" aria-label="Calendar grid">
            {/* Empty padding cells for start of month */}
            {Array.from({ length: startPad }).map((_, idx) => (
              <div key={`pad-${idx}`} className="min-h-[64px] sm:min-h-[82px] bg-transparent" />
            ))}

            {days.map((dateStr, idx) => {
              const dayNum = parseInt(dateStr.split('-')[2]!, 10)
              const stats = dailyTotals.get(dateStr)
              const hasBill = billDatesSet.has(dateStr)
              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDate

              return (
                <button
                  id={`calendar-day-${idx}`}
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDate(dateStr)}
                  onKeyDown={(e) => handleDayKeyDown(e, idx)}
                  aria-label={`${dateStr}${stats ? `, ${stats.count} transactions` : ', 0 transactions'}`}
                  aria-pressed={isSelected}
                  className={`min-h-[64px] sm:min-h-[82px] p-1.5 rounded-2xl border transition-all text-left flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-primary ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/40 bg-primary/5 shadow-xs'
                      : isToday
                      ? 'border-primary/60 bg-surface-elevated hover:bg-surface-overlay'
                      : 'border-border/40 hover:bg-surface-overlay/50'
                  }`}
                >
                  <div className="flex justify-between items-center text-xs w-full">
                    <span
                      className={`font-bold rounded-lg w-5 h-5 flex items-center justify-center text-[11px] ${
                        isToday
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : isSelected
                          ? 'bg-surface-overlay text-text font-black'
                          : 'text-text'
                      }`}
                    >
                      {dayNum}
                    </span>

                    {/* Indicator dots: income (green), expense (slate/teal), bills (gold) */}
                    <div className="flex items-center gap-1">
                      {stats && stats.incomeMinor > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-success" title="Income recorded" />
                      )}
                      {stats && stats.expenseMinor > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-text-muted" title="Expense recorded" />
                      )}
                      {hasBill && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Scheduled Bill" />
                      )}
                    </div>
                  </div>

                  {stats && (stats.incomeMinor > 0 || stats.expenseMinor > 0) ? (
                    <div className="text-[10px] font-bold space-y-0.5 w-full hidden sm:block">
                      {stats.incomeMinor > 0 && (
                        <div className="text-success truncate">
                          +{formatMoney(stats.incomeMinor, baseCurrency, locale)}
                        </div>
                      )}
                      {stats.expenseMinor > 0 && (
                        <div className="text-text-muted truncate">
                          -{formatMoney(stats.expenseMinor, baseCurrency, locale)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-2" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Dot Legend */}
          <div className="flex items-center justify-center gap-4 text-xs text-text-muted pt-3 border-t border-border/40">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success" />
              Income
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-text-muted" />
              Expense
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Bill Due
            </span>
          </div>
        </Card>

        {/* Selected-Day Panel (Right on Desktop, Below on Mobile) */}
        <Card className="lg:col-span-4 p-5 rounded-3xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/40">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted block">
                Selected Day
              </span>
              <h3 className="text-base font-black text-text">{selectedDate}</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => navigate(`/transactions/new?date=${selectedDate}`)}
              className="h-8 text-xs px-2.5"
            >
              Add
            </Button>
          </div>

          {/* Day Totals Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-surface-elevated border border-border/40">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                Income
              </span>
              <Amount
                minor={selectedDayTotals.incomeMinor}
                currency={baseCurrency}
                tone="income"
                showSign={false}
                size="sm"
                className="font-black mt-0.5 block"
              />
            </div>
            <div className="p-3 rounded-2xl bg-surface-elevated border border-border/40">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                Expense
              </span>
              <Amount
                minor={selectedDayTotals.expenseMinor}
                currency={baseCurrency}
                tone="neutral"
                showSign={false}
                size="sm"
                className="font-black mt-0.5 block"
              />
            </div>
          </div>

          {/* Transactions list on this day */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-text-muted block">
              Transactions ({selectedDayTransactions.length})
            </span>

            {selectedDayTransactions.length === 0 ? (
              <EmptyState
                icon={<CalendarIcon size={24} />}
                title="No transactions"
                description={`No income or expense recorded on ${selectedDate}.`}
              />
            ) : (
              <div className="divide-y divide-border/40 -mx-2 px-2 max-h-[380px] overflow-y-auto no-scrollbar">
                {selectedDayTransactions.map((tx) => (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => navigate(`/transactions/${tx.id}`)}
                    className="w-full text-left py-2.5 flex items-center justify-between hover:bg-surface-overlay/50 px-2 rounded-xl transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          tx.type === 'income'
                            ? 'bg-success/10 text-success'
                            : 'bg-surface-overlay text-text-muted'
                        }`}
                      >
                        {tx.type === 'income' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-text truncate">
                          {tx.payee || tx.type.toUpperCase()}
                        </p>
                        <p className="text-[11px] text-text-muted truncate">
                          {tx.note || 'No note'}
                        </p>
                      </div>
                    </div>

                    <Amount
                      minor={tx.amountMinor}
                      currency={accountCurrencyMap.get(tx.accountId) ?? baseCurrency}
                      tone={tx.type === 'income' ? 'income' : 'neutral'}
                      showSign={tx.type === 'income'}
                      size="sm"
                      className="font-bold shrink-0"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </Page>
  )
}
