import { describe, it, expect } from 'vitest'
import {
  accountSchema,
  transactionSchema,
  categorySchema,
  budgetSchema,
  TABLES,
  currencyExponent,
} from '../index.js'

describe('@sanchay/shared — Schema Validation & Business Rules', () => {
  describe('Dependency Order (TABLES)', () => {
    it('exports tables in proper dependency order for sync', () => {
      expect(TABLES).toBeDefined()
      expect(TABLES.length).toBeGreaterThan(0)
      // profiles and categories should come before transactions
      const profileIdx = TABLES.indexOf('profiles')
      const txIdx = TABLES.indexOf('transactions')
      expect(profileIdx).toBeLessThan(txIdx)
    })
  })

  describe('Currency Exponents', () => {
    it('returns 0 for JPY, 2 for INR/USD, 3 for KWD', () => {
      expect(currencyExponent('JPY')).toBe(0)
      expect(currencyExponent('INR')).toBe(2)
      expect(currencyExponent('USD')).toBe(2)
      expect(currencyExponent('KWD')).toBe(3)
    })
  })

  describe('Account Schema', () => {
    it('accepts valid account row', () => {
      const valid = {
        id: '11111111-1111-7111-8111-111111111111',
        userId: '22222222-2222-7222-8222-222222222222',
        name: 'HDFC Salary Account',
        kind: 'bank',
        currency: 'INR',
        openingBalanceMinor: 5000000,
        openingDate: '2026-01-01',
        icon: 'Landmark',
        color: '#3b82f6',
        sortOrder: 0,
        archivedAt: null,
        excludeFromNetWorth: false,
        creditLimitMinor: null,
        statementDay: null,
        dueDay: null,
        note: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        deletedAt: null,
        serverSeq: null,
        version: 1,
      }

      const result = accountSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })
  })

  describe('Transaction Schema & Constraints', () => {
    const baseTx = {
      id: '11111111-1111-7111-8111-111111111111',
      userId: '22222222-2222-7222-8222-222222222222',
      accountId: '33333333-3333-7333-8333-333333333333',
      amountMinor: 50000,
      occurredOn: '2026-01-15',
      occurredTime: '14:30',
      payee: 'Grocery Store',
      note: 'Weekly essentials',
      paymentMethod: 'UPI',
      fxRate: '1',
      baseAmountMinor: 50000,
      recurringRuleId: null,
      recurringOccurrenceDate: null,
      source: 'manual' as const,
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
      deletedAt: null,
      serverSeq: null,
      version: 1,
    }

    it('accepts valid expense transaction', () => {
      const valid = {
        ...baseTx,
        type: 'expense' as const,
        categoryId: '44444444-4444-7444-8444-444444444444',
        toAccountId: null,
        toAmountMinor: null,
        adjustmentSign: null,
      }
      expect(transactionSchema.safeParse(valid).success).toBe(true)
    })

    it('rejects transfer without toAccountId or toAmountMinor', () => {
      const invalidTransfer = {
        ...baseTx,
        type: 'transfer' as const,
        categoryId: null,
        toAccountId: null,
        toAmountMinor: null,
        adjustmentSign: null,
      }
      const result = transactionSchema.safeParse(invalidTransfer)
      expect(result.success).toBe(false)
    })

    it('rejects non-transfer with toAccountId', () => {
      const invalidExpense = {
        ...baseTx,
        type: 'expense' as const,
        categoryId: '44444444-4444-7444-8444-444444444444',
        toAccountId: '55555555-5555-7555-8555-555555555555',
        toAmountMinor: 50000,
        adjustmentSign: null,
      }
      const result = transactionSchema.safeParse(invalidExpense)
      expect(result.success).toBe(false)
    })

    it('rejects adjustment without adjustmentSign', () => {
      const invalidAdjustment = {
        ...baseTx,
        type: 'adjustment' as const,
        categoryId: null,
        toAccountId: null,
        toAmountMinor: null,
        adjustmentSign: null,
      }
      const result = transactionSchema.safeParse(invalidAdjustment)
      expect(result.success).toBe(false)
    })
  })
})
