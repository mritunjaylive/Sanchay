import { describe, it, expect } from 'vitest'
import { occurrences } from '../recurrence'
import type { RecurringRule, RecurringOverride } from '@sanchay/shared'

describe('domain/recurrence — Occurrence Generation Engine', () => {
  const baseRule: RecurringRule = {
    id: 'rule-1',
    userId: 'user-1',
    title: 'Monthly Rent',
    type: 'expense',
    accountId: 'acc-1',
    toAccountId: null,
    amountMinor: 2500000,
    categoryId: 'cat-rent',
    payee: 'Landlord',
    note: null,
    freq: 'monthly',
    interval: 1,
    byWeekday: null,
    byMonthDay: null,
    startDate: '2026-01-01',
    endDate: null,
    maxCount: null,
    mode: 'auto_post',
    remindDaysBefore: 3,
    pausedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    serverSeq: null,
    version: 1,
  }

  describe('Monthly Recurrence with Month-end Clamping', () => {
    it('generates monthly occurrences clamping 31st to 28th/30th', () => {
      const monthEndRule: RecurringRule = {
        ...baseRule,
        startDate: '2026-01-31',
        byMonthDay: 31,
      }

      const dates = occurrences(monthEndRule, '2026-01-01', '2026-04-30')
      expect(dates).toEqual([
        '2026-01-31',
        '2026-02-28', // Clamped to Feb 28
        '2026-03-31',
        '2026-04-30', // Clamped to Apr 30
      ])
    })

    it('clamps 31st to Feb 29 in a leap year (2024)', () => {
      const leapRule: RecurringRule = {
        ...baseRule,
        startDate: '2024-01-31',
        byMonthDay: 31,
      }

      const dates = occurrences(leapRule, '2024-01-01', '2024-03-31')
      expect(dates).toEqual([
        '2024-01-31',
        '2024-02-29', // Leap year 29
        '2024-03-31',
      ])
    })
  })

  describe('Weekly Recurrence', () => {
    it('generates weekly dates based on start date weekday', () => {
      // 2026-10-05 is a Monday
      const weeklyRule: RecurringRule = {
        ...baseRule,
        freq: 'weekly',
        interval: 1,
        startDate: '2026-10-05',
      }

      const dates = occurrences(weeklyRule, '2026-10-01', '2026-10-26')
      expect(dates).toEqual([
        '2026-10-05',
        '2026-10-12',
        '2026-10-19',
        '2026-10-26',
      ])
    })
  })

  describe('Daily Recurrence & Max Count', () => {
    it('respects count limit', () => {
      const limitedRule: RecurringRule = {
        ...baseRule,
        freq: 'daily',
        interval: 1,
        startDate: '2026-10-01',
        maxCount: 3,
      }

      const dates = occurrences(limitedRule, '2026-10-01', '2026-10-31')
      expect(dates).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
    })
  })

  describe('Overrides — Skip & Move', () => {
    it('applies skip override to remove date', () => {
      const overrides: RecurringOverride[] = [
        {
          id: 'ov-1',
          ruleId: baseRule.id,
          userId: baseRule.userId,
          occurrenceDate: '2026-02-01',
          action: 'skip',
          newDate: null,
          newAmountMinor: null,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          deletedAt: null,
          serverSeq: null,
          version: 1,
        },
      ]

      const dates = occurrences(baseRule, '2026-01-01', '2026-03-31', overrides)
      expect(dates).toEqual(['2026-01-01', '2026-03-01']) // Feb 1 is skipped
    })
  })
})
