/**
 * domain/goals.ts — Savings goals calculations and required monthly saving hint.
 *
 * Pure functions, no side effects.
 *
 * @see Sanchay_spec.md section 10.8
 */

import type { Goal, GoalContribution } from '@sanchay/shared'
import { todayLocal } from './dates'

export interface GoalProgress {
  goal: Goal
  progressMinor: number
  targetMinor: number
  remainingMinor: number
  percentComplete: number
  isCompleted: boolean
  requiredMonthlySavingMinor: number | null
}

/**
 * Calculates current progress for a savings goal.
 * If linkedAccountId is set, progress equals the linked account's balance.
 * Otherwise, progress is the sum of manual contributions.
 */
export function calculateGoalProgress(
  goal: Goal,
  contributions: GoalContribution[],
  linkedAccountBalanceMinor?: number,
  todayStr = todayLocal(),
): GoalProgress {
  let progressMinor = 0

  if (goal.linkedAccountId && linkedAccountBalanceMinor !== undefined) {
    progressMinor = Math.max(0, linkedAccountBalanceMinor)
  } else {
    progressMinor = contributions
      .filter((c) => !c.deletedAt && c.goalId === goal.id)
      .reduce((sum, c) => sum + c.amountMinor, 0)
  }

  const remainingMinor = Math.max(0, goal.targetMinor - progressMinor)
  const percentComplete = Math.min(
    100,
    goal.targetMinor > 0 ? Math.round((progressMinor / goal.targetMinor) * 1000) / 10 : 0,
  )
  const isCompleted = progressMinor >= goal.targetMinor || !!goal.completedAt

  let requiredMonthlySavingMinor: number | null = null
  if (goal.targetDate && remainingMinor > 0) {
    const todayParts = todayStr.split('-').map(Number)
    const targetParts = goal.targetDate.split('-').map(Number)

    const todayYear = todayParts[0] ?? 0
    const todayMonth = todayParts[1] ?? 1
    const targetYear = targetParts[0] ?? 0
    const targetMonth = targetParts[1] ?? 1

    const monthsDiff = (targetYear - todayYear) * 12 + (targetMonth - todayMonth)
    if (monthsDiff > 0) {
      requiredMonthlySavingMinor = Math.ceil(remainingMinor / monthsDiff)
    } else {
      // Goal target date is this month or in the past
      requiredMonthlySavingMinor = remainingMinor
    }
  }

  return {
    goal,
    progressMinor,
    targetMinor: goal.targetMinor,
    remainingMinor,
    percentComplete,
    isCompleted,
    requiredMonthlySavingMinor,
  }
}
