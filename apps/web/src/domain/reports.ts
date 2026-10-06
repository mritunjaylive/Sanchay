/**
 * domain/reports.ts — Financial reporting aggregations, category breakdowns, and trends.
 *
 * All aggregations run in memory over local arrays; single pass, sub-100ms for 50k transactions.
 * Exclude `transfer` and `adjustment` from income/expense totals.
 * Use `base_amount_minor` (or fallback to amount_minor) for all report sums.
 *
 * @see Sanchay_spec.md section 10.9
 */

import type { Transaction, Category } from '@sanchay/shared'

export interface PeriodSummary {
  incomeMinor: number
  expenseMinor: number
  netSavingsMinor: number
  savingsRatePercent: number
  transactionCount: number
}

export interface CategoryBreakdownItem {
  categoryId: string
  name: string
  icon: string | null
  color: string | null
  amountMinor: number
  percentage: number
  transactionCount: number
  subcategories?: CategoryBreakdownItem[]
}

export interface DaySummary {
  date: string // YYYY-MM-DD
  incomeMinor: number
  expenseMinor: number
  netMinor: number
  count: number
}

export interface MonthlyTrendItem {
  month: string // YYYY-MM
  incomeMinor: number
  expenseMinor: number
  netMinor: number
}

export interface PayeeSummaryItem {
  payee: string
  amountMinor: number
  count: number
}

/**
 * Calculates high-level income, expense, net savings, and savings rate for a date range.
 */
export function calculatePeriodSummary(
  transactions: Transaction[],
  startDate: string,
  endDate: string,
): PeriodSummary {
  let incomeMinor = 0
  let expenseMinor = 0
  let transactionCount = 0

  for (const tx of transactions) {
    if (tx.deletedAt) continue
    if (tx.occurredOn < startDate || tx.occurredOn > endDate) continue

    const baseAmount = tx.baseAmountMinor ?? tx.amountMinor
    if (tx.type === 'income') {
      incomeMinor += baseAmount
      transactionCount++
    } else if (tx.type === 'expense') {
      expenseMinor += baseAmount
      transactionCount++
    } else if (tx.type === 'transfer' || tx.type === 'adjustment') {
      transactionCount++
    }
  }

  const netSavingsMinor = incomeMinor - expenseMinor
  const savingsRatePercent =
    incomeMinor > 0 ? Math.round(((incomeMinor - expenseMinor) / incomeMinor) * 1000) / 10 : 0

  return {
    incomeMinor,
    expenseMinor,
    netSavingsMinor,
    savingsRatePercent,
    transactionCount,
  }
}

/**
 * Generates category spending breakdown (donut chart / ranked list).
 * Parent categories aggregate their subcategories.
 */
