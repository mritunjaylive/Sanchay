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
import { formatDayLabel } from '../../../lib/formatDayLabel'
import { formatMoney, parseAmountToMinor } from '../../../lib/money'
import {
  Page,
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Modal,
  Badge,
  Amount,
  CategoryIcon,
  SegmentedControl,
  EmptyState,
  SkeletonCard,
  SkeletonRow,
} from '../../../ui'
import {
  Plus,
  Check,
  SkipForward,
  Receipt,
  Calendar,
  Clock,
  AlertCircle,
  Repeat,
  Trash2,
} from 'lucide-react'
import type { RecurringRule, RecurringFreq, RecurringMode, TransactionType, Category, Account } from '@sanchay/shared'
import { cn } from '../../../lib/cn'

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

  const todayStr = useMemo(() => new Date().toISOString().substring(0, 10), [])
  const next30DaysStr = useMemo(() => addOneMonth(todayStr), [todayStr])

  // DB queries
  const rules = useLiveQuery(() => db.recurringRules.filter((r) => !r.deletedAt).toArray(), [])
  const overrides = useLiveQuery(() => db.recurringOverrides.filter((o) => !o.deletedAt).toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).sortBy('sortOrder'), [])
  const categories = useLiveQuery(() => db.categories.filter((c) => !c.deletedAt).sortBy('sortOrder'), [])
  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])

  const isLoading = rules === undefined || accounts === undefined || categories === undefined

  const uniqueRelevantCategories = useMemo(() => {
    if (!categories) return []
    const seen = new Set<string>()
    const list: Category[] = []
    for (const c of categories) {
      if (user?.id && c.userId && c.userId !== user.id) continue
      if (c.kind !== type) continue
      const norm = c.name.trim().toLowerCase()
      if (!seen.has(norm)) {
        seen.add(norm)
        list.push(c)
      }
    }
    return list
  }, [categories, type, user?.id])

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>()
    accounts?.forEach((a) => map.set(a.id, a))
    return map
  }, [accounts])

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    categories?.forEach((c) => map.set(c.id, c))
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
        const override = ruleOverrides.find((o) => o.occurrenceDate === d)
        if (override?.action === 'skip') continue

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

  const overdueBills = useMemo(
    () => upcomingOccurrences.filter((item) => item.isOverdue),
    [upcomingOccurrences],
  )
  const dueSoonBills = useMemo(
    () => upcomingOccurrences.filter((item) => !item.isOverdue),
    [upcomingOccurrences],
  )

  // Mark occurrence as paid
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

  const handleDeleteRule = async (ruleId: string) => {
    if (window.confirm('Delete this recurring rule?')) {
      await recurringRepo.deleteRule(ruleId)
    }
  }

  if (isLoading) {
    return (
      <Page width="default" className="space-y-6">
        <SkeletonCard className="h-16" />
        <SkeletonRow />
        <SkeletonRow />
      </Page>
    )
  }

  return (
    <Page width="default" className="space-y-6 pb-20">
      {/* Header */}
      <PageHeader
        title={t('nav.bills', 'Bills & Recurring')}
        subtitle="Manage upcoming recurring payments, subscriptions, and reminders"
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={16} />}
            onClick={() => {
              if (accounts && accounts.length > 0 && !accountId) {
                setAccountId(accounts[0]!.id)
              }
              setIsModalOpen(true)
            }}
          >
            Add Recurring Rule
          </Button>
        }
      />

      {/* Tabs */}
      <div className="max-w-xs">
        <SegmentedControl
          options={[
            { value: 'upcoming', label: `Upcoming (${upcomingOccurrences.length})` },
            { value: 'rules', label: `Rules (${rules?.length ?? 0})` },
          ]}
          value={activeTab}
          onChange={(val) => setActiveTab(val as 'upcoming' | 'rules')}
        />
      </div>

      {activeTab === 'upcoming' ? (
        upcomingOccurrences.length === 0 ? (
          <EmptyState
            icon={<Receipt size={28} />}
            title="No upcoming bills"
            description="You don't have any bills or recurring payments due in the next 30 days."
            actionLabel="Add Recurring Rule"
            onAction={() => setIsModalOpen(true)}
          />
        ) : (
          <div className="space-y-6">
            {/* Overdue Section */}
            {overdueBills.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-danger px-1">
                  <AlertCircle size={16} />
                  <span>Overdue ({overdueBills.length})</span>
                </div>

                <div className="space-y-2.5">
                  {overdueBills.map(({ rule, occurrenceDate, amountMinor }) => {
                    const category = rule.categoryId ? categoryMap.get(rule.categoryId) : undefined
                    const account = accountMap.get(rule.accountId)

                    return (
                      <Card
                        key={`${rule.id}-${occurrenceDate}`}
                        className="p-4 rounded-2xl border-danger/30 bg-danger/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <CategoryIcon
                            icon={category?.icon}
                            color={category?.color}
                            size="md"
                          />
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-text truncate">{rule.title}</h4>
                            <p className="text-xs text-danger font-semibold mt-0.5">
                              Due {formatDayLabel(occurrenceDate, todayStr)} • Overdue
                            </p>
                            <span className="text-[11px] text-text-muted">
                              {account?.name}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-none border-border/40">
                          <Amount
                            minor={amountMinor}
                            currency={account?.currency ?? baseCurrency}
                            tone="danger"
                            showSign={false}
                            className="text-base font-extrabold"
                          />

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSkip(rule, occurrenceDate)}
                              title="Skip this occurrence"
                            >
                              <SkipForward size={14} />
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              leftIcon={<Check size={15} />}
                              onClick={() => handleMarkPaid(rule, occurrenceDate, amountMinor)}
                            >
                              Mark Paid
                            </Button>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Upcoming Due Section */}
            {dueSoonBills.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-text-muted px-1">
                  Upcoming in next 30 days ({dueSoonBills.length})
                </div>

                <div className="space-y-2.5">
                  {dueSoonBills.map(({ rule, occurrenceDate, amountMinor }) => {
                    const category = rule.categoryId ? categoryMap.get(rule.categoryId) : undefined
                    const account = accountMap.get(rule.accountId)

                    return (
                      <Card
                        key={`${rule.id}-${occurrenceDate}`}
                        className="p-4 rounded-2xl border-border/60 hover:border-primary/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <CategoryIcon
                            icon={category?.icon}
                            color={category?.color}
                            size="md"
                          />
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-text truncate">{rule.title}</h4>
                            <p className="text-xs text-text-muted mt-0.5">
                              Due {formatDayLabel(occurrenceDate, todayStr)} • {account?.name}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-none border-border/40">
                          <Amount
                            minor={amountMinor}
                            currency={account?.currency ?? baseCurrency}
                            tone="neutral"
                            showSign={false}
                            className="text-base font-bold text-text"
                          />

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSkip(rule, occurrenceDate)}
                              title="Skip this occurrence"
                            >
                              <SkipForward size={14} />
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              leftIcon={<Check size={15} />}
                              onClick={() => handleMarkPaid(rule, occurrenceDate, amountMinor)}
                            >
                              Mark Paid
                            </Button>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* Rules List */
        rules?.length === 0 ? (
          <EmptyState
            icon={<Repeat size={28} />}
            title="No recurring rules"
            description="Create recurring rules for rent, subscriptions, or salaries to automate tracking."
            actionLabel="Add Recurring Rule"
            onAction={() => setIsModalOpen(true)}
          />
        ) : (
          <div className="space-y-3">
            {rules?.map((rule) => {
              const category = rule.categoryId ? categoryMap.get(rule.categoryId) : undefined
              const account = accountMap.get(rule.accountId)

              return (
                <Card
                  key={rule.id}
                  className="p-4 rounded-2xl flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CategoryIcon
                      icon={category?.icon}
                      color={category?.color}
                      size="md"
                    />
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-text truncate">{rule.title}</h4>
                      <p className="text-xs text-text-muted mt-0.5">
                        {rule.freq.toUpperCase()} • {account?.name} • Mode: {rule.mode}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <Amount
                      minor={rule.amountMinor}
                      currency={account?.currency ?? baseCurrency}
                      tone="neutral"
                      showSign={false}
                      className="text-sm font-bold text-text"
                    />

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRule(rule.id)}
                      title="Delete rule"
                    >
                      <Trash2 size={16} className="text-danger" />
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )
      )}

      {/* Add Recurring Rule Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="New Recurring Rule"
      >
        <form onSubmit={handleSaveRule} className="space-y-4 py-1">
          <Input
            label="Title / Description"
            placeholder="e.g. Netflix, Rent, WiFi"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('transaction.type', 'Type')}
              value={type}
              onChange={(e) => setType(e.target.value as TransactionType)}
              options={[
                { value: 'expense', label: 'Expense' },
                { value: 'income', label: 'Income' },
                { value: 'transfer', label: 'Transfer' },
              ]}
            />

            <Input
              type="text"
              inputMode="decimal"
              label={t('transaction.amount', 'Amount')}
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('transaction.account', 'Account')}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              options={accounts?.map((a) => ({ value: a.id, label: a.name })) ?? []}
            />

            <Select
              label={t('transaction.category', 'Category')}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              options={[
                { value: '', label: '-- None --' },
                ...uniqueRelevantCategories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Frequency"
              value={freq}
              onChange={(e) => setFreq(e.target.value as RecurringFreq)}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' },
              ]}
            />

            <Input
              type="date"
              label="Start Date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setIsModalOpen(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary" className="flex-1">
              {t('common.save', 'Save Rule')}
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
  )
}
