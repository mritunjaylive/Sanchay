import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { budgetRepo } from '../../../db/repositories/budgetRepo'
import { useAuthStore } from '../../auth/stores/authStore'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { calculateBudgetStatus, getEffectiveBudget } from '../../../domain/budgets'
import { addOneMonth, subtractOneMonth } from '../../../domain/dates'
import { formatMoney, parseAmountToMinor } from '../../../lib/money'
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Select, Modal, Badge } from '../../../ui'
import { Plus, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react'
import type { Budget } from '@sanchay/shared'

export default function BudgetsScreen() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.session?.user)
  const { baseCurrency, locale } = useSettingsStore()
  const monthStartDay = useAuthStore((s) => s.profile?.monthStartDay) ?? 1

  const todayStr = new Date().toISOString().substring(0, 10)
  const [currentMonth, setCurrentMonth] = useState(todayStr.substring(0, 7)) // YYYY-MM
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

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>()
    categories?.forEach((c) => map.set(c.id, c.name))
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

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-4xl mx-auto">
      {/* Header & Month Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('budgets.title', 'Budgets')}</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {t('budgets.subtitle', 'Track category spending limits and monitor rollovers')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Month Navigation */}
          <div className="flex items-center gap-1 bg-surface-elevated border border-border rounded-lg p-1">
            <button
              type="button"
              onClick={() => setCurrentMonth(subtractOneMonth(currentMonth))}
              className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-overlay"
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
              className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-overlay"
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <Button variant="primary" leftIcon={<Plus size={16} />} onClick={openCreateModal}>
            {t('budgets.setBudget', 'Set Budget')}
          </Button>
        </div>
      </div>

      {/* Budgets List */}
      {activeBudgetStatuses.length === 0 ? (
        <Card className="py-16 text-center text-text-muted">
          <p className="text-base font-medium">{t('budgets.noBudgets', 'No budgets set for this month.')}</p>
          <p className="text-xs mt-1">
            {t('budgets.createHint', 'Create category spending caps to control expenses.')}
          </p>
          <Button variant="primary" size="sm" className="mt-4" onClick={openCreateModal}>
            {t('budgets.setBudget', 'Set Budget')}
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {activeBudgetStatuses.map((item) => {
            const isOverall = item.budget.categoryId === null
            const title = isOverall ? t('budgets.overallBudget', 'Overall Budget') : categoryMap.get(item.budget.categoryId!) ?? 'Category'
            const isOver = item.status === 'over'
            const isWarning = item.status === 'warning'

            return (
              <Card key={item.budget.id} className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-text">{title}</h3>
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
                        +{formatMoney(item.rolloverAmountMinor, baseCurrency, locale)} {t('budgets.carriedOver', 'carried from last month')}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(item.budget)}
                      className="text-xs text-primary hover:underline font-semibold px-2 py-1"
                    >
                      {t('common.edit', 'Edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.budget.id)}
                      className="text-xs text-danger hover:underline font-semibold px-2 py-1"
                    >
                      {t('common.delete', 'Delete')}
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-3 bg-surface-overlay rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isOver ? 'bg-danger' : isWarning ? 'bg-warning' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(100, item.percentUsed)}%` }}
                  />
                </div>

                {/* Stats Row */}
                <div className="flex justify-between items-center text-xs text-text-muted pt-1">
                  <span>
                    {t('budgets.spent', 'Spent')}:{' '}
                    <strong className="text-text">{formatMoney(item.spentMinor, baseCurrency, locale)}</strong>
                  </span>
                  <span>
                    {t('budgets.limit', 'Limit')}:{' '}
                    <strong className="text-text">{formatMoney(item.totalAllowedMinor, baseCurrency, locale)}</strong>
                  </span>
                  <span>
                    {t('budgets.remaining', 'Remaining')}:{' '}
                    <strong className={item.remainingMinor < 0 ? 'text-danger' : 'text-success'}>
                      {formatMoney(item.remainingMinor, baseCurrency, locale)}
                    </strong>
                  </span>
                </div>

                {/* Daily allowance if positive remaining and inside current month */}
                {item.dailyAllowanceMinor > 0 && currentMonth === todayStr.substring(0, 7) && (
                  <div className="pt-2 border-t border-border/50 text-[11px] text-text-muted flex items-center justify-between">
                    <span>{t('budgets.dailyAllowance', 'Daily allowance to stay on track:')}</span>
                    <span className="font-semibold text-text">
                      {formatMoney(item.dailyAllowanceMinor, baseCurrency, locale)} / day
                    </span>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Set / Edit Budget Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBudget ? t('budgets.editBudget', 'Edit Budget') : t('budgets.newBudget', 'Set New Budget')}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {!editingBudget && (
            <Select
              label={t('budgets.budgetFor', 'Budget Target')}
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              options={[
                { value: 'overall', label: `★ ${t('budgets.overallBudget', 'Overall Budget (All Categories)')}` },
                ...(categories
                  ?.filter((c) => c.kind === 'expense')
                  .map((c) => ({ value: c.id, label: c.name })) ?? []),
              ]}
            />
          )}

          <Input
            type="text"
            inputMode="decimal"
            label={t('budgets.monthlyLimit', 'Monthly Amount Limit')}
            placeholder="e.g. 15000"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              min="50"
              max="99"
              label={t('budgets.alertThreshold', 'Warning Alert Threshold (%)')}
              value={thresholdPercent}
              onChange={(e) => setThresholdPercent(e.target.value)}
            />
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="rolloverToggle"
                checked={rollover}
                onChange={(e) => setRollover(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="rolloverToggle" className="text-sm font-medium text-text cursor-pointer select-none">
                {t('budgets.rolloverUnused', 'Rollover unused money')}
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('common.save', 'Save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
