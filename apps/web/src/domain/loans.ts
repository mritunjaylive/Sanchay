/**
 * domain/loans.ts — Loan amortization schedule.
 *
 * Spec section 10.6:
 *   Reducing-balance: EMI = P·r·(1+r)^n / ((1+r)^n − 1), r = annual_rate / 12
 *   Flat-rate: interest = P × rate × years, total ÷ n
 *   Final installment absorbs rounding drift.
 *
 * All arithmetic uses integer minor units (bigint-safe number range).
 */
import { roundHalfAwayFromZero } from '../lib/money'
import type { LoanTerms } from '@sanchay/shared'
import { addMonths, daysInMonth } from './dates'

export interface AmortizationRow {
  installmentNo: number
  installmentNumber: number
  dueDate: string
  principalMinor: number
  principalPartMinor: number
  interestMinor: number
  interestPartMinor: number
  totalMinor: number
  emiMinor: number
  outstandingMinor: number // balance after this payment
  outstandingAfterMinor: number
}

/**
 * Generate the full amortization schedule.
 *
 * @param terms The loan terms
 * @param prepaidPrincipalMinor Extra principal already paid (reduces remaining schedule)
 */
export function amortizationSchedule(
  terms: LoanTerms,
  prepaidPrincipalMinor = 0,
): AmortizationRow[] {
  const { principalMinor, annualRateBps, tenureMonths, startDate, emiMinor, paymentDay, rateType } = terms

  const rows: AmortizationRow[] = []
  const annualRate = annualRateBps / 10000 // e.g. 1200 bps = 12.00% = 0.12

  // Monthly rate
  const monthlyRate = annualRate / 12

  // Calculate EMI if not provided
  let computedEmi: number
  if (emiMinor !== null && emiMinor !== undefined) {
    computedEmi = emiMinor
  } else {
    computedEmi = computeEmi(principalMinor, monthlyRate, tenureMonths, rateType)
  }

  if (rateType === 'flat') {
    return flatSchedule(terms, computedEmi, prepaidPrincipalMinor)
  }

  // Reducing balance schedule
  let outstanding = principalMinor - prepaidPrincipalMinor
  let dueDate = firstDueDate(startDate, paymentDay ?? 1)

  for (let i = 0; i < tenureMonths && outstanding > 0; i++) {
    const isLast = i === tenureMonths - 1

    const interestMinor = roundHalfAwayFromZero(outstanding * monthlyRate)
    let principalPart: number
    let totalPart: number

    if (isLast) {
      // Last installment absorbs rounding drift
      principalPart = outstanding
      totalPart = principalPart + interestMinor
    } else {
      totalPart = Math.min(computedEmi, outstanding + interestMinor)
      principalPart = totalPart - interestMinor
    }

    outstanding -= principalPart

    rows.push({
      installmentNo: i + 1,
      installmentNumber: i + 1,
      dueDate,
      principalMinor: principalPart,
      principalPartMinor: principalPart,
      interestMinor,
      interestPartMinor: interestMinor,
      totalMinor: totalPart,
      emiMinor: totalPart,
      outstandingMinor: Math.max(0, outstanding),
      outstandingAfterMinor: Math.max(0, outstanding),
    })

    dueDate = nextPaymentDate(dueDate, paymentDay ?? 1)
  }

  return rows
}

/** Compute the EMI for a reducing-balance loan. */
export function computeEmi(
  principalMinor: number,
  monthlyRate: number,
  tenureMonths: number,
  rateType: 'reducing' | 'flat',
): number {
  if (rateType === 'flat') {
    // flat: (P + P * r * years) / n
    const totalInterest = roundHalfAwayFromZero(principalMinor * monthlyRate * 12 * (tenureMonths / 12))
    return roundHalfAwayFromZero((principalMinor + totalInterest) / tenureMonths)
  }

  if (monthlyRate === 0) {
    // Interest-free
    return roundHalfAwayFromZero(principalMinor / tenureMonths)
  }

  // EMI = P * r * (1+r)^n / ((1+r)^n - 1)
  const r = monthlyRate
  const n = tenureMonths
  const pow = Math.pow(1 + r, n)
  return roundHalfAwayFromZero((principalMinor * r * pow) / (pow - 1))
}

/**
 * Branded type for basis points (1 bp = 0.01%, 100 bps = 1.00%, 1200 bps = 12.00%).
 * Enforces compile-time safety so percentages and basis points cannot be mixed.
 */
export type Bps = number & { readonly __brand: unique symbol }

/** Convert a percentage input (e.g. 10.5 for 10.5%, 1 for 1%) to branded Bps. */
export function percentToBps(percent: number): Bps {
  return Math.round(percent * 100) as Bps
}

/** Cast or validate integer basis points to branded Bps. */
export function toBps(bps: number): Bps {
  return Math.round(bps) as Bps
}

export function computeReducingEmi(principalMinor: number, annualRateBps: Bps, tenureMonths: number): number {
  const rateFraction = annualRateBps / 10000
  const monthlyRate = rateFraction / 12
  return computeEmi(principalMinor, monthlyRate, tenureMonths, 'reducing')
}

export function computeFlatEmi(principalMinor: number, annualRateBps: Bps, tenureMonths: number): number {
  const rateFraction = annualRateBps / 10000
  const monthlyRate = rateFraction / 12
  return computeEmi(principalMinor, monthlyRate, tenureMonths, 'flat')
}

