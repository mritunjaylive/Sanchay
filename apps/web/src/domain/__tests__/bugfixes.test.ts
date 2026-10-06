/**
 * Regression tests for the bug-fix patch (recurrence drift, billing periods, budgets,
 * credit card due dates, loans, amount parsing, ids, reports).
 */
import { describe, it, expect } from 'vitest'
import type { Account, Budget, LoanTerms, RecurringOverride, RecurringRule, Transaction } from '@sanchay/shared'
import { occurrences } from '../recurrence'
import { periodForLabel, periodFor, daysBetween, todayLocal } from '../dates'
import { calculateBudgetStatus } from '../budgets'
import { getCardStatementDates, getCreditCardSummary } from '../creditCards'
import { amortizationSchedule, outstandingAsOf, recordEmiTransactions } from '../loans'
import { accountBalance, balanceOn, netWorth } from '../balance'
import { calculateTopPayees } from '../reports'
import { suggestPayees } from '../suggestions'
import { parseAmountToMinor, parseDecimalToScaled, multiplyMinor, evaluateExpression } from '../../lib/money'
import { uuidv7 } from '../../lib/ids'

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1',
  userId: 'u1',
  title: 'Rule',
  type: 'expense',
  accountId: 'a1',
  toAccountId: null,
  amountMinor: 100,
  categoryId: null,
  payee: null,
  note: null,
  freq: 'monthly',
  interval: 1,
  byWeekday: null,
  byMonthDay: null,
  startDate: '2026-01-01',
  endDate: null,
  maxCount: null,
  mode: 'auto_post',
  remindDaysBefore: 1,
  pausedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
  serverSeq: null,
  version: 1,
  ...over,
})

const tx = (over: Partial<Transaction>): Transaction =>
  ({
    id: Math.random().toString(36),
    userId: 'u1',
    type: 'expense',
    accountId: 'a1',
    toAccountId: null,
    amountMinor: 100,
    toAmountMinor: null,
    baseAmountMinor: 100,
    fxRate: '1',
    occurredOn: '2026-01-10',
    occurredTime: null,
    categoryId: null,
    payee: null,
    note: null,
    paymentMethod: null,
    adjustmentSign: null,
    recurringRuleId: null,
    recurringOccurrenceDate: null,
    source: 'manual',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    serverSeq: null,
    version: 1,
    ...over,
  }) as Transaction

