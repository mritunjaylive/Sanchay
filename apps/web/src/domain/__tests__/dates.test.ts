import { describe, it, expect } from 'vitest'
import {
  periodFor,
  addOneMonth,
  subtractOneMonth,
  addOneDay,
  subtractOneDay,
  addOneYear,
  subtractOneYear,
  isLeapYear,
  daysInMonth,
} from '../dates'

describe('domain/dates — Pure Date & Period Arithmetic', () => {
  describe('isLeapYear & daysInMonth', () => {
    it('accurately identifies leap years', () => {
      expect(isLeapYear(2024)).toBe(true)
      expect(isLeapYear(2025)).toBe(false)
      expect(isLeapYear(2026)).toBe(false)
      expect(isLeapYear(2000)).toBe(true)
      expect(isLeapYear(1900)).toBe(false)
    })

    it('returns 29 days for Feb in leap year, 28 in regular year', () => {
      expect(daysInMonth(2024, 2)).toBe(29)
      expect(daysInMonth(2025, 2)).toBe(28)
      expect(daysInMonth(2026, 2)).toBe(28)
    })

    it('returns 30 vs 31 days properly', () => {
      expect(daysInMonth(2026, 1)).toBe(31) // Jan
      expect(daysInMonth(2026, 4)).toBe(30) // Apr
      expect(daysInMonth(2026, 7)).toBe(31) // Jul
      expect(daysInMonth(2026, 8)).toBe(31) // Aug
    })
  })

  describe('periodFor — Custom Month Start Day', () => {
    it('calculates standard calendar month when monthStartDay is 1', () => {
      const { start, end } = periodFor('2026-10-15', 1)
      expect(start).toBe('2026-10-01')
      expect(end).toBe('2026-10-31')
    })

    it('handles mid-month salary date when monthStartDay is 25', () => {
      // Date is on or after the 25th: runs from 25th of this month to 24th of next
      const p1 = periodFor('2026-10-26', 25)
      expect(p1.start).toBe('2026-10-25')
      expect(p1.end).toBe('2026-11-24')

      // Date is before the 25th: belongs to period starting 25th of previous month
      const p2 = periodFor('2026-10-10', 25)
      expect(p2.start).toBe('2026-09-25')
      expect(p2.end).toBe('2026-10-24')
    })

    it('handles February boundary when monthStartDay is 28 or 30', () => {
      const p = periodFor('2026-02-15', 28)
      // Clamps to 28th
      expect(p.start).toBe('2026-01-28')
      expect(p.end).toBe('2026-02-27')
    })
  })

  describe('addOneMonth & subtractOneMonth', () => {
    it('transitions across year boundaries correctly', () => {
      expect(addOneMonth('2026-12')).toBe('2027-01')
      expect(subtractOneMonth('2026-01')).toBe('2025-12')
    })

    it('increments/decrements months normally', () => {
      expect(addOneMonth('2026-05')).toBe('2026-06')
      expect(subtractOneMonth('2026-05')).toBe('2026-04')
    })
  })

  describe('addOneDay & subtractOneDay', () => {
    it('handles end-of-month and end-of-year transitions without UTC skew', () => {
      expect(addOneDay('2026-02-28')).toBe('2026-03-01')
      expect(addOneDay('2024-02-28')).toBe('2024-02-29') // Leap year
      expect(addOneDay('2026-12-31')).toBe('2027-01-01')

      expect(subtractOneDay('2026-03-01')).toBe('2026-02-28')
      expect(subtractOneDay('2024-03-01')).toBe('2024-02-29')
      expect(subtractOneDay('2026-01-01')).toBe('2025-12-31')
    })
  })
})