export interface RecordEmiParams {
  userId: string
  loanAccount: { id: string; name: string }
  payingAccountId: string
  terms: LoanTerms
  installmentNumber: number
  principalMinor: number
  interestMinor: number
  occurredOn: string
  now?: string
}

export function recordEmiTransactions(
  terms: LoanTerms,
  installmentNo: number,
): { principalMinor: number; interestMinor: number; totalMinor: number }

export function recordEmiTransactions(
  params: RecordEmiParams,
): { principalTx: Record<string, unknown>; interestTx: Record<string, unknown> }

export function recordEmiTransactions(
  paramsOrTerms: RecordEmiParams | LoanTerms,
  installmentNo?: number,
):
  | { principalTx: Record<string, unknown>; interestTx: Record<string, unknown> }
  | { principalMinor: number; interestMinor: number; totalMinor: number } {
  if (installmentNo !== undefined && 'annualRateBps' in paramsOrTerms) {
    const schedule = amortizationSchedule(paramsOrTerms as LoanTerms)
    const row = schedule[installmentNo - 1] ?? schedule[0]!
    return {
      principalMinor: row.principalMinor,
      interestMinor: row.interestMinor,
      totalMinor: row.totalMinor,
    }
  }

  const params = paramsOrTerms as RecordEmiParams
  const principalTx = {
    userId: params.userId,
    type: 'transfer' as const,
    accountId: params.payingAccountId,
    toAccountId: params.loanAccount.id,
    amountMinor: params.principalMinor,
    toAmountMinor: params.principalMinor,
    baseAmountMinor: params.principalMinor,
    fxRate: '1',
    occurredOn: params.occurredOn,
    occurredTime: null,
    categoryId: null,
    payee: `Loan EMI #${params.installmentNumber} Principal`,
    note: `EMI payment for ${params.loanAccount.name}`,
    paymentMethod: null,
    adjustmentSign: null,
    recurringRuleId: null,
    recurringOccurrenceDate: null,
    source: 'loan_schedule' as const,
  }

  const interestTx = {
    userId: params.userId,
    type: 'expense' as const,
    accountId: params.payingAccountId,
    toAccountId: null,
    amountMinor: params.interestMinor,
    toAmountMinor: null,
    baseAmountMinor: params.interestMinor,
    fxRate: '1',
    occurredOn: params.occurredOn,
    occurredTime: null,
    categoryId: params.terms.interestCategoryId ?? null,
    payee: `Loan EMI #${params.installmentNumber} Interest`,
    note: `Interest portion for ${params.loanAccount.name}`,
    paymentMethod: null,
    adjustmentSign: null,
    recurringRuleId: null,
    recurringOccurrenceDate: null,
    source: 'loan_schedule' as const,
  }

  return { principalTx, interestTx }
}

function flatSchedule(
  terms: LoanTerms,
  emi: number,
  prepaidPrincipal: number,
): AmortizationRow[] {
  const rows: AmortizationRow[] = []
  const { principalMinor, annualRateBps, tenureMonths, startDate, paymentDay } = terms
  const annualRate = annualRateBps / 10000

  const totalInterest = roundHalfAwayFromZero(principalMinor * annualRate * (tenureMonths / 12))
  const interestPerInstallment = roundHalfAwayFromZero(totalInterest / tenureMonths)
  const principalPerInstallment = roundHalfAwayFromZero(principalMinor / tenureMonths)

  let outstanding = principalMinor - prepaidPrincipal
  let dueDate = firstDueDate(startDate, paymentDay ?? 1)

  for (let i = 0; i < tenureMonths && outstanding > 0; i++) {
    const isLast = i === tenureMonths - 1
    const principalPart = isLast ? outstanding : Math.min(principalPerInstallment, outstanding)
    const total = principalPart + interestPerInstallment

    outstanding -= principalPart

    rows.push({
      installmentNo: i + 1,
      installmentNumber: i + 1,
      dueDate,
      principalMinor: principalPart,
      principalPartMinor: principalPart,
      interestMinor: interestPerInstallment,
      interestPartMinor: interestPerInstallment,
      totalMinor: total,
      emiMinor: total,
      outstandingMinor: Math.max(0, outstanding),
      outstandingAfterMinor: Math.max(0, outstanding),
    })

    dueDate = nextPaymentDate(dueDate, paymentDay ?? 1)
  }

  return rows
}

/** First payment date after the loan start date on the given payment day. */
function firstDueDate(startDate: string, paymentDay: number): string {
  const [y, m] = startDate.split('-').map(Number) as [number, number]
  // Try this month first
  const clampedDay = Math.min(paymentDay, daysInMonth(y, m))
  const thisMonthDate = `${y}-${String(m).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
  if (thisMonthDate > startDate) return thisMonthDate
  // Otherwise next month
  return nextPaymentDate(thisMonthDate, paymentDay)
}

function nextPaymentDate(fromDate: string, paymentDay: number): string {
  const nextMonthDate = addMonths(fromDate, 1)
  const [y, m] = nextMonthDate.split('-').map(Number) as [number, number]
  const day = Math.min(paymentDay, daysInMonth(y, m))
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Calculate outstanding principal from the schedule on or after a given date. */
export function outstandingAsOf(schedule: AmortizationRow[], asOfDate: string): number {
  // Find the last row whose due date has passed
  for (let i = schedule.length - 1; i >= 0; i--) {
    const row = schedule[i]!
    if (row.dueDate <= asOfDate) {
      return row.outstandingMinor
    }
  }
  return schedule[0]?.outstandingMinor ?? 0
}
