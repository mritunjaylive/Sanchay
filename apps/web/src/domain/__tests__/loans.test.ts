import { describe, it, expect } from 'vitest'
import {
  computeReducingEmi,
  computeFlatEmi,
  amortizationSchedule,
  recordEmiTransactions,
  toBps,
  percentToBps,
} from '../loans'
import type { LoanTerms, Account } from '@sanchay/shared'

describe('domain/loans — Loan Amortization & EMI Calculations with Bps', () => {
  const sampleTerms: LoanTerms = {
    id: 'terms-1',
    accountId: 'loan-acc-1',
    userId: 'user-1',
    direction: 'borrowed',
    principalMinor: 10000000, // 100,000 INR
    annualRateBps: 1200, // 12.00% p.a. = 1200 bps
    rateType: 'reducing',
    tenureMonths: 12,
    startDate: '2026-01-01',
    paymentDay: 5,
    emiMinor: 888488, // ~8884.88 INR
    counterparty: 'SBI',
    interestCategoryId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    serverSeq: null,
    version: 1,
  }

  describe('computeReducingEmi with branded Bps', () => {
    it('calculates reducing balance EMI accurately for 12.00% (1200 bps)', () => {
      // 100,000 at 1200 bps for 12 months -> ~8884.88
      const emi = computeReducingEmi(10000000, toBps(1200), 12)
      expect(emi).toBe(888488)
    })

    it('calculates reducing balance EMI accurately for 1.00% (100 bps)', () => {
      // 100,000 at 100 bps (1.00% annual) for 12 months
      // Monthly r = 0.01 / 12 = 0.0008333...
      const emi = computeReducingEmi(10000000, toBps(100), 12)
      expect(emi).toBe(837854) // ~8,378.54
    })

    it('calculates reducing balance EMI accurately for 0.50% (50 bps)', () => {
      // 100,000 at 50 bps (0.50% annual) for 12 months -> ~8,355.92
      const emi = computeReducingEmi(10000000, toBps(50), 12)
      expect(emi).toBe(835592)
    })

    it('handles 0% interest loan (0 bps) as principal / tenure', () => {
      const emi = computeReducingEmi(12000000, toBps(0), 12)
      expect(emi).toBe(1000000)
    })

    it('converts percentage input via percentToBps correctly', () => {
      expect(percentToBps(12)).toBe(toBps(1200))
      expect(percentToBps(1.0)).toBe(toBps(100))
      expect(percentToBps(0.5)).toBe(toBps(50))
      expect(percentToBps(0)).toBe(toBps(0))
    })
  })

  describe('computeFlatEmi with branded Bps', () => {
    it('calculates flat rate EMI accurately for 10.00% (1000 bps)', () => {
      // 100,000 at 1000 bps for 2 years (24 months)
      // Total interest = 100,000 * 10% * 2 = 20,000
      // Total repayment = 120,000 / 24 = 5,000
      const emi = computeFlatEmi(10000000, toBps(1000), 24)
      expect(emi).toBe(500000)
    })

    it('calculates flat rate EMI for 1.00% (100 bps) and 0.50% (50 bps)', () => {
      // 100,000 at 100 bps for 1 year (12 months)
      // Interest = 1,000 -> Total = 101,000 / 12 = 8,416.67
      const emi100 = computeFlatEmi(10000000, toBps(100), 12)
      expect(emi100).toBe(841667)

      // 100,000 at 50 bps for 1 year (12 months)
      // Interest = 500 -> Total = 100,500 / 12 = 8,375.00
      const emi50 = computeFlatEmi(10000000, toBps(50), 12)
      expect(emi50).toBe(837500)
    })
  })

  describe('amortizationSchedule', () => {
    it('generates schedule of exact tenure length and zeroes balance in final installment for reducing rate', () => {
      const schedule = amortizationSchedule(sampleTerms)
      expect(schedule.length).toBe(12)

      // Total principal paid across all installments must equal original principal
      const totalPrincipalPaid = schedule.reduce((sum, item) => sum + item.principalPartMinor, 0)
      expect(totalPrincipalPaid).toBe(sampleTerms.principalMinor)

      // Final outstanding balance must be exactly 0
      const finalRow = schedule[schedule.length - 1]!
      expect(finalRow.outstandingAfterMinor).toBe(0)
    })

    it('generates flat rate schedule and zeroes balance in final installment', () => {
      const flatTerms: LoanTerms = {
        ...sampleTerms,
        rateType: 'flat',
        annualRateBps: 1000,
        tenureMonths: 24,
        emiMinor: null,
      }
      const schedule = amortizationSchedule(flatTerms)
      expect(schedule.length).toBe(24)

      const totalPrincipalPaid = schedule.reduce((sum, item) => sum + item.principalPartMinor, 0)
      expect(totalPrincipalPaid).toBe(flatTerms.principalMinor)

      const finalRow = schedule[schedule.length - 1]!
      expect(finalRow.outstandingAfterMinor).toBe(0)
    })

    it('handles prepayment variants (prepaidPrincipalMinor) shortening the schedule correctly', () => {
      // 100,000 loan with 40,000 prepaid principal -> 60,000 remaining
      const schedule = amortizationSchedule(sampleTerms, 4000000)
      expect(schedule.length).toBeLessThan(12)

      const totalPrincipalPaid = schedule.reduce((sum, item) => sum + item.principalPartMinor, 0)
      expect(totalPrincipalPaid).toBe(sampleTerms.principalMinor - 4000000)

      const finalRow = schedule[schedule.length - 1]!
      expect(finalRow.outstandingAfterMinor).toBe(0)
    })
  })

  describe('recordEmiTransactions', () => {
    it('creates linked transfer (principal) and expense (interest) transactions', () => {
      const loanAccount: Account = {
        id: 'loan-acc-1',
        userId: 'user-1',
        name: 'SBI Personal Loan',
        kind: 'loan',
        currency: 'INR',
        openingBalanceMinor: -10000000,
        openingDate: '2026-01-01',
        creditLimitMinor: null,
        statementDay: null,
        dueDay: 5,
        note: null,
        excludeFromNetWorth: false,
        icon: null,
        color: null,
        sortOrder: 0,
        archivedAt: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        deletedAt: null,
        serverSeq: null,
        version: 1,
      }

      const res = recordEmiTransactions({
        userId: 'user-1',
        loanAccount,
        payingAccountId: 'bank-acc-1',
        terms: sampleTerms,
        installmentNumber: 1,
        principalMinor: 788488,
        interestMinor: 100000,
        occurredOn: '2026-01-05',
        now: '2026-01-05T10:00:00Z',
      }) as { principalTx: Record<string, unknown>; interestTx: Record<string, unknown> }

      // Principal transaction is a transfer from bank to loan account
      expect(res.principalTx.type).toBe('transfer')
      expect(res.principalTx.accountId).toBe('bank-acc-1')
      expect(res.principalTx.toAccountId).toBe('loan-acc-1')
      expect(res.principalTx.amountMinor).toBe(788488)

      // Interest transaction is an expense on paying account
      expect(res.interestTx.type).toBe('expense')
      expect(res.interestTx.accountId).toBe('bank-acc-1')
      expect(res.interestTx.amountMinor).toBe(100000)
    })
  })
})
