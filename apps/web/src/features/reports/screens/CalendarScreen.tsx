import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { calculateDailyTotals } from '../../../domain/reports'
import { addOneMonth, subtractOneMonth } from '../../../domain/dates'
import { formatMoney } from '../../../lib/money'
import { Card, Modal } from '../../../ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function CalendarScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { baseCurrency, locale } = useSettingsStore()

  const todayStr = new Date().toISOString().substring(0, 10)
  const [currentMonth, setCurrentMonth] = useState(todayStr.substring(0, 7)) // YYYY-MM
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

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
  const accountCurrencyMap = useMemo(() => {
    const map = new Map<string, string>()
    accounts?.forEach((a) => map.set(a.id, a.currency))
    return map
  }, [accounts])

  const dailyTotals = useMemo(() => {
    if (!transactions) return new Map()
    return calculateDailyTotals(transactions, monthStartStr, monthEndStr)
  }, [transactions, monthStartStr, monthEndStr])

  const selectedDayTransactions = useMemo(() => {
    if (!selectedDate || !transactions) return []
    return transactions.filter((tx) => tx.occurredOn === selectedDate)
  }, [selectedDate, transactions])

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
    }
  }

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-4xl mx-auto">
      {/* Header with Month Switcher */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('calendar.title', 'Financial Calendar')}</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Daily income and expense totals overview
          </p>
        </div>

        <div className="flex items-center gap-1 bg-surface-elevated border border-border rounded-lg p-1">
          <button
            type="button"
            onClick={() => setCurrentMonth(subtractOneMonth(currentMonth))}
            className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-overlay focus:outline-none focus:ring-1 focus:ring-primary min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="px-3 text-xs font-bold text-text min-w-[70px] text-center">
            {currentMonth}
          </span>
          <button
            type="button"
            onClick={() => setCurrentMonth(addOneMonth(currentMonth))}
            className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-overlay focus:outline-none focus:ring-1 focus:ring-primary min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card className="p-3">
        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-text-muted uppercase pb-2 border-b border-border">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1 pt-2" role="grid" aria-label="Calendar grid">
          {/* Empty padding cells for start of month */}
          {Array.from({ length: startPad }).map((_, idx) => (
            <div key={`pad-${idx}`} className="min-h-[70px] sm:min-h-[85px] bg-transparent" />
          ))}

          {days.map((dateStr, idx) => {
            const dayNum = parseInt(dateStr.split('-')[2]!, 10)
            const stats = dailyTotals.get(dateStr)
            const isToday = dateStr === todayStr

            return (
              <button
                id={`calendar-day-${idx}`}
                key={dateStr}
                type="button"
                onClick={() => setSelectedDate(dateStr)}
                onKeyDown={(e) => handleDayKeyDown(e, idx)}
                aria-label={`${dateStr}${stats ? `, ${stats.count} transactions` : ', 0 transactions'}`}
                className={`min-h-[70px] sm:min-h-[85px] p-1.5 rounded-xl border transition-all text-left flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-primary ${
                  isToday
                    ? 'border-primary ring-1 ring-primary bg-primary/5'
                    : 'border-border/50 hover:bg-surface-overlay/50'
                }`}
              >
                <div className="flex justify-between items-center text-xs w-full">
                  <span
                    className={`font-semibold rounded-full w-5 h-5 flex items-center justify-center ${
                      isToday ? 'bg-primary text-white' : 'text-text'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {stats && stats.count > 0 && (
                    <span className="text-[10px] text-text-muted">{stats.count}</span>
                  )}
                </div>

                {stats && (stats.incomeMinor > 0 || stats.expenseMinor > 0) ? (
                  <div className="text-[10px] font-bold space-y-0.5 w-full">
                    {stats.incomeMinor > 0 && (
                      <div className="text-success truncate">
                        +{formatMoney(stats.incomeMinor, baseCurrency, locale)}
                      </div>
                    )}
                    {stats.expenseMinor > 0 && (
                      <div className="text-danger truncate">
                        -{formatMoney(stats.expenseMinor, baseCurrency, locale)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div />
                )}
              </button>
            )
          })}
        </div>
      </Card>

      {/* Day Details Modal */}
      <Modal
        isOpen={Boolean(selectedDate)}
        onClose={() => setSelectedDate(null)}
        title={`Transactions on ${selectedDate}`}
      >
        {selectedDayTransactions.length === 0 ? (
          <div className="py-8 text-center text-text-muted text-sm">
            No transactions recorded on this day.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {selectedDayTransactions.map((tx) => (
              <button
                key={tx.id}
                type="button"
                onClick={() => {
                  setSelectedDate(null)
                  navigate(`/transactions/${tx.id}`)
                }}
                className="w-full text-left py-3 flex items-center justify-between hover:bg-surface-overlay px-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <div>
                  <p className="text-sm font-semibold text-text">{tx.payee || tx.type.toUpperCase()}</p>
                  <p className="text-xs text-text-muted">{tx.note || 'No notes'}</p>
                </div>
                <span
                  className={`text-sm font-bold ${
                    tx.type === 'income' ? 'text-success' : 'text-text'
                  }`}
                >
                  {tx.type === 'income' ? '+' : '-'}
                  {formatMoney(tx.amountMinor, accountCurrencyMap.get(tx.accountId) ?? baseCurrency, locale)}
                </span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