describe('recurrence fixes', () => {
  it('monthly rule starting on the 31st does not drift after a short month', () => {
    const dates = occurrences(rule({ startDate: '2026-01-31' }), '2026-01-01', '2026-05-31')
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('yearly Feb 29 rule returns on Feb 29 in the next leap year', () => {
    const dates = occurrences(rule({ freq: 'yearly', startDate: '2024-02-29' }), '2024-01-01', '2028-12-31')
    expect(dates).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'])
  })

  it('weekly rule does not include a start date whose weekday is not selected', () => {
    // 2026-01-04 is a Sunday; only Mondays (1) are selected.
    const dates = occurrences(
      rule({ freq: 'weekly', startDate: '2026-01-04', byWeekday: [1] }),
      '2026-01-01',
      '2026-01-20',
    )
    expect(dates).toEqual(['2026-01-05', '2026-01-12', '2026-01-19'])
  })

  it('an occurrence moved into the window from before it is still returned', () => {
    const override = {
      id: 'o1',
      userId: 'u1',
      ruleId: 'r1',
      occurrenceDate: '2026-01-01',
      action: 'moved',
      newDate: '2026-02-10',
      newAmountMinor: null,
    } as unknown as RecurringOverride
    const dates = occurrences(rule(), '2026-02-01', '2026-02-28', [override])
    expect(dates).toEqual(['2026-02-01', '2026-02-10'])
  })
})

describe('date helpers', () => {
  it('periodForLabel keeps the label month when monthStartDay > 1', () => {
    expect(periodForLabel('2026-10', 15)).toEqual({ label: '2026-10', start: '2026-10-15', end: '2026-11-14' })
    // periodFor on the 1st of the month belongs to the previous period (the old pitfall)
    expect(periodFor('2026-10-01', 15).label).toBe('2026-09')
  })

  it('daysBetween spans month boundaries', () => {
    expect(daysBetween('2026-10-20', '2026-11-14')).toBe(25)
    expect(daysBetween('2026-11-14', '2026-10-20')).toBe(-25)
  })

  it('todayLocal uses local calendar components, not UTC', () => {
    expect(todayLocal(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05')
  })
})

describe('budget fixes', () => {
  const budget = (over: Partial<Budget> = {}): Budget => ({
    id: 'b1',
    userId: 'u1',
    categoryId: 'food',
    amountMinor: 100000,
    effectiveFrom: '2026-01',
    rollover: false,
    alertThresholds: [100, 80],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    serverSeq: null,
    version: 1,
    ...over,
  })

  it('uses the billing period that STARTS in the labelled month (monthStartDay 15)', () => {
    const b = budget()
    const txs = [
      tx({ categoryId: 'food', amountMinor: 30000, baseAmountMinor: 30000, occurredOn: '2026-10-20' }),
      tx({ categoryId: 'food', amountMinor: 99999, baseAmountMinor: 99999, occurredOn: '2026-10-05' }), // previous period
    ]
    const s = calculateBudgetStatus(b, [b], txs, '2026-10-01', 15, '2026-10-20')
    expect(s.spentMinor).toBe(30000)
  })

  it('counts sub-category spending toward the parent category budget', () => {
    const b = budget()
    const txs = [tx({ categoryId: 'pizza', amountMinor: 5000, baseAmountMinor: 5000, occurredOn: '2026-10-10' })]
    const s = calculateBudgetStatus(b, [b], txs, '2026-10-01', 1, '2026-10-10', [
      { id: 'food', parentId: null },
      { id: 'pizza', parentId: 'food' },
    ])
    expect(s.spentMinor).toBe(5000)
  })

  it('daily allowance counts the days left across a month boundary', () => {
    const b = budget()
    // Period 15 Oct - 14 Nov, today 20 Oct => 26 days left including today
    const s = calculateBudgetStatus(b, [b], [], '2026-10-01', 15, '2026-10-20')
    expect(s.dailyAllowanceMinor).toBe(Math.floor(100000 / 26))
  })

  it('uses the lowest alert threshold regardless of array order', () => {
    const b = budget({ alertThresholds: [100, 80] })
    const txs = [tx({ categoryId: 'food', amountMinor: 85000, baseAmountMinor: 85000, occurredOn: '2026-10-10' })]
    expect(calculateBudgetStatus(b, [b], txs, '2026-10-01', 1, '2026-10-10').status).toBe('warning')
  })
})

describe('credit card fixes', () => {
  const card = { statementDay: 5, dueDay: 25, creditLimitMinor: 100000 } as unknown as Account

  it('due date is in the same month when dueDay is after statementDay', () => {
    expect(getCardStatementDates(card, '2026-10-10')).toEqual({
      lastStatementDate: '2026-10-05',
      paymentDueDate: '2026-10-25',
    })
  })

  it('due date rolls to the next month when dueDay is not after statementDay', () => {
    const c = { statementDay: 25, dueDay: 10 } as unknown as Account
    expect(getCardStatementDates(c, '2026-10-26')).toEqual({
      lastStatementDate: '2026-10-25',
      paymentDueDate: '2026-11-10',
    })
  })

  it('ignores soft-deleted transactions in the statement amount', () => {
    const acc = {
      id: 'cc',
      openingBalanceMinor: 0,
      openingDate: '2026-01-01',
      statementDay: 5,
      dueDay: 25,
      creditLimitMinor: null,
    } as unknown as Account
    const txs = [
      tx({ accountId: 'cc', amountMinor: 1000, occurredOn: '2026-10-01' }),
      tx({ accountId: 'cc', amountMinor: 9000, occurredOn: '2026-10-02', deletedAt: '2026-10-03T00:00:00Z' }),
    ]
    expect(getCreditCardSummary(acc, txs, '2026-10-10').statementAmountDueMinor).toBe(1000)
  })
})

describe('loan fixes', () => {
  const terms = (over: Partial<LoanTerms> = {}): LoanTerms => ({
    id: 't1',
    accountId: 'l1',
    userId: 'u1',
    direction: 'borrowed',
    principalMinor: 100000,
    annualRateBps: 1000,
    rateType: 'flat',
    tenureMonths: 7,
    startDate: '2026-01-01',
    paymentDay: 5,
    emiMinor: null,
    counterparty: null,
    interestCategoryId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    serverSeq: null,
    version: 1,
    ...over,
  })

  it('flat schedule: total interest equals principal x rate x years (drift absorbed by last row)', () => {
    const s = amortizationSchedule(terms())
    const totalInterest = s.reduce((sum, r) => sum + r.interestMinor, 0)
    expect(totalInterest).toBe(Math.round(100000 * 0.1 * (7 / 12)))
    expect(s.reduce((sum, r) => sum + r.principalMinor, 0)).toBe(100000)
    expect(s.at(-1)!.outstandingMinor).toBe(0)
  })

  it('flat schedule honours a user supplied EMI', () => {
    const s = amortizationSchedule(terms({ emiMinor: 20000 }))
    expect(s[0]!.totalMinor).toBe(20000)
  })

  it('outstandingAsOf returns the full principal before the first installment is due', () => {
    const s = amortizationSchedule(terms({ rateType: 'reducing' }))
    expect(outstandingAsOf(s, '2026-01-02')).toBe(100000)
  })

  it('recordEmiTransactions does not fall back to installment 1 when out of range', () => {
    expect(recordEmiTransactions(terms(), 99)).toEqual({ principalMinor: 0, interestMinor: 0, totalMinor: 0 })
  })
})

describe('balance fixes', () => {
  const acc = {
    id: 'a1',
    openingBalanceMinor: 5000,
    openingDate: '2026-03-01',
    currency: 'INR',
    kind: 'bank',
    archivedAt: null,
    deletedAt: null,
    excludeFromNetWorth: false,
  } as unknown as Account

  it('balanceOn is 0 before the opening date', () => {
    expect(balanceOn(acc, [], '2026-02-01')).toBe(0)
    expect(balanceOn(acc, [], '2026-03-01')).toBe(5000)
    expect(accountBalance(acc, [])).toBe(5000)
  })

  it('netWorth skips soft-deleted accounts', () => {
    const deleted = { ...acc, id: 'a2', deletedAt: '2026-04-01T00:00:00Z' } as Account
    const r = netWorth([acc, deleted], [], (m) => m)
    expect(r.assets).toBe(5000)
  })
})

describe('reports & suggestions fixes', () => {
  it('top payees are grouped case-insensitively', () => {
    const txs = [
      tx({ payee: 'Swiggy', amountMinor: 100, baseAmountMinor: 100 }),
      tx({ payee: 'swiggy ', amountMinor: 200, baseAmountMinor: 200 }),
    ]
    expect(calculateTopPayees(txs, '2026-01-01', '2026-12-31')).toEqual([
      { payee: 'Swiggy', amountMinor: 300, count: 2 },
    ])
  })

  it('suggestPayees ranks prefix matches before substring matches', () => {
    const txs = [
      tx({ payee: 'Big Cafe', occurredOn: '2026-01-01' }),
      tx({ payee: 'Big Cafe', occurredOn: '2026-01-02' }),
      tx({ payee: 'Cafe Coffee Day', occurredOn: '2026-01-03' }),
    ]
    expect(suggestPayees(txs, 'cafe')[0]).toBe('Cafe Coffee Day')
  })
})

describe('money & id fixes', () => {
  it('parses thousands separators inside expressions', () => {
    expect(parseAmountToMinor('1,234 + 5', 'INR')).toBe(123900)
  })

  it('rejects a bare decimal separator', () => {
    expect(() => parseDecimalToScaled('.', 2)).toThrow()
    expect(() => parseAmountToMinor('.', 'INR')).toThrow()
  })

  it('supports repeated unary signs', () => {
    expect(evaluateExpression('2 - -3', 'INR')).toBe(500)
    expect(evaluateExpression('--3', 'INR')).toBe(300)
  })

  it('multiplyMinor accepts tiny rates that stringify with an exponent', () => {
    expect(multiplyMinor(1_000_000_000, 1e-7, 2, 2)).toBe(100)
  })

  it('uuidv7 returns a canonical 8-4-4-4-12 UUID', () => {
    for (let i = 0; i < 50; i++) {
      expect(uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    }
  })

  it('uuidv7 is time ordered', async () => {
    const a = uuidv7()
    await new Promise((r) => setTimeout(r, 5))
    const b = uuidv7()
    expect(a < b).toBe(true)
  })
})
