import type { Page } from '@playwright/test'
import type { Account, Profile, Transaction, Budget, RecurringRule } from '@sanchay/shared'

export const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Seeds an authenticated and optionally onboarded session in localStorage and Dexie.
 */
export async function seedTestUser(
  page: Page,
  options: { onboarded?: boolean; baseCurrency?: string } = {},
) {
  const { onboarded = true, baseCurrency = 'INR' } = options

  // 1. First navigate to page or origin so localStorage and IndexedDB are accessible
  await page.goto('/')

  await page.evaluate(
    ({ userId, onboarded, baseCurrency }) => {
      const mockSession = {
        access_token: 'offline_token',
        token_type: 'bearer',
        expires_in: 999999999,
        refresh_token: 'offline_refresh',
        user: {
          id: userId,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'offline@sanchay.local',
          email_confirmed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          app_metadata: { provider: 'email' },
          user_metadata: { display_name: 'Demo User' },
        },
      }

      localStorage.setItem('sanchay_offline_session', JSON.stringify(mockSession))

      const profile: Profile = {
        id: userId,
        userId,
        displayName: 'Demo User',
        baseCurrency,
        locale: 'en-IN',
        timeZone: 'Asia/Kolkata',
        weekStart: 1,
        monthStartDay: 1,
        theme: 'system',
        accent: 'emerald',
        defaultAccountId: null,
        hideBalances: false,
        notificationPrefs: null,
        onboardedAt: onboarded ? new Date().toISOString() : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        serverSeq: 1,
        version: 1,
      }

      // If __SANCHAY_DB__ is ready, put into Dexie
      const anyWindow = window as unknown as { __SANCHAY_DB__?: { profiles: { put: (p: Profile) => Promise<void> } } }
      if (anyWindow.__SANCHAY_DB__) {
        return anyWindow.__SANCHAY_DB__.profiles.put(profile)
      }
      return Promise.resolve()
    },
    { userId: TEST_USER_ID, onboarded, baseCurrency },
  )

  await page.reload()
}

/**
 * Seeds accounts into the local database.
 */
export async function seedAccounts(
  page: Page,
  accounts: Array<Partial<Account> & { name: string; currency?: string; openingBalanceMinor?: number }>,
) {
  return page.evaluate(
    ({ accs, userId }) => {
      const anyWindow = window as unknown as { __SANCHAY_DB__?: { accounts: { bulkPut: (items: unknown[]) => Promise<void> } } }
      if (!anyWindow.__SANCHAY_DB__) return

      const formatted = accs.map((a, i) => ({
        id: a.id || `acc-${i + 1}`,
        userId,
        name: a.name,
        kind: a.kind || 'bank',
        currency: a.currency || 'INR',
        openingBalanceMinor: a.openingBalanceMinor ?? 0,
        openingDate: a.openingDate || '2026-01-01',
        creditLimitMinor: a.creditLimitMinor ?? null,
        statementDay: a.statementDay ?? null,
        dueDay: a.dueDay ?? null,
        note: a.note ?? null,
        excludeFromNetWorth: a.excludeFromNetWorth ?? false,
        icon: 'Landmark',
        color: '#10b981',
        sortOrder: i,
        archivedAt: a.archivedAt ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        serverSeq: 1,
        version: 1,
      }))

      return anyWindow.__SANCHAY_DB__.accounts.bulkPut(formatted)
    },
    { accs: accounts, userId: TEST_USER_ID },
  )
}

/**
 * Seeds transactions into the local database.
 */
export async function seedTransactions(
  page: Page,
  transactions: Array<Partial<Transaction> & { accountId: string; amountMinor: number; type: 'income' | 'expense' | 'transfer' }>,
) {
  return page.evaluate(
    ({ txs, userId }) => {
      const anyWindow = window as unknown as { __SANCHAY_DB__?: { transactions: { bulkPut: (items: unknown[]) => Promise<void> } } }
      if (!anyWindow.__SANCHAY_DB__) return

      const formatted = txs.map((t, i) => ({
        id: t.id || `tx-${i + 1}`,
        userId,
        type: t.type,
        accountId: t.accountId,
        toAccountId: t.toAccountId ?? null,
        amountMinor: t.amountMinor,
        toAmountMinor: t.toAmountMinor ?? null,
        baseAmountMinor: t.baseAmountMinor ?? t.amountMinor,
        fxRate: t.fxRate ?? '1',
        occurredOn: t.occurredOn || new Date().toISOString().substring(0, 10),
        occurredTime: t.occurredTime ?? null,
        categoryId: t.categoryId ?? null,
        payee: t.payee ?? null,
        note: t.note ?? null,
        source: t.source || 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        serverSeq: 1,
        version: 1,
      }))

      return anyWindow.__SANCHAY_DB__.transactions.bulkPut(formatted)
    },
    { txs: transactions, userId: TEST_USER_ID },
  )
}

/**
 * Clears all tables in the database.
 */
export async function clearDatabase(page: Page) {
  try {
    if (page.url() === 'about:blank') {
      await page.goto('/')
    }
    await page.evaluate(async () => {
      try {
        localStorage.clear()
      } catch {
        // ignore storage security errors
      }
      const anyWindow = window as unknown as {
        __SANCHAY_DB__?: {
          transaction: (mode: string, tables: unknown[], fn: () => Promise<void>) => Promise<void>
          accounts: { clear: () => Promise<void> }
          categories: { clear: () => Promise<void> }
          transactions: { clear: () => Promise<void> }
          budgets: { clear: () => Promise<void> }
          recurringRules: { clear: () => Promise<void> }
          loanTerms: { clear: () => Promise<void> }
          profiles: { clear: () => Promise<void> }
          kv: { clear: () => Promise<void> }
        }
      }
      if (anyWindow.__SANCHAY_DB__) {
        const d = anyWindow.__SANCHAY_DB__
        await d.accounts.clear()
        await d.categories.clear()
        await d.transactions.clear()
        await d.budgets.clear()
        await d.recurringRules.clear()
        await d.loanTerms.clear()
        await d.profiles.clear()
        await d.kv.clear()
      }
    })
  } catch {
    // ignore navigation/context destroyed errors during setup
  }
}
