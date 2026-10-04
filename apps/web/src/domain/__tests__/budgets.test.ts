import { describe, it, expect } from 'vitest'
import {
  getEffectiveBudget,
  checkBudgetThreshold,
  calculateBudgetStatus,
} from '../budgets'
import type { Budget, Transaction } from '@sanchay/shared'

describe('domain/budgets — Budget Calculations & Threshold Detection', () => {
  const sampleBudgets: Budget[] = [
    {
      id: 'b-1',
      userId: 'user-1',
      categoryId: 'cat-food',
      amountMinor: 1000000, // 10,000 INR
      effectiveFrom: '2026-01',
      rollover: true,
      alertThresholds: [80, 100],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      deletedAt: null,
      serverSeq: null,
      version: 1,
    },
    {
      id: 'b-2',
      userId: 'user-1',
      categoryId: 'cat-food',
      amountMinor: 1200000, // 12,000 INR effective from March
      effectiveFrom: '2026-03',
      rollover: true,
      alertThresholds: [80, 100],
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
      deletedAt: null,
      serverSeq: null,
      version: 1,
    },
  ]

  describe('getEffectiveBudget', () => {
    it('returns the budget active for the target month based on effectiveFrom', () => {
      // In February, b-1 is effective
      const febBudget = getEffectiveBudget(sampleBudgets, 'cat-food', '2026-02')
      expect(febBudget?.id).toBe('b-1')
      expect(febBudget?.amountMinor).toBe(1000000)

      // In March, b-2 is effective
      const marBudget = getEffectiveBudget(sampleBudgets, 'cat-food', '2026-03')
      expect(marBudget?.id).toBe('b-2')
      expect(marBudget?.amountMinor).toBe(1200000)

      // In December 2025 (before b-1), none exists
      const oldBudget = getEffectiveBudget(sampleBudgets, 'cat-food', '2025-12')
      expect(oldBudget).toBeNull()
    })
  })

  describe('checkBudgetThreshold', () => {
    it('detects crossing 80% threshold', () => {
      // Budget: 10,000 (1000000 minor)
      // Spent before: 7,500 (75%)
      // New expense: 1,000 (total 8,500 = 85%) -> crosses 80%
      const threshold = checkBudgetThreshold(750000, 100000, 1000000, [80, 100])
      expect(threshold).toBe(80)
    })

    it('detects crossing 100% threshold', () => {
      // Spent before: 9,500 (95%)
      // New expense: 1,000 (total 10,500 = 105%) -> crosses 100%
      const threshold = checkBudgetThreshold(950000, 100000, 1000000, [80, 100])
      expect(threshold).toBe(100)
    })

    it('returns null if no threshold crossed', () => {
      // Spent before: 2,000 (20%)
      // New expense: 1,000 (30%) -> below 80%
      const threshold = checkBudgetThreshold(200000, 100000, 1000000, [80, 100])
      expect(threshold).toBeNull()
    })
  })

  describe('calculateBudgetStatus', () => {
    it('computes status and percentage used', () => {
      const txs: Transaction[] = [
        {
          id: 'tx-1',
          userId: 'user-1',
          type: 'expense',
          accountId: 'acc-1',
          toAccountId: null,
          amountMinor: 500000, // 5,000
          toAmountMinor: null,
          baseAmountMinor: 500000,
          fxRate: '1',
          occurredOn: '2026-01-10',
          occurredTime: null,
          source: 'manual',
          categoryId: 'cat-food',
          payee: 'Supermarket',
          note: null,
          paymentMethod: null,
          adjustmentSign: null,
          recurringRuleId: null,
          recurringOccurrenceDate: null,
          createdAt: '2026-01-10T00:00:00Z',
          updatedAt: '2026-01-10T00:00:00Z',
          deletedAt: null,
          serverSeq: null,
          version: 1,
        },
      ]

      const status = calculateBudgetStatus(
        sampleBudgets[0]!,
        sampleBudgets,
        txs,
        '2026-01-01',
        1,
        '2026-01-15',
      )

      expect(status.spentMinor).toBe(500000)
      expect(status.remainingMinor).toBe(500000)
      expect(status.percentUsed).toBe(50)
      expect(status.status).toBe('ok')
    })
  })
})