export function calculateCategoryBreakdown(
  transactions: Transaction[],
  categories: Category[],
  startDate: string,
  endDate: string,
  kind: 'expense' | 'income' = 'expense',
): CategoryBreakdownItem[] {
  const categoryMap = new Map<string, Category>()
  for (const c of categories) {
    categoryMap.set(c.id, c)
  }

  // Map categoryId -> amountMinor & count
  const directSums = new Map<string, { amount: number; count: number }>()

  let totalAmountMinor = 0
  for (const tx of transactions) {
    if (tx.deletedAt) continue
    if (tx.type !== kind) continue
    if (tx.occurredOn < startDate || tx.occurredOn > endDate) continue
    if (!tx.categoryId) continue

    const amount = tx.baseAmountMinor ?? tx.amountMinor
    totalAmountMinor += amount

    const existing = directSums.get(tx.categoryId) ?? { amount: 0, count: 0 }
    directSums.set(tx.categoryId, {
      amount: existing.amount + amount,
      count: existing.count + 1,
    })
  }

  // Aggregate subcategories into parents
  const parentMap = new Map<
    string,
    {
      item: CategoryBreakdownItem
      subMap: Map<string, CategoryBreakdownItem>
    }
  >()

  // Initialize top-level categories
  for (const c of categories) {
    if (c.kind !== kind || c.parentId) continue
    parentMap.set(c.id, {
      item: {
        categoryId: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        amountMinor: 0,
        percentage: 0,
        transactionCount: 0,
      },
      subMap: new Map(),
    })
  }

  // Populate data
  for (const [catId, stats] of directSums.entries()) {
    const cat = categoryMap.get(catId)
    if (!cat) continue

    if (cat.parentId && parentMap.has(cat.parentId)) {
      // Subcategory
      const parentEntry = parentMap.get(cat.parentId)!
      parentEntry.item.amountMinor += stats.amount
      parentEntry.item.transactionCount += stats.count
      parentEntry.subMap.set(catId, {
        categoryId: cat.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        amountMinor: stats.amount,
        percentage: 0,
        transactionCount: stats.count,
      })
    } else if (parentMap.has(catId)) {
      // Direct parent spending
      const parentEntry = parentMap.get(catId)!
      parentEntry.item.amountMinor += stats.amount
      parentEntry.item.transactionCount += stats.count
    } else {
      // Standalone top category not in list
      parentMap.set(catId, {
        item: {
          categoryId: cat.id,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          amountMinor: stats.amount,
          percentage: 0,
          transactionCount: stats.count,
        },
        subMap: new Map(),
      })
    }
  }

  const result: CategoryBreakdownItem[] = []
  for (const { item, subMap } of parentMap.values()) {
    if (item.amountMinor === 0) continue

    item.percentage =
      totalAmountMinor > 0 ? Math.round((item.amountMinor / totalAmountMinor) * 1000) / 10 : 0

    if (subMap.size > 0) {
      item.subcategories = Array.from(subMap.values())
        .map((sub) => ({
          ...sub,
          percentage:
            totalAmountMinor > 0 ? Math.round((sub.amountMinor / totalAmountMinor) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.amountMinor - a.amountMinor)
    }

    result.push(item)
  }

  return result.sort((a, b) => b.amountMinor - a.amountMinor)
}

/**
 * Calculates daily income and expense totals for the calendar view.
 */
export function calculateDailyTotals(
  transactions: Transaction[],
  startDate: string,
  endDate: string,
): Map<string, DaySummary> {
  const map = new Map<string, DaySummary>()

  for (const tx of transactions) {
    if (tx.deletedAt) continue
    if (tx.occurredOn < startDate || tx.occurredOn > endDate) continue
    if (tx.type !== 'income' && tx.type !== 'expense') continue

    let entry = map.get(tx.occurredOn)
    if (!entry) {
      entry = {
        date: tx.occurredOn,
        incomeMinor: 0,
        expenseMinor: 0,
        netMinor: 0,
        count: 0,
      }
      map.set(tx.occurredOn, entry)
    }

    const amount = tx.baseAmountMinor ?? tx.amountMinor
    if (tx.type === 'income') entry.incomeMinor += amount
    else entry.expenseMinor += amount
    entry.netMinor = entry.incomeMinor - entry.expenseMinor
    entry.count += 1
  }

  return map
}

/**
 * Aggregates monthly income vs expense for trend charts.
 */
export function calculateMonthlyTrends(
  transactions: Transaction[],
  months: string[], // array of YYYY-MM in order
): MonthlyTrendItem[] {
  const monthMap = new Map<string, { incomeMinor: number; expenseMinor: number }>()
  for (const m of months) {
    monthMap.set(m, { incomeMinor: 0, expenseMinor: 0 })
  }

  for (const tx of transactions) {
    if (tx.deletedAt) continue
    if (tx.type !== 'income' && tx.type !== 'expense') continue

    const monthKey = tx.occurredOn.substring(0, 7)
    const entry = monthMap.get(monthKey)
    if (!entry) continue

    const amount = tx.baseAmountMinor ?? tx.amountMinor
    if (tx.type === 'income') entry.incomeMinor += amount
    else entry.expenseMinor += amount
  }

  return months.map((m) => {
    const val = monthMap.get(m)!
    return {
      month: m,
      incomeMinor: val.incomeMinor,
      expenseMinor: val.expenseMinor,
      netMinor: val.incomeMinor - val.expenseMinor,
    }
  })
}

/**
 * Finds top payees ranked by total expense amount.
 */
export function calculateTopPayees(
  transactions: Transaction[],
  startDate: string,
  endDate: string,
  limit = 10,
): PayeeSummaryItem[] {
  // Group case-insensitively ("Swiggy" and "swiggy" are the same payee), keep first-seen casing.
  const map = new Map<string, { payee: string; amountMinor: number; count: number }>()

  for (const tx of transactions) {
    if (tx.deletedAt) continue
    if (tx.type !== 'expense') continue
    if (!tx.payee) continue
    if (tx.occurredOn < startDate || tx.occurredOn > endDate) continue

    const payeeName = tx.payee.trim()
    if (!payeeName) continue

    const key = payeeName.toLowerCase()
    const amount = tx.baseAmountMinor ?? tx.amountMinor
    const existing = map.get(key) ?? { payee: payeeName, amountMinor: 0, count: 0 }
    map.set(key, {
      payee: existing.payee,
      amountMinor: existing.amountMinor + amount,
      count: existing.count + 1,
    })
  }

  return Array.from(map.values())
    .map((stats) => ({
      payee: stats.payee,
      amountMinor: stats.amountMinor,
      count: stats.count,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor)
    .slice(0, limit)
}
