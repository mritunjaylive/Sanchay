/**
 * domain/recurrence.ts — Recurring rule occurrence generation.
 *
 * Pure function: occurrences(rule, from, to) → string[] of YYYY-MM-DD dates.
 * No side effects, no Date.now() — uses injected clock where needed.
 *
 * @see Sanchay_spec.md section 10.5
 */
import type { RecurringRule, RecurringOverride } from '@sanchay/shared'
import { addMonths, addOneDay, daysInMonth } from './dates'

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
  const results = new Set<string>()

  // Build a lookup of override actions keyed by the ORIGINAL occurrence date
  const overrideMap = new Map<string, RecurringOverride>()
  for (const o of overrides) {
    overrideMap.set(o.occurrenceDate, o)
  }

  // Effective start = max(rule.startDate, from)
  const effectiveStart = rule.startDate > from ? rule.startDate : from
  const effectiveEnd = rule.endDate && rule.endDate < to ? rule.endDate : to
  const limit = rule.maxCount !== null && rule.maxCount !== undefined ? rule.maxCount : null

  let count = 0
  let current = alignedStart(rule)
  let exhausted = false
  /** Original (pre-override) dates that were visited by the main loop. */
  const visited = new Set<string>()

  // Advance to first occurrence >= effectiveStart
  while (current < effectiveStart) {
    current = nextOccurrence(rule, current)
    count++
    if (limit !== null && count >= limit) {
      exhausted = true
      break
    }
    if (current > effectiveEnd) {
      exhausted = true
      break
    }
  }

  // Generate occurrences
  while (!exhausted && current <= effectiveEnd) {
    if (limit !== null && count >= limit) break

    visited.add(current)
    const override = overrideMap.get(current)
    if (override) {
      if (override.action === 'skip') {
        // Skip this occurrence
      } else if (override.action === 'moved' && override.newDate) {
        if (override.newDate >= from && override.newDate <= to) {
          results.add(override.newDate)
        }
      } else {
        // amount_changed or other: still occurs on same date
        results.add(current)
      }
    } else {
      results.add(current)
    }

    count++
    const next = nextOccurrence(rule, current)
    if (next === current) break // safety: infinite loop guard
    current = next
  }

  // Occurrences moved INTO the window from an original date outside it
  // (e.g. an occurrence before `from` that was moved to a later date).
  if (limit === null) {
    for (const o of overrides) {
      if (o.action !== 'moved' || !o.newDate) continue
      if (visited.has(o.occurrenceDate)) continue
      if (o.occurrenceDate < rule.startDate) continue
      if (rule.endDate && o.occurrenceDate > rule.endDate) continue
      if (o.newDate >= from && o.newDate <= to) results.add(o.newDate)
    }
  }

  return [...results].sort()
}

/**
 * First valid occurrence date. For weekly rules with explicit weekdays the start date itself
 * is only an occurrence if its weekday is selected.
 */
function alignedStart(rule: RecurringRule): string {
  if (rule.freq === 'weekly' && rule.byWeekday && rule.byWeekday.length > 0) {
    const wanted = new Set(rule.byWeekday)
    let d = rule.startDate
    for (let i = 0; i < 7; i++) {
      if (wanted.has(weekdayOf(d))) return d
      d = addOneDay(d)
    }
  }
  return rule.startDate
}

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d).getDay()
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
      // Always re-anchor on the intended day-of-month (byMonthDay, else the start date's day) so
      // that month-end clamping does not drift: Jan 31 -> Feb 28 -> Mar 31 (not Mar 28).
      const [y, m] = addMonths(currentDate.slice(0, 7), rule.interval).split('-').map(Number) as [number, number]
      const anchorDay =
        rule.byMonthDay !== null && rule.byMonthDay !== undefined
          ? rule.byMonthDay
          : parseInt(rule.startDate.slice(8, 10), 10)
      const dim = daysInMonth(y, m)
      const targetDay = anchorDay === -1 ? dim : Math.min(anchorDay, dim)
      return `${y}-${String(m).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`
    }

    case 'yearly': {
      // Re-anchor on the start date's month/day so Feb 29 returns in the next leap year.
      const y = parseInt(currentDate.slice(0, 4), 10) + rule.interval
      const startMonth = parseInt(rule.startDate.slice(5, 7), 10)
      const startDay = parseInt(rule.startDate.slice(8, 10), 10)
      const day = Math.min(startDay, daysInMonth(y, startMonth))
      return `${y}-${String(startMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }

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
