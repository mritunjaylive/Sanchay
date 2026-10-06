/**
 * domain/budgets.ts — Budget calculations, rollover, and threshold monitoring.
 *
 * Pure functions, no side effects, unit-testable.
 *
 * @see Sanchay_spec.md section 10.4
 */

import type { Budget, Transaction } from '@sanchay/shared'
import { daysBetween, periodForLabel, subtractOneMonth } from './dates'

/** Minimal category shape needed to resolve sub-category membership. */
export interface CategoryRef {
  id: string
  parentId?: string | null
}

/**
 * The set of category ids a budget on `categoryId` covers: the category itself plus all of its
 * descendants. Returns null for the overall budget (every category).
 */
function coveredCategoryIds(categoryId: string | null, categories?: CategoryRef[]): Set<string> | null {
  if (!categoryId) return null
  const ids = new Set<string>([categoryId])
  if (!categories || categories.length === 0) return ids
  let grew = true
  while (grew) {
    grew = false
    for (const c of categories) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id)
        grew = true
      }
    }
  }
  return ids
}

export interface BudgetStatus {
  budget: Budget
  budgetAmountMinor: number
  rolloverAmountMinor: number
  totalAllowedMinor: number
  spentMinor: number
  remainingMinor: number
  percentUsed: number
  status: 'ok' | 'warning' | 'over'
  dailyAllowanceMinor: number
}

/**
 * Finds the effective budget for a given category (or overall if categoryId is null)
 * for a specific month (YYYY-MM). Budgets have `effective_from` dates. The active
 * budget is the one with the latest `effective_from <= targetMonth`.
 */
export function getEffectiveBudget(
  budgets: Budget[],
  categoryId: string | null,
  targetMonth: string,
): Budget | null {
  const matches = budgets
    .filter((b) => !b.deletedAt && b.categoryId === categoryId && b.effectiveFrom <= targetMonth)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))

  const active = matches[0]
  if (!active || active.amountMinor === 0) return null
  return active
}

/**
 * Calculates rollover for a budget for the given month.
 * Rollover chains up to 12 months lookback:
 * carry = max(0, prev_budget + prev_carry - prev_spent)
 */
export function calculateRollover(
  budget: Budget,
  allBudgets: Budget[],
  allTransactions: Transaction[],
  targetMonth: string,
  monthStartDay = 1,
  categories?: CategoryRef[],
): number {
  if (!budget.rollover) return 0
  const covered = coveredCategoryIds(budget.categoryId, categories)

  let currentCarry = 0
  const monthsToCheck: string[] = []
  let cursorMonth = targetMonth

  // Collect up to 12 previous months in chronological order
  for (let i = 0; i < 12; i++) {
    cursorMonth = subtractOneMonth(cursorMonth)
    monthsToCheck.unshift(cursorMonth)
  }

  for (const m of monthsToCheck) {
    const eff = getEffectiveBudget(allBudgets, budget.categoryId, m)
    if (!eff) {
      currentCarry = 0
      continue
    }

    // Calculate spent in month m
    const { start, end } = periodForLabel(m, monthStartDay)
    const spent = allTransactions
      .filter((tx) => {
        if (tx.deletedAt) return false
        if (tx.type !== 'expense') return false
        if (tx.occurredOn < start || tx.occurredOn > end) return false
        if (covered && (!tx.categoryId || !covered.has(tx.categoryId))) return false
        return true
      })
      .reduce((sum, tx) => sum + (tx.baseAmountMinor ?? tx.amountMinor), 0)

    const available = eff.amountMinor + currentCarry
    currentCarry = Math.max(0, available - spent)
  }

  return currentCarry
}

/**
 * Calculates complete budget status for a budget in a given period.
 */
export function calculateBudgetStatus(
  budget: Budget,
  allBudgets: Budget[],
  allTransactions: Transaction[],
  monthDateStr: string, // e.g. "2026-10-01"
  monthStartDay = 1,
  todayStr: string,
  categories?: CategoryRef[],
): BudgetStatus {
  // The month label names the period that STARTS in that calendar month (works for any start day).
  const targetMonth = monthDateStr.substring(0, 7)
  const { start, end } = periodForLabel(targetMonth, monthStartDay)

  const rolloverMinor = calculateRollover(
    budget,
    allBudgets,
    allTransactions,
    targetMonth,
    monthStartDay,
    categories,
  )
  const totalAllowedMinor = budget.amountMinor + rolloverMinor

  // Category and subcategory matching
  const covered = coveredCategoryIds(budget.categoryId, categories)
  const spentMinor = allTransactions
    .filter((tx) => {
      if (tx.deletedAt) return false
      if (tx.type !== 'expense') return false
      if (tx.occurredOn < start || tx.occurredOn > end) return false
      if (covered && (!tx.categoryId || !covered.has(tx.categoryId))) return false
      return true
    })
    .reduce((sum, tx) => sum + (tx.baseAmountMinor ?? tx.amountMinor), 0)

  const remainingMinor = totalAllowedMinor - spentMinor
  const percentUsed = totalAllowedMinor > 0 ? (spentMinor / totalAllowedMinor) * 100 : 0

  // Use the lowest configured threshold regardless of array order.
  const thresholds = (budget.alertThresholds ?? []).filter((t) => Number.isFinite(t) && t > 0)
  const firstThreshold = thresholds.length > 0 ? Math.min(...thresholds) : 80
  let status: 'ok' | 'warning' | 'over' = 'ok'
  if (percentUsed >= 100 || (totalAllowedMinor <= 0 && spentMinor > 0)) {
    status = 'over'
  } else if (percentUsed >= firstThreshold) {
    status = 'warning'
  }

  // Calculate daily allowance if today is inside the period
  let dailyAllowanceMinor = 0
  if (todayStr >= start && todayStr <= end && remainingMinor > 0) {
    // Days remaining including today (correct even when the period spans two calendar months)
    const daysLeft = Math.max(1, daysBetween(todayStr, end) + 1)
    dailyAllowanceMinor = Math.floor(remainingMinor / daysLeft)
  }

  return {
    budget,
    budgetAmountMinor: budget.amountMinor,
    rolloverAmountMinor: rolloverMinor,
    totalAllowedMinor,
    spentMinor,
    remainingMinor,
    percentUsed: Math.round(percentUsed * 10) / 10,
    status,
    dailyAllowanceMinor,
  }
}

/**
 * Check if a newly entered expense triggers a budget threshold warning.
 * Returns threshold percent crossed (e.g. 80 or 100) or null if none.
 */
export function checkBudgetThreshold(
  spentBeforeMinor: number,
  newExpenseMinor: number,
  budgetTotalAllowedMinor: number,
  thresholds: number[] = [80, 100],
): number | null {
  if (budgetTotalAllowedMinor <= 0) return null

  const spentAfter = spentBeforeMinor + newExpenseMinor
  const percentBefore = (spentBeforeMinor / budgetTotalAllowedMinor) * 100
  const percentAfter = (spentAfter / budgetTotalAllowedMinor) * 100

  // Check highest threshold crossed
  const sorted = [...thresholds].sort((a, b) => b - a)
  for (const t of sorted) {
    if (percentBefore < t && percentAfter >= t) {
      return t
    }
  }

  return null
}
