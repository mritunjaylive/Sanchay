/**
 * domain/creditCards.ts — Credit card statement, due date, utilization, and amount due logic.
 *
 * Pure functions, no side effects.
 *
 * @see Sanchay_spec.md section 10.7
 */

import type { Account, Transaction } from '@sanchay/shared'
import { accountBalance } from './balance'
import { todayLocal } from './dates'

export interface CreditCardSummary {
  account: Account
  creditLimitMinor: number | null
  currentBalanceMinor: number // negative if owed
  owedMinor: number // absolute value of debt
  availableCreditMinor: number | null
  utilizationPercent: number | null
  lastStatementDate: string | null
  paymentDueDate: string | null
  statementAmountDueMinor: number
}

/**
 * Computes statement date and payment due date for a credit card.
 * Given a reference date (defaults to today), determines the most recent statement date
 * and the corresponding due date.
 */
export function getCardStatementDates(
  account: Account,
  todayStr = todayLocal(),
): { lastStatementDate: string; paymentDueDate: string } | null {
  if (!account.statementDay || !account.dueDay) {
    return null
  }

  const parts = todayStr.split('-').map(Number)
  const currentYear = parts[0] ?? 2026
  const currentMonth = parts[1] ?? 10
  const currentDay = parts[2] ?? 1

  let statementYear = currentYear
  let statementMonth = currentMonth

  // If today is before statementDay, the last statement was last month
  if (currentDay < account.statementDay) {
    statementMonth -= 1
    if (statementMonth === 0) {
      statementMonth = 12
      statementYear -= 1
    }
  }

  // Days in statement month
  const daysInStatementMonth = new Date(statementYear, statementMonth, 0).getDate()
  const clampedStatementDay = Math.min(account.statementDay, daysInStatementMonth)
  const lastStatementDate = `${statementYear}-${String(statementMonth).padStart(2, '0')}-${String(clampedStatementDay).padStart(2, '0')}`

  // Payment is due on dueDay. If dueDay falls after the statement day it is in the SAME month
  // (statement 5th -> due 25th); otherwise it is in the following month (statement 25th -> due 10th).
  let dueYear = statementYear
  let dueMonth = statementMonth
  if (account.dueDay <= account.statementDay) {
    dueMonth += 1
    if (dueMonth === 13) {
      dueMonth = 1
      dueYear += 1
    }
  }

  const daysInDueMonth = new Date(dueYear, dueMonth, 0).getDate()
  const clampedDueDay = Math.min(account.dueDay, daysInDueMonth)
  const paymentDueDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(clampedDueDay).padStart(2, '0')}`

  return { lastStatementDate, paymentDueDate }
}

/**
 * Calculates complete credit card summary: balance, debt owed, utilization %, and amount due.
 */
export function getCreditCardSummary(
  account: Account,
  transactions: Transaction[],
  todayStr = todayLocal(),
): CreditCardSummary {
  const currentBalanceMinor = accountBalance(account, transactions)
  // In our balance convention, liability accounts have negative balance when money is owed
  const owedMinor = currentBalanceMinor < 0 ? Math.abs(currentBalanceMinor) : 0

  const creditLimitMinor = account.creditLimitMinor ?? null
  let availableCreditMinor: number | null = null
  let utilizationPercent: number | null = null

  if (creditLimitMinor && creditLimitMinor > 0) {
    availableCreditMinor = Math.max(0, creditLimitMinor - owedMinor)
    utilizationPercent = Math.min(100, Math.round((owedMinor / creditLimitMinor) * 1000) / 10)
  }

  const dates = getCardStatementDates(account, todayStr)
  let statementAmountDueMinor = owedMinor

  if (dates) {
    // Statement amount due = balance owed at statement date minus payments made after statement date
    const txUpToStatement = transactions.filter(
      (tx) => !tx.deletedAt && tx.occurredOn <= dates.lastStatementDate,
    )
    const balanceAtStatement = accountBalance(account, txUpToStatement)
    const statementOwed = balanceAtStatement < 0 ? Math.abs(balanceAtStatement) : 0

    // Payments after statement date (incoming transfers or adjustment(+))
    const paymentsAfterStatement = transactions
      .filter((tx) => !tx.deletedAt && tx.occurredOn > dates.lastStatementDate)
      .reduce((sum, tx) => {
        if (tx.type === 'transfer' && tx.toAccountId === account.id) {
          return sum + (tx.toAmountMinor ?? tx.amountMinor)
        }
        if (tx.accountId === account.id && tx.type === 'adjustment' && tx.adjustmentSign === '+') {
          return sum + tx.amountMinor
        }
        return sum
      }, 0)

    statementAmountDueMinor = Math.max(0, statementOwed - paymentsAfterStatement)
  }

  return {
    account,
    creditLimitMinor,
    currentBalanceMinor,
    owedMinor,
    availableCreditMinor,
    utilizationPercent,
    lastStatementDate: dates?.lastStatementDate ?? null,
    paymentDueDate: dates?.paymentDueDate ?? null,
    statementAmountDueMinor,
  }
}
