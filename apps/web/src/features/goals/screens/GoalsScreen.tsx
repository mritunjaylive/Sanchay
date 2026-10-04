import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { goalRepo } from '../../../db/repositories/goalRepo'
import { useAuthStore } from '../../auth/stores/authStore'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { calculateGoalProgress } from '../../../domain/goals'
import { accountBalance } from '../../../domain/balance'
import { formatMoney, parseAmountToMinor } from '../../../lib/money'
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Select, Modal, Badge } from '../../../ui'
import { Plus, Target, CheckCircle2, TrendingUp, Calendar, Trash2 } from 'lucide-react'
import type { Goal } from '@sanchay/shared'

export default function GoalsScreen() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.session?.user)
  const { baseCurrency, locale } = useSettingsStore()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isContributionOpen, setIsContributionOpen] = useState(false)
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null)

  // Goal form
  const [name, setName] = useState('')
  const [targetStr, setTargetStr] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [linkedAccountId, setLinkedAccountId] = useState('')

  // Contribution form
  const [contribAmountStr, setContribAmountStr] = useState('')
  const [contribNote, setContribNote] = useState('')

  const todayStr = new Date().toISOString().substring(0, 10)

  // DB queries
  const goals = useLiveQuery(() => db.goals.filter((g) => !g.deletedAt).toArray(), [])
  const contributions = useLiveQuery(() => db.goalContributions.filter((c) => !c.deletedAt).toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !name.trim() || !targetStr.trim()) return

    const targetMinor = parseAmountToMinor(targetStr, baseCurrency)

    await goalRepo.create({
      userId: user.id,
      name: name.trim(),
      targetMinor,
      currency: baseCurrency,
      targetDate: targetDate || null,
      linkedAccountId: linkedAccountId || null,
      icon: null,
      color: null,
      completedAt: null,
    })

    setIsModalOpen(false)
    setName('')
    setTargetStr('')
    setTargetDate('')
    setLinkedAccountId('')
  }

  const handleAddContribution = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !selectedGoal || !contribAmountStr.trim()) return

    const amountMinor = parseAmountToMinor(contribAmountStr, selectedGoal.currency)

    await goalRepo.addContribution({
      goalId: selectedGoal.id,
      userId: user.id,
      amountMinor,
      occurredOn: todayStr,
      note: contribNote.trim() || null,
    })

    setIsContributionOpen(false)
    setContribAmountStr('')
    setContribNote('')
  }

  const handleDeleteGoal = async (goalId: string) => {
    if (window.confirm(t('goals.deleteConfirm', 'Delete this goal?'))) {
      await goalRepo.delete(goalId)
    }
  }

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('goals.title', 'Savings Goals')}</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {t('goals.subtitle', 'Set targets for emergency fund, vacations, gadgets, or investments')}
          </p>
        </div>

        <Button
          variant="primary"
          leftIcon={<Plus size={16} />}
          onClick={() => setIsModalOpen(true)}
        >
          {t('goals.newGoal', 'New Goal')}
        </Button>
      </div>

      {!goals || goals.length === 0 ? (
        <Card className="py-16 text-center text-text-muted">
          <Target size={32} className="mx-auto text-primary mb-2" />
          <p className="text-base font-medium">{t('goals.noGoals', 'No active savings goals.')}</p>
          <p className="text-xs mt-1">
            {t('goals.createHint', 'Create a goal with a target amount and date to calculate required monthly savings.')}
          </p>
          <Button variant="primary" size="sm" className="mt-4" onClick={() => setIsModalOpen(true)}>
            {t('goals.newGoal', 'New Goal')}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {goals.map((goal) => {
            let linkedBalance: number | undefined = undefined
            if (goal.linkedAccountId && accounts && transactions) {
              const acc = accounts.find((a) => a.id === goal.linkedAccountId)
              if (acc) linkedBalance = accountBalance(acc, transactions)
            }

            const goalContribs = contributions?.filter((c) => c.goalId === goal.id) ?? []
            const progress = calculateGoalProgress(goal, goalContribs, linkedBalance, todayStr)

            return (
              <Card key={goal.id} className="p-5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-base text-text">{goal.name}</h3>
                      {goal.targetDate && (
                        <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                          <Calendar size={12} />
                          <span>{t('goals.targetBy', 'Target:')} {goal.targetDate}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={progress.isCompleted ? 'success' : 'primary'}>
                        {progress.percentComplete}%
                      </Badge>
                      <button
                        type="button"
                        onClick={() => handleDeleteGoal(goal.id)}
                        className="text-text-muted hover:text-danger p-1 rounded-md"
                        title="Delete Goal"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-3 bg-surface-overlay rounded-full overflow-hidden mt-4">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        progress.isCompleted ? 'bg-success' : 'bg-primary'
                      }`}
                      style={{ width: `${progress.percentComplete}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-xs text-text-muted mt-2">
                    <span>
                      {t('goals.saved', 'Saved')}:{' '}
                      <strong className="text-text">{formatMoney(progress.progressMinor, goal.currency, locale)}</strong>
                    </span>
                    <span>
                      {t('goals.target', 'Target')}:{' '}
                      <strong className="text-text">{formatMoney(progress.targetMinor, goal.currency, locale)}</strong>
                    </span>
                  </div>
                </div>

                {/* Footer: Required Monthly Saving & Action */}
                <div className="pt-3 border-t border-border/50 flex items-center justify-between">
                  {progress.requiredMonthlySavingMinor && !progress.isCompleted ? (
                    <div className="text-xs">
                      <span className="text-text-muted block">{t('goals.monthlyTarget', 'Monthly plan:')}</span>
                      <span className="font-bold text-primary">
                        {formatMoney(progress.requiredMonthlySavingMinor, goal.currency, locale)} / mo
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-success font-semibold flex items-center gap-1">
                      {progress.isCompleted && (
                        <>
                          <CheckCircle2 size={14} /> {t('goals.completed', 'Goal Achieved!')}
                        </>
                      )}
                    </span>
                  )}

                  {!goal.linkedAccountId && !progress.isCompleted && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedGoal(goal)
                        setIsContributionOpen(true)
                      }}
                    >
                      {t('goals.addMoney', 'Add Savings')}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* New Goal Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t('goals.newGoalTitle', 'Set a Savings Goal')}
      >
        <form onSubmit={handleSaveGoal} className="space-y-4">
          <Input
            label={t('goals.goalName', 'Goal Name')}
            placeholder="e.g. Vacation Fund, New Laptop, Emergency"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              type="text"
              inputMode="decimal"
              label={t('goals.targetAmount', 'Target Amount')}
              placeholder="e.g. 50000"
              value={targetStr}
              onChange={(e) => setTargetStr(e.target.value)}
              required
            />
            <Input
              type="date"
              label={t('goals.targetDate', 'Target Date (Optional)')}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          <Select
            label={t('goals.linkedAccount', 'Link to an Account (Optional)')}
            value={linkedAccountId}
            onChange={(e) => setLinkedAccountId(e.target.value)}
            options={[
              { value: '', label: '-- None (Track via manual savings deposits) --' },
              ...(accounts?.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })) ?? []),
            ]}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('common.save', 'Save Goal')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Contribution Modal */}
      <Modal
        isOpen={isContributionOpen}
        onClose={() => setIsContributionOpen(false)}
        title={t('goals.addSavingsTo', `Add Money to "${selectedGoal?.name}"`)}
      >
        <form onSubmit={handleAddContribution} className="space-y-4">
          <Input
            type="text"
            inputMode="decimal"
            label={t('transactions.amount', 'Amount')}
            placeholder="0.00"
            value={contribAmountStr}
            onChange={(e) => setContribAmountStr(e.target.value)}
            required
          />

          <Input
            label={t('common.note', 'Note (Optional)')}
            placeholder="e.g. Bonus saved"
            value={contribNote}
            onChange={(e) => setContribNote(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsContributionOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('goals.confirmDeposit', 'Record Deposit')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
