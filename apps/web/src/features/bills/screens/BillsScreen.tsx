import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { recurringRepo } from '../../../db/repositories/recurringRepo'
import { transactionRepo } from '../../../db/repositories/transactionRepo'
import { useAuthStore } from '../../auth/stores/authStore'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { occurrences } from '../../../domain/recurrence'
import { addOneMonth } from '../../../domain/dates'
import { uuidv5 } from '../../../lib/ids'
import { formatMoney, parseAmountToMinor } from '../../../lib/money'
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Select, Modal, Badge } from '../../../ui'
import { Plus, Check, SkipForward, Clock, Calendar, AlertCircle } from 'lucide-react'
import type { RecurringRule, RecurringFreq, RecurringMode, TransactionType } from '@sanchay/shared'

export default function BillsScreen() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.session?.user)
  const { baseCurrency, locale } = useSettingsStore()

  const [activeTab, setActiveTab] = useState<'upcoming' | 'rules'>('upcoming')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Form fields
  const [title, setTitle] = useState('')
  const [type, setType] = useState<TransactionType>('expense')
  const [amountStr, setAmountStr] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [freq, setFreq] = useState<RecurringFreq>('monthly')
  const [interval, setInterval] = useState('1')
  const [mode, setMode] = useState<RecurringMode>('remind_only')
  const [startDate, setStartDate] = useState(new Date().toISOString().substring(0, 10))

  const todayStr = new Date().toISOString().substring(0, 10)
  const next30DaysStr = addOneMonth(todayStr)

  // DB queries
  const rules = useLiveQuery(() => db.recurringRules.filter((r) => !r.deletedAt).toArray(), [])
  const overrides = useLiveQuery(() => db.recurringOverrides.filter((o) => !o.deletedAt).toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).sortBy('sortOrder'), [])
  const categories = useLiveQuery(() => db.categories.filter((c) => !c.deletedAt).sortBy('sortOrder'), [])
  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])

  const accountMap = useMemo(() => {
    const map = new Map<string, string>()
    accounts?.forEach((a) => map.set(a.id, a.name))
    return map
  }, [accounts])

  const accountCurrencyMap = useMemo(() => {
    const map = new Map<string, string>()
    accounts?.forEach((a) => map.set(a.id, a.currency))
    return map
  }, [accounts])

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>()
    categories?.forEach((c) => map.set(c.id, c.name))
    return map
  }, [categories])

  // Compute upcoming occurrences for the next 30 days
  const upcomingOccurrences = useMemo(() => {
    if (!rules || !overrides || !transactions) return []

    const items: Array<{
      rule: RecurringRule
      occurrenceDate: string
      isOverdue: boolean
      amountMinor: number
    }> = []

    for (const rule of rules) {
      const ruleOverrides = overrides.filter((o) => o.ruleId === rule.id)
      const dates = occurrences(rule, rule.startDate, next30DaysStr, ruleOverrides)

      for (const d of dates) {
        // Check if override skipped
        const override = ruleOverrides.find((o) => o.occurrenceDate === d)
        if (override?.action === 'skip') continue

        // Check if already paid/materialized in transactions
        const isPaid = transactions.some(
          (tx) => tx.recurringRuleId === rule.id && tx.recurringOccurrenceDate === d,
        )
        if (isPaid) continue

        const amountMinor =
          override?.action === 'amount_changed' && override.newAmountMinor
            ? override.newAmountMinor
            : rule.amountMinor

        items.push({
          rule,
          occurrenceDate: d,
          isOverdue: d < todayStr,
          amountMinor,
        })
      }
    }

    return items.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))
  }, [rules, overrides, transactions, todayStr, next30DaysStr])

  // Mark occurrence as paid: creates transaction with deterministic UUIDv5 id
  const handleMarkPaid = async (rule: RecurringRule, occurrenceDate: string, amountMinor: number) => {
    if (!user) return

    const deterministicId = await uuidv5(rule.id, occurrenceDate)

    await transactionRepo.create({
      id: deterministicId,
      userId: user.id,
      type: rule.type,
      accountId: rule.accountId,
      toAccountId: rule.toAccountId ?? null,
      amountMinor,
      toAmountMinor: rule.type === 'transfer' ? amountMinor : null,
      baseAmountMinor: amountMinor,
      fxRate: '1',
      occurredOn: occurrenceDate,
      occurredTime: null,
      categoryId: rule.categoryId,
      payee: rule.payee || rule.title,
      note: rule.note || `Paid bill: ${rule.title}`,
      paymentMethod: null,
      adjustmentSign: null,
      recurringRuleId: rule.id,
      recurringOccurrenceDate: occurrenceDate,
      source: 'recurring',
    })
  }

  // Skip occurrence once
  const handleSkip = async (rule: RecurringRule, occurrenceDate: string) => {
    if (!user) return
    await recurringRepo.createOverride({
      userId: user.id,
      ruleId: rule.id,
      occurrenceDate,
      action: 'skip',
      newDate: null,
      newAmountMinor: null,
    })
  }

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !title.trim() || !amountStr.trim() || !accountId) return

    const amountMinor = parseAmountToMinor(amountStr, baseCurrency)
    const intervalNum = parseInt(interval, 10) || 1

    await recurringRepo.createRule({
      userId: user.id,
      title: title.trim(),
      type: type as 'income' | 'expense' | 'transfer',
      accountId,
      toAccountId: null,
      amountMinor,
      categoryId: categoryId || null,
      payee: title.trim(),
      note: null,
      freq,
      interval: intervalNum,
      byWeekday: null,
      byMonthDay: null,
      startDate,
      endDate: null,
      maxCount: null,
      mode,
      remindDaysBefore: 3,
      pausedAt: null,
    })

    setIsModalOpen(false)
    setTitle('')
    setAmountStr('')
  }

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('bills.title', 'Bills & Recurring')}</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {t('bills.subtitle', 'Manage subscriptions, EMI payments, and upcoming bill reminders')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex bg-surface-elevated border border-border rounded-lg p-1">
            <button
              type="button"
              onClick={() => setActiveTab('upcoming')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeTab === 'upcoming' ? 'bg-primary text-white shadow-xs' : 'text-text-muted hover:text-text'
              }`}
            >
              {t('bills.upcomingTab', 'Upcoming (30 Days)')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeTab === 'rules' ? 'bg-primary text-white shadow-xs' : 'text-text-muted hover:text-text'
              }`}
            >
              {t('bills.rulesTab', 'Recurring Rules')}
            </button>
          </div>

          <Button
            variant="primary"
            leftIcon={<Plus size={16} />}
            onClick={() => {
              if (accounts?.length && !accountId) setAccountId(accounts[0]!.id)
              setIsModalOpen(true)
            }}
          >
            {t('bills.newRule', 'New Rule')}
          </Button>
        </div>
      </div>

      {activeTab === 'upcoming' ? (
        upcomingOccurrences.length === 0 ? (
          <Card className="py-16 text-center text-text-muted">
            <Check size={32} className="mx-auto text-success mb-2" />
            <p className="text-base font-medium">{t('bills.noUpcoming', 'All caught up!')}</p>
            <p className="text-xs mt-1">{t('bills.noBillsNext30', 'No bills due in the next 30 days.')}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcomingOccurrences.map((item, idx) => (
              <Card
                key={`${item.rule.id}-${item.occurrenceDate}-${idx}`}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  item.isOverdue ? 'border-danger/30 bg-danger/5' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      item.isOverdue ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary'
                    }`}
                  >
                    <Calendar size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-text text-sm">{item.rule.title}</h4>
                      {item.isOverdue ? (
                        <Badge variant="danger" size="sm">
                          {t('bills.overdue', 'Overdue')}
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          {item.rule.freq}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {t('bills.dueOn', 'Due on')} {item.occurrenceDate} • {accountMap.get(item.rule.accountId)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <span className="font-extrabold text-base text-text">
                    {formatMoney(item.amountMinor, accountCurrencyMap.get(item.rule.accountId) ?? 'INR', locale)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSkip(item.rule, item.occurrenceDate)}
                    >
                      {t('bills.skip', 'Skip')}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<Check size={14} />}
                      onClick={() => handleMarkPaid(item.rule, item.occurrenceDate, item.amountMinor)}
                    >
                      {t('bills.markPaid', 'Mark Paid')}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        // Rules list
        !rules || rules.length === 0 ? (
          <Card className="py-16 text-center text-text-muted">
            <p className="text-base font-medium">{t('bills.noRules', 'No recurring rules set up yet.')}</p>
            <p className="text-xs mt-1">
              {t('bills.rulesHint', 'Add recurring salary, rent, subscriptions, or SIPs.')}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <Card key={rule.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-text text-sm">{rule.title}</h4>
                    <Badge variant="neutral" size="sm">
                      {rule.freq}
                    </Badge>
                    <Badge variant="primary" size="sm">
                      {rule.mode}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    {accountMap.get(rule.accountId)} • Started {rule.startDate}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold text-sm text-text">
                    {formatMoney(rule.amountMinor, accountCurrencyMap.get(rule.accountId) ?? 'INR', locale)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (window.confirm('Delete this recurring rule?')) {
                        void recurringRepo.deleteRule(rule.id)
                      }
                    }}
                  >
                    {t('common.delete', 'Delete')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {/* New Recurring Rule Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t('bills.newRecurringRule', 'New Recurring Rule')}
      >
        <form onSubmit={handleSaveRule} className="space-y-4">
          <Input
            label={t('bills.ruleTitle', 'Title / Description')}
            placeholder="e.g. Netflix, Apartment Rent, Salary"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('common.type', 'Type')}
              value={type}
              onChange={(e) => setType(e.target.value as TransactionType)}
              options={[
                { value: 'expense', label: 'Expense (Bill)' },
                { value: 'income', label: 'Income (Salary/SIP)' },
              ]}
            />
            <Input
              type="text"
              inputMode="decimal"
              label={t('transactions.amount', 'Amount')}
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('accounts.account', 'Account')}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              options={accounts?.map((a) => ({ value: a.id, label: a.name })) ?? []}
            />
            <Select
              label={t('categories.category', 'Category')}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              options={[
                { value: '', label: '-- None --' },
                ...(categories
                  ?.filter((c) => c.kind === type)
                  .map((c) => ({ value: c.id, label: c.name })) ?? []),
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('bills.frequency', 'Frequency')}
              value={freq}
              onChange={(e) => setFreq(e.target.value as RecurringFreq)}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'yearly', label: 'Yearly' },
                { value: 'daily', label: 'Daily' },
              ]}
            />
            <Select
              label={t('bills.mode', 'Handling Mode')}
              value={mode}
              onChange={(e) => setMode(e.target.value as RecurringMode)}
              options={[
                { value: 'remind_only', label: 'Remind Only (Mark paid manually)' },
                { value: 'auto_post', label: 'Auto-Post (Create automatically)' },
              ]}
            />
          </div>

          <Input
            type="date"
            label={t('bills.startDate', 'Start Date')}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('common.save', 'Save Rule')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
