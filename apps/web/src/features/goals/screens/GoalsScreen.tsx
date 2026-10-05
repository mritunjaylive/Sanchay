import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { goalRepo } from '../../../db/repositories/goalRepo'
import { useAuthStore } from '../../auth/stores/authStore'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { calculateGoalProgress } from '../../../domain/goals'
import { accountBalance } from '../../../domain/balance'
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
  ProgressRing,
  EmptyState,
  SkeletonCard,
} from '../../../ui'
import {
  Plus,
  Target,
  CheckCircle2,
  Calendar,
  Trash2,
  Sparkles,
  Coins,
  ArrowRight,
} from 'lucide-react'
import type { Goal, Account } from '@sanchay/shared'
import { cn } from '../../../lib/cn'

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

  const todayStr = useMemo(() => new Date().toISOString().substring(0, 10), [])

  // DB queries
  const goals = useLiveQuery(() => db.goals.filter((g) => !g.deletedAt).toArray(), [])
  const contributions = useLiveQuery(() => db.goalContributions.filter((c) => !c.deletedAt).toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])

  const isLoading = goals === undefined || contributions === undefined || accounts === undefined

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>()
    accounts?.forEach((a) => map.set(a.id, a))
    return map
  }, [accounts])

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

  if (isLoading) {
    return (
      <Page width="default" className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-36 bg-surface-elevated animate-pulse rounded-lg" />
          <div className="h-9 w-28 bg-surface-elevated animate-pulse rounded-xl" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SkeletonCard className="h-56" />
          <SkeletonCard className="h-56" />
        </div>
      </Page>
    )
  }

  return (
    <Page width="default" className="space-y-6 pb-20">
      {/* Header */}
      <PageHeader
        title={t('goals.title', 'Savings Goals')}
        subtitle={t('goals.subtitle', 'Set targets for emergency fund, vacations, gadgets, or investments')}
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={16} />}
            onClick={() => setIsModalOpen(true)}
          >
            {t('goals.createGoal', 'New Goal')}
          </Button>
        }
      />

      {/* Goals Grid */}
      {goals.length === 0 ? (
        <EmptyState
          icon={<Target size={28} />}
          title={t('goals.noGoals', 'No active savings goals')}
          description="Start saving with purpose. Create a goal to track your progress and see required monthly contributions."
          actionLabel={t('goals.createGoal', 'New Goal')}
          onAction={() => setIsModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {goals.map((goal) => {
            const linkedAccount = goal.linkedAccountId ? accountMap.get(goal.linkedAccountId) : undefined
            const linkedBal =
              linkedAccount && transactions
                ? accountBalance(linkedAccount, transactions)
                : undefined
            const progress = calculateGoalProgress(
              goal,
              contributions ?? [],
              linkedBal,
              todayStr,
            )

            const isDone = progress.isCompleted

            return (
              <Card
                key={goal.id}
                className={cn(
                  'p-6 rounded-3xl flex flex-col justify-between space-y-4 border transition-all duration-200 relative overflow-hidden',
                  isDone
                    ? 'border-gold/50 bg-gradient-to-br from-gold/10 via-surface-elevated to-surface-elevated shadow-md'
                    : 'border-border/60 hover:border-primary/40',
                )}
              >
                {/* Top: Name, Badges & Delete */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-base text-text truncate">{goal.name}</h3>
                      {isDone && (
                        <Badge variant="gold" size="sm" className="shrink-0 flex items-center gap-1 font-bold">
                          <CheckCircle2 size={12} />
                          <span>Completed!</span>
                        </Badge>
                      )}
                    </div>

                    {goal.targetDate && (
                      <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
                        <Calendar size={13} />
                        <span>Target: {goal.targetDate}</span>
                      </p>
                    )}

                    {linkedAccount && (
                      <p className="text-[11px] text-primary font-semibold mt-0.5">
                        Linked: {linkedAccount.name}
                      </p>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteGoal(goal.id)}
                    title={t('common.delete', 'Delete')}
                    className="shrink-0"
                  >
                    <Trash2 size={15} className="text-text-muted hover:text-danger" />
                  </Button>
                </div>

                {/* Middle: ProgressRing & Amounts */}
                <div className="flex items-center justify-between gap-4 py-2">
                  <div className="space-y-1.5">
                    <span className="text-xs text-text-muted font-medium block">Current Saved</span>
                    <Amount
                      minor={progress.progressMinor}
                      currency={goal.currency}
                      tone="income"
                      showSign={false}
                      className="text-2xl font-extrabold block text-text"
                    />
                    <div className="text-xs text-text-muted">
                      Target:{' '}
                      <Amount
                        minor={progress.targetMinor}
                        currency={goal.currency}
                        showSign={false}
                        className="font-bold inline text-xs text-text"
                      />
                    </div>
                  </div>

                  <div className="shrink-0">
                    <ProgressRing
                      value={progress.percentComplete}
                      size={72}
                      strokeWidth={6}
                      tone="gold"
                    >
                      <span className="text-xs font-black text-text">
                        {Math.round(progress.percentComplete)}%
                      </span>
                    </ProgressRing>
                  </div>
                </div>

                {/* Bottom: Monthly Hint & Add Contribution Action */}
                <div className="pt-3 border-t border-border/40 flex items-center justify-between gap-2 text-xs">
                  <div>
                    {!isDone && progress.requiredMonthlySavingMinor ? (
                      <span className="text-text-muted text-[11px]">
                        Need{' '}
                        <Amount
                          minor={progress.requiredMonthlySavingMinor}
                          currency={goal.currency}
                          showSign={false}
                          className="font-bold inline text-[11px] text-text"
                        />
                        /mo
                      </span>
                    ) : (
                      <span className="text-text-muted text-[11px]">
                        {isDone ? 'Goal reached!' : `${formatMoney(progress.remainingMinor, goal.currency, locale)} left`}
                      </span>
                    )}
                  </div>

                  {!goal.linkedAccountId && !isDone && (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Coins size={14} />}
                      onClick={() => {
                        setSelectedGoal(goal)
                        setIsContributionOpen(true)
                      }}
                      className="text-xs font-semibold h-8"
                    >
                      + Add Funds
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create Goal Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t('goals.createGoal', 'New Savings Goal')}
      >
        <form onSubmit={handleSaveGoal} className="space-y-4 py-1">
          <Input
            label={t('common.name', 'Goal Name')}
            placeholder="e.g. Emergency Fund, Japan Trip, MacBook"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            type="text"
            inputMode="decimal"
            label={t('goals.targetAmount', 'Target Amount')}
            placeholder="0.00"
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

          <Select
            label="Link to Account (Optional)"
            value={linkedAccountId}
            onChange={(e) => setLinkedAccountId(e.target.value)}
            options={[
              { value: '', label: '-- None (Track manually) --' },
              ...(accounts?.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })) ?? []),
            ]}
          />

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
              {t('common.save', 'Save Goal')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Contribution Modal */}
      <Modal
        isOpen={isContributionOpen}
        onClose={() => setIsContributionOpen(false)}
        title={selectedGoal ? `Add Funds to ${selectedGoal.name}` : 'Add Funds'}
      >
        <form onSubmit={handleAddContribution} className="space-y-4 py-1">
          <Input
            type="text"
            inputMode="decimal"
            label="Contribution Amount"
            placeholder="0.00"
            value={contribAmountStr}
            onChange={(e) => setContribAmountStr(e.target.value)}
            required
          />

          <Input
            label={t('common.note', 'Note (Optional)')}
            placeholder="e.g. October monthly savings deposit"
            value={contribNote}
            onChange={(e) => setContribNote(e.target.value)}
          />

          <div className="flex items-center gap-3 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setIsContributionOpen(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary" className="flex-1">
              Deposit
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
  )
}
