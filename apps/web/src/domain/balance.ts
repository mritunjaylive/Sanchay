/**
 * domain/balance.ts — Account balance calculations.
 *
 * Pure functions, no side effects. The UI calls these with data from Dexie.
 *
 * @see Sanchay_spec.md section 10.1
 */
import type { Transaction } from '@sanchay/shared'
import type { Account } from '@sanchay/shared'

/**
 * Calculate the current balance of an account.
 *
 * balance = opening_balance + income + incoming transfers (to_amount_minor)
 *           + adjustments(+) - expense - outgoing transfers - adjustments(-)
 *
 * Only non-deleted transactions with occurred_on >= opening_date are included.
 */
export function accountBalance(account: Account, transactions: Transaction[]): number {
  let balance = account.openingBalanceMinor

  for (const tx of transactions) {
    // Skip deleted and pre-opening-date
    if (tx.deletedAt) continue
    if (tx.occurredOn < account.openingDate) continue

    if (tx.accountId === account.id) {
      switch (tx.type) {
        case 'income':
          balance += tx.amountMinor
          break
        case 'expense':
          balance -= tx.amountMinor
          break
        case 'transfer':
          balance -= tx.amountMinor // money leaves this account
          break
        case 'adjustment':
          if (tx.adjustmentSign === '+') balance += tx.amountMinor
          else balance -= tx.amountMinor
          break
        default: {
          // exhaustive check
          const _never: never = tx.type
          console.error('Unknown transaction type:', _never)
        }
      }
    } else if (tx.type === 'transfer' && tx.toAccountId === account.id) {
      // Money arrives at this account
      balance += tx.toAmountMinor ?? tx.amountMinor
    }
  }

  return balance
}

/**
 * Calculate the balance of an account as of a specific date (inclusive).
 * Used for balance history charts.
 */
export function balanceOn(account: Account, transactions: Transaction[], asOfDate: string): number {
  const filtered = transactions.filter((tx) => tx.occurredOn <= asOfDate)
  return accountBalance(account, filtered)
}

/**
 * Calculate net worth: sum of all non-archived, non-excluded account balances
 * converted to base currency using the provided rate function.
 *
 * Returns { assets, liabilities, netWorth } all in base currency minor units.
 */
export function netWorth(
  accounts: Account[],
  allTransactions: Transaction[],
  getBaseAmount: (minor: number, currency: string) => number,
): { assets: number; liabilities: number; netWorth: number } {
  const LIABILITY_KINDS = new Set(['credit_card', 'loan', 'other_liability'])
  let assets = 0
  let liabilities = 0

  for (const account of accounts) {
    if (account.archivedAt) continue
    if (account.excludeFromNetWorth) continue

    const txs = allTransactions.filter(
      (tx) => tx.accountId === account.id || tx.toAccountId === account.id,
    )
    const balance = accountBalance(account, txs)
    const baseBalance = getBaseAmount(balance, account.currency)

    if (LIABILITY_KINDS.has(account.kind)) {
      liabilities += baseBalance
    } else {
      assets += baseBalance
    }
  }

  return { assets, liabilities, netWorth: assets + liabilities }
}
