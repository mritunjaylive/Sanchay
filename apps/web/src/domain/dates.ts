/**
 * domain/dates.ts — Date and period arithmetic.
 *
 * KEY RULE: `occurred_on` is always a local calendar date string (YYYY-MM-DD).
 * Never convert through UTC. Never use `new Date()` for calendar math.
 *
 * All functions here are pure — they take and return strings or numbers only.
 * No side effects, no Date.now() without an injected clock parameter.
 *
 * @see Sanchay_spec.md section 8 (rule 7)
 */

/**
 * A "period" is a billing month that starts on `monthStartDay` of each calendar month.
 * The period label is YYYY-MM (the calendar month in which the period STARTS).
 */
export interface Period {
  /** YYYY-MM label for this period */
  label: string
  /** First day of this period (YYYY-MM-DD) */
  start: string
  /** Last day of this period (inclusive, YYYY-MM-DD) */
  end: string
}

/**
 * Find which billing period a date belongs to.
 *
 * If `monthStartDay` is 1, periods are standard calendar months.
 * If `monthStartDay` is 15, the period "2026-01" runs from 2026-01-15 to 2026-02-14.
 *
 * @param dateStr YYYY-MM-DD
 * @param monthStartDay 1–28
 */
export function periodFor(dateStr: string, monthStartDay: number): Period {
  const [yearStr, monthStr, dayStr] = dateStr.split('-')
  const year = parseInt(yearStr!, 10)
  const month = parseInt(monthStr!, 10) // 1-indexed
  const day = parseInt(dayStr!, 10)

  let periodYear: number
  let periodMonth: number

  if (day >= monthStartDay) {
    // Same calendar month as the period
    periodYear = year
    periodMonth = month
  } else {
    // Previous calendar month is the period
    if (month === 1) {
      periodYear = year - 1
      periodMonth = 12
    } else {
      periodYear = year
      periodMonth = month - 1
    }
  }

  const label = `${periodYear}-${String(periodMonth).padStart(2, '0')}`
  const start = `${periodYear}-${String(periodMonth).padStart(2, '0')}-${String(monthStartDay).padStart(2, '0')}`
  const end = periodEnd(periodYear, periodMonth, monthStartDay)

  return { label, start, end }
}

/**
 * Build the billing period whose label is `label` (YYYY-MM = calendar month in which it STARTS).
 * Unlike `periodFor('YYYY-MM-01', day)` this never shifts into the previous period when
 * `monthStartDay > 1`.
 */
export function periodForLabel(label: string, monthStartDay: number): Period {
  const [yearStr, monthStr] = label.split('-')
  const year = parseInt(yearStr!, 10)
  const month = parseInt(monthStr!, 10)
  const start = `${year}-${String(month).padStart(2, '0')}-${String(monthStartDay).padStart(2, '0')}`
  return {
    label: `${year}-${String(month).padStart(2, '0')}`,
    start,
    end: periodEnd(year, month, monthStartDay),
  }
}

/** Whole days from `fromDate` to `toDate` (YYYY-MM-DD), without UTC conversion. Negative if `toDate` is earlier. */
export function daysBetween(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = toDate.split('-').map(Number) as [number, number, number]
  // Date.UTC is used purely as a day counter (no time-zone or DST shifts).
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/** Today's LOCAL calendar date (YYYY-MM-DD). Never goes through UTC. */
export function todayLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Get the end date of a period (the day before the next period starts). */
function periodEnd(periodYear: number, periodMonth: number, monthStartDay: number): string {
  let nextYear: number
  let nextMonth: number
  if (periodMonth === 12) {
    nextYear = periodYear + 1
    nextMonth = 1
  } else {
    nextYear = periodYear
    nextMonth = periodMonth + 1
  }

  // End date = (next period start) - 1 day
  const nextStartStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(monthStartDay).padStart(2, '0')}`
  return subtractOneDay(nextStartStr)
}

/** Number of days in a given month (1-indexed month). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Subtract one day from a YYYY-MM-DD string without using UTC. */
export function subtractOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  if (d > 1) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d - 1).padStart(2, '0')}`
  }
  if (m === 1) {
    return `${y - 1}-12-31`
  }
  const prevMonth = m - 1
  const lastDay = daysInMonth(y, prevMonth)
  return `${y}-${String(prevMonth).padStart(2, '0')}-${lastDay}`
}

/** Add one day to a YYYY-MM-DD string without using UTC. */
export function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  const dim = daysInMonth(y, m)
  if (d < dim) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`
  }
  if (m === 12) {
    return `${y + 1}-01-01`
  }
  return `${y}-${String(m + 1).padStart(2, '0')}-01`
}

/** Format today's date as YYYY-MM-DD in the given IANA time zone. */
export function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
}

/** Compare two YYYY-MM-DD strings. Returns -1, 0, or 1. */
export function compareDate(a: string, b: string): -1 | 0 | 1 {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** True if date string a is on or before b. */
export function dateOnOrBefore(a: string, b: string): boolean {
  return a <= b
}

/** True if date string a is on or after b. */
export function dateOnOrAfter(a: string, b: string): boolean {
  return a >= b
}

/** Add N months to a YYYY-MM-DD or YYYY-MM, clamping to the last day of the resulting month. */
export function addMonths(dateStr: string, n: number): string {
  const parts = dateStr.split('-').map(Number)
  const isMonthOnly = parts.length === 2
  const y = parts[0]!
  const m = parts[1]!
  const d = isMonthOnly ? 1 : (parts[2] ?? 1)
  let newYear = y
  let newMonth = m + n

  while (newMonth > 12) {
    newMonth -= 12
    newYear++
  }
  while (newMonth < 1) {
    newMonth += 12
    newYear--
  }

  if (isMonthOnly) {
    return `${newYear}-${String(newMonth).padStart(2, '0')}`
  }

  const dim = daysInMonth(newYear, newMonth)
  const newDay = Math.min(d, dim) // month-end clamping

  return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`
}

/** Add N years to a YYYY-MM-DD, handling Feb 29 leap year clamping. */
export function addYears(dateStr: string, n: number): string {
  return addMonths(dateStr, n * 12)
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export const addOneMonth = (dateStr: string): string => addMonths(dateStr, 1)
export const subtractOneMonth = (dateStr: string): string => addMonths(dateStr, -1)
export const addOneYear = (dateStr: string): string => addYears(dateStr, 1)
export const subtractOneYear = (dateStr: string): string => addYears(dateStr, -1)

/** Return the next occurrence of a weekday (0=Sun…6=Sat) on or after startDate. */
export function nextWeekday(dateStr: string, weekday: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d) // local time, no UTC
  const currentWeekday = date.getDay()
  const daysUntil = (weekday - currentWeekday + 7) % 7
  const result = new Date(y, m - 1, d + daysUntil)
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, '0')}-${String(result.getDate()).padStart(2, '0')}`
}

/** Get the YYYY-MM for N months ago (for rollover look-back). */
export function monthsAgoLabel(fromLabel: string, n: number): string {
  const [y, m] = fromLabel.split('-').map(Number) as [number, number]
  let newYear = y
  let newMonth = m - n

  while (newMonth < 1) {
    newMonth += 12
    newYear--
  }

  return `${newYear}-${String(newMonth).padStart(2, '0')}`
}
