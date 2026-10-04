/**
 * domain/recurrence.ts — Recurring rule occurrence generation.
 *
 * Pure function: occurrences(rule, from, to) → string[] of YYYY-MM-DD dates.
 * No side effects, no Date.now() — uses injected clock where needed.
 *
 * @see Sanchay_spec.md section 10.5
 */
import type { RecurringRule, RecurringOverride } from '@sanchay/shared'
import { addMonths, addYears, addOneDay, daysInMonth, nextWeekday } from './dates'

/**
 * Generate all occurrence dates for a recurring rule between `from` and `to` (inclusive).
 * Applies month-end clamping, weekday rules, and respects overrides.
 *
 * @param rule The recurring rule
 * @param from Start date YYYY-MM-DD (inclusive)
 * @param to End date YYYY-MM-DD (inclusive)
 * @param overrides Optional overrides for skip/move
 * @returns Array of YYYY-MM-DD occurrence dates (not including skipped ones)
 */
export function occurrences(
  rule: RecurringRule,
  from: string,
  to: string,
  overrides: RecurringOverride[] = [],
): string[] {
  const results: string[] = []

  // Build a lookup of override actions keyed by originalDate
  const overrideMap = new Map<string, RecurringOverride>()
  for (const o of overrides) {
    overrideMap.set(o.occurrenceDate, o)
  }

  // Effective start = max(rule.startDate, from)
  const effectiveStart = rule.startDate > from ? rule.startDate : from
  const effectiveEnd = rule.endDate && rule.endDate < to ? rule.endDate : to

  let count = 0
  let current = rule.startDate

  // Advance to first occurrence >= effectiveStart
  while (current < effectiveStart) {
    current = nextOccurrence(rule, current)
    count++
    if (rule.maxCount !== null && rule.maxCount !== undefined && count >= rule.maxCount) return results
    if (current > effectiveEnd) return results
  }

  // Generate occurrences
  while (current <= effectiveEnd) {
    if (rule.maxCount !== null && rule.maxCount !== undefined && count >= rule.maxCount) break

    const override = overrideMap.get(current)
    if (override) {
      if (override.action === 'skip') {
        // Skip this occurrence
      } else if (override.action === 'moved' && override.newDate) {
        if (override.newDate >= from && override.newDate <= to) {
          results.push(override.newDate)
        }
      } else {
        // amount_changed or other: still occurs on same date
        results.push(current)
      }
    } else {
      results.push(current)
    }

    count++
    const next = nextOccurrence(rule, current)
    if (next === current) break // safety: infinite loop guard
    current = next
  }

  return results
}

/** Compute the next occurrence date after `currentDate` for the given rule. */
function nextOccurrence(rule: RecurringRule, currentDate: string): string {
  switch (rule.freq) {
    case 'daily':
      return nthDayAfter(currentDate, rule.interval)

    case 'weekly': {
      if (rule.byWeekday && rule.byWeekday.length > 0) {
        // Find the next weekday in the list after currentDate
        const sortedWeekdays = [...rule.byWeekday].sort((a, b) => a - b)
        const [y, m, d] = currentDate.split('-').map(Number) as [number, number, number]
        const currDate = new Date(y, m - 1, d)
        const currDay = currDate.getDay()

        // Try each weekday in sorted order, wrapping around
        for (const wd of sortedWeekdays) {
          if (wd > currDay) {
            const diff = wd - currDay
            return nthDayAfter(currentDate, diff)
          }
        }
        // Wrap to next week: advance to Monday + remaining days
        const firstWd = sortedWeekdays[0] ?? 0
        const daysUntilFirstWd = (7 - currDay + firstWd) + (rule.interval - 1) * 7
        return nthDayAfter(currentDate, daysUntilFirstWd)
      } else {
        // Same weekday as start_date, every N weeks
        return nthDayAfter(currentDate, rule.interval * 7)
      }
    }

    case 'monthly': {
      const nextDate = addMonths(currentDate, rule.interval)
      if (rule.byMonthDay !== null && rule.byMonthDay !== undefined) {
        const [y, m] = nextDate.split('-').map(Number) as [number, number]
        const targetDay = rule.byMonthDay === -1
          ? daysInMonth(y, m) // last day of month
          : Math.min(rule.byMonthDay, daysInMonth(y, m)) // clamp to month length
        return `${y}-${String(m).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`
      }
      return nextDate
    }

    case 'yearly':
      return addYears(currentDate, rule.interval)

    default: {
      const _never: never = rule.freq
      throw new Error(`Unknown freq: ${String(_never)}`)
    }
  }
}

function nthDayAfter(dateStr: string, n: number): string {
  let result = dateStr
  for (let i = 0; i < n; i++) {
    result = addOneDay(result)
  }
  return result
}

/**
 * Calculate the total number of occurrences generated so far for a rule.
 * Used to check against maxCount.
 */
export function countOccurrencesUpTo(
  rule: RecurringRule,
  upToDate: string,
  overrides: RecurringOverride[] = [],
): number {
  return occurrences(rule, rule.startDate, upToDate, overrides).length
}
