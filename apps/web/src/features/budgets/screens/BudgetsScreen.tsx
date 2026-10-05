import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { budgetRepo } from '../../../db/repositories/budgetRepo'
import { useAuthStore } from '../../auth/stores/authStore'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { calculateBudgetStatus, getEffectiveBudget } from '../../../domain/budgets'
import { addOneMonth, subtractOneMonth, periodFor } from '../../../domain/dates'
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
  ProgressBar,
  ProgressRing,
  CategoryIcon,
  EmptyState,
  SkeletonCard,
} from '../../../ui'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  PiggyBank,
  PieChart,
} from 'lucide-react'
import type { Budget, Category } from '@sanchay/shared'
import { cn } from '../../../lib/cn'

export default function BudgetsScreen() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.session?.user)
  const { baseCurrency, locale } = useSettingsStore()
  const monthStartDay = useAuthStore((s) => s.profile?.monthStartDay) ?? 1

  const todayStr = useMemo(() => new Date().toISOString().substring(0, 10), [])
  const [currentMonth, setCurrentMonth] = useState(() => todayStr.substring(0, 7)) // YYYY-MM
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)

  // Form fields
  const [selectedCategory, setSelectedCategory] = useState<string>('overall')
  const [amountStr, setAmountStr] = useState('')
  const [rollover, setRollover] = useState(false)
  const [thresholdPercent, setThresholdPercent] = useState('80')

  // Reactive DB queries
  const allBudgets = useLiveQuery(() => db.budgets.filter((b) => !b.deletedAt).toArray(), [])
  const categories = useLiveQuery(() => db.categories.filter((c) => !c.deletedAt).toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])

  const isLoading = allBudgets === undefined || categories === undefined || transactions === undefined

  const uniqueExpenseCategories = useMemo(() => {
    if (!categories) return []
    const seen = new Set<string>()
    const list: Category[] = []
    for (const c of categories) {
      if (user?.id && c.userId && c.userId !== user.id) continue
      if (c.kind !== 'expense') continue
      const norm = c.name.trim().toLowerCase()
      if (!seen.has(norm)) {
        seen.add(norm)
        list.push(c)
      }
    }
    return list
  }, [categories, user?.id])

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    categories?.forEach((c) => map.set(c.id, c))
    return map
  }, [categories])

  // Get effective budgets for the selected month
  const activeBudgetStatuses = useMemo(() => {
    if (!allBudgets || !transactions) return []

    // 1. Overall budget (categoryId === null)
    const overallEffective = getEffectiveBudget(allBudgets, null, currentMonth)
    const list: Budget[] = []
    if (overallEffective) list.push(overallEffective)

    // 2. Category budgets
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

  // Aggregate stats across all budgets
  const aggregate = useMemo(() => {
    if (activeBudgetStatuses.length === 0) return null

    let totalBudgetMinor = 0
    let totalSpentMinor = 0

    // If there is an overall budget, use it as total budget
    const overallItem = activeBudgetStatuses.find((item) => item.budget.categoryId === null)
    if (overallItem) {
      totalBudgetMinor = overallItem.budget.amountMinor + overallItem.rolloverAmountMinor
      totalSpentMinor = overallItem.spentMinor
    } else {
      for (const item of activeBudgetStatuses) {
        totalBudgetMinor += item.budget.amountMinor + item.rolloverAmountMinor
        totalSpentMinor += item.spentMinor
      }
    }

    const remainingMinor = Math.max(0, totalBudgetMinor - totalSpentMinor)
    const percentUsed = totalBudgetMinor > 0 ? Math.round((totalSpentMinor / totalBudgetMinor) * 100) : 0

    // Days left in current period
    const { end: monthEnd } = periodFor(`${currentMonth}-01`, monthStartDay)
    const today = new Date(todayStr)
    const end = new Date(monthEnd)
    const diffTime = end.getTime() - today.getTime()
    const daysLeft = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1)
    const dailyMinor = Math.round(remainingMinor / daysLeft)

    return {
      totalBudgetMinor,
      totalSpentMinor,
      remainingMinor,
      percentUsed,
      daysLeft,
      dailyMinor,
    }
  }, [activeBudgetStatuses, currentMonth, monthStartDay, todayStr])

  const openCreateModal = () => {
    setEditingBudget(null)
    setSelectedCategory('overall')
    setAmountStr('')
    setRollover(false)
    setThresholdPercent('80')
    setIsModalOpen(true)
  }

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget)
    setSelectedCategory(budget.categoryId ?? 'overall')
    setAmountStr((budget.amountMinor / 100).toString())
    setRollover(budget.rollover)
    setThresholdPercent((budget.alertThresholds?.[0] ?? 80).toString())
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !amountStr.trim()) return

    const amountMinor = parseAmountToMinor(amountStr, baseCurrency)
    const catId = selectedCategory === 'overall' ? null : selectedCategory
    const notifyThreshold = parseInt(thresholdPercent, 10) || 80

    if (editingBudget) {
      await budgetRepo.update(editingBudget.id, {
        amountMinor,
        rollover,
        alertThresholds: [notifyThreshold, 100],
      })
    } else {
      await budgetRepo.create({
        userId: user.id,
        categoryId: catId,
        amountMinor,
        effectiveFrom: currentMonth,
        rollover,
        alertThresholds: [notifyThreshold, 100],
      })
    }

    setIsModalOpen(false)
  }

  const handleDelete = async (budgetId: string) => {
    if (window.confirm(t('budgets.deleteConfirm', 'End this budget?'))) {
      await budgetRepo.delete(budgetId)
    }
  }

  if (isLoading) {
    return (
      <Page width="default" className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 bg-surface-elevated animate-pulse rounded-lg" />
          <div className="h-9 w-28 bg-surface-elevated animate-pulse rounded-xl" />
        </div>
        <SkeletonCard className="h-44" />
        <SkeletonCard className="h-32" />
        <SkeletonCard className="h-32" />
      </Page>
    )
  }

  return (
    <Page width="default" className="space-y-6 pb-20">
      {/* Header & Month Switcher */}
      <PageHeader
        title={t('budgets.title', 'Budgets')}
        subtitle={t('budgets.subtitle', 'Track category spending limits and monitor rollovers')}
        actions={
          <div className="flex items-center gap-2">
            {/* Month Navigation */}
            <div className="flex items-center gap-1 bg-surface-elevated border border-border/80 rounded-xl p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setCurrentMonth(subtractOneMonth(currentMonth))}
                className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-overlay transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 text-xs font-bold text-text min-w-[70px] text-center">
                {currentMonth}
              </span>
              <button
                type="button"
                onClick={() => setCurrentMonth(addOneMonth(currentMonth))}
                className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-overlay transition-colors"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus size={16} />}
              onClick={openCreateModal}
            >
              {t('budgets.setBudget', 'Set Budget')}
            </Button>
          </div>
        }
      />

      {/* Top Overall Budget Ring Hero Card */}
      {aggregate && (
        <Card variant="hero" className="p-6 sm:p-7 rounded-3xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted block">
                {t('budgets.overallBudget', 'Total Budget Overview')}
              </span>
              <div className="flex items-baseline gap-2">
                <Amount
                  minor={aggregate.remainingMinor}
                  currency={baseCurrency}
                  showSign={false}
                  size="display"
                  className="font-extrabold text-text"
                />
                <span className="text-sm font-semibold text-text-muted">
                  {t('budget.remaining', 'remaining')}
                </span>
              </div>

              <p className="text-xs text-text-muted">
                <Amount
                  minor={aggregate.dailyMinor}
                  currency={baseCurrency}
                  showSign={false}
                  className="font-semibold inline text-xs text-text"
                />{' '}
                / day for {aggregate.daysLeft} days left in cycle
              </p>

              <div className="flex items-center gap-4 text-xs pt-1">
                <span>
                  Budget:{' '}
                  <Amount
                    minor={aggregate.totalBudgetMinor}
                    currency={baseCurrency}
                    showSign={false}
                    className="font-bold inline text-xs text-text"
                  />
                </span>
                <span>•</span>
                <span>
                  Spent:{' '}
                  <Amount
                    minor={aggregate.totalSpentMinor}
                    currency={baseCurrency}
                    tone="danger"
                    showSign={false}
                    className="font-bold inline text-xs"
                  />
                </span>
              </div>
            </div>

            <div className="shrink-0 flex items-center justify-center">
              <ProgressRing
                value={aggregate.percentUsed}
                size={84}
                strokeWidth={7}
                tone={
                  aggregate.percentUsed > 100
                    ? 'danger'
                    : aggregate.percentUsed > 80
                    ? 'warning'
                    : 'primary'
                }
              >
                <div className="text-center">
                  <span className="text-sm font-extrabold text-text block">
                    {aggregate.percentUsed}%
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-text-muted block">
                    used
                  </span>
                </div>
              </ProgressRing>
            </div>
          </div>
        </Card>
      )}

      {/* Budgets List */}
      {activeBudgetStatuses.length === 0 ? (
        <EmptyState
          icon={<PieChart size={28} />}
          title={t('budgets.noBudgets', 'No budgets set for this month')}
          description={t(
            'budgets.createHint',
            'Create category spending caps to control expenses and save more.',
          )}
          actionLabel={t('budgets.setBudget', 'Set Budget')}
          onAction={openCreateModal}
        />
      ) : (
        <div className="space-y-4">
          {activeBudgetStatuses.map((item) => {
            const isOverall = item.budget.categoryId === null
            const category = item.budget.categoryId ? categoryMap.get(item.budget.categoryId) : undefined
            const title = isOverall
              ? t('budgets.overallBudget', 'Overall Budget')
              : category?.name ?? 'Category'

            const isOver = item.status === 'over'
            const isWarning = item.status === 'warning'
            const tone = isOver ? 'danger' : isWarning ? 'warning' : 'primary'

            const remainingMinor = Math.max(0, item.budget.amountMinor + item.rolloverAmountMinor - item.spentMinor)

            return (
              <Card key={item.budget.id} className="p-5 space-y-4 rounded-2xl border-border/60">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">
                      {isOverall ? (
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                          <PieChart size={20} />
                        </div>
                      ) : (
                        <CategoryIcon
                          icon={category?.icon}
                          color={category?.color}
                          size="md"
                        />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-text">{title}</h3>
                        {item.budget.rollover && (
                          <Badge variant="neutral" size="sm" title="Rollover enabled">
                            <RotateCcw size={10} className="mr-1" />
                            <span>{t('budgets.rollover', 'Rollover')}</span>
                          </Badge>
                        )}
                        <Badge variant={isOver ? 'danger' : isWarning ? 'warning' : 'success'} size="sm">
                          {item.percentUsed}%
                        </Badge>
                      </div>

                      {item.rolloverAmountMinor > 0 && (
                        <p className="text-xs text-text-muted mt-0.5">
                          +{formatMoney(item.rolloverAmountMinor, baseCurrency, locale)}{' '}
                          {t('budgets.carriedOver', 'carried from last month')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(item.budget)}
                      className="text-xs text-primary font-semibold"
                    >
                      {t('common.edit', 'Edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(item.budget.id)}
                      className="text-xs text-danger font-semibold"
                    >
                      {t('common.delete', 'Delete')}
                    </Button>
                  </div>
                </div>

                {/* Progress Bar */}
                <ProgressBar
                  value={item.percentUsed}
                  max={100}
                  tone={tone}
                />

                {/* Spent / Limit & Remaining Info */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
                  <span className="text-text-muted">
                    {isOver ? (
                      <span className="text-danger font-semibold">
                        Over budget by{' '}
                        <Amount
                          minor={item.spentMinor - (item.budget.amountMinor + item.rolloverAmountMinor)}
                          currency={baseCurrency}
                          tone="danger"
                          showSign={false}
                          className="font-bold inline text-xs"
                        />
                      </span>
                    ) : (
                      <span>
                        <Amount
                          minor={remainingMinor}
                          currency={baseCurrency}
                          showSign={false}
                          className="font-bold inline text-xs text-text"
                        />{' '}
                        left
                      </span>
                    )}
                  </span>

                  <div className="flex items-center gap-1.5 font-medium text-text-muted">
                    <Amount
                      minor={item.spentMinor}
                      currency={baseCurrency}
                      showSign={false}
                      className="font-semibold inline text-xs text-text"
                    />
                    <span>/</span>
                    <Amount
                      minor={item.budget.amountMinor + item.rolloverAmountMinor}
                      currency={baseCurrency}
                      showSign={false}
                      className="font-semibold inline text-xs text-text-muted"
                    />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add / Edit Budget Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBudget ? t('budgets.editBudget', 'Edit Budget') : t('budgets.setBudget', 'Set Budget')}
      >
        <form onSubmit={handleSave} className="space-y-4 py-1">
          <Select
            label={t('transaction.category', 'Category')}
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            disabled={Boolean(editingBudget)}
            options={[
              { value: 'overall', label: t('budgets.overallBudget', 'Overall (All Categories)') },
              ...uniqueExpenseCategories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />

          <Input
            type="text"
            inputMode="decimal"
            label={t('transaction.amount', 'Monthly Budget Amount')}
            placeholder="e.g. 15000"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Alert Threshold"
              value={thresholdPercent}
              onChange={(e) => setThresholdPercent(e.target.value)}
              options={[
                { value: '50', label: '50%' },
                { value: '70', label: '70%' },
                { value: '80', label: '80%' },
                { value: '90', label: '90%' },
                { value: '100', label: '100%' },
              ]}
            />

            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-text">
                <input
                  type="checkbox"
                  checked={rollover}
                  onChange={(e) => setRollover(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span>Rollover unused</span>
              </label>
            </div>
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
              {t('common.save', 'Save')}
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
  )
}
