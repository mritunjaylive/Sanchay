import { test, expect } from '@playwright/test'
import { seedTestUser, seedAccounts, clearDatabase, waitForDb, TEST_USER_ID } from './helpers/seed'

test.describe('Budget Threshold Alert on Entry (F-039)', () => {
  test.beforeEach(async ({ page }) => {
    await clearDatabase(page)
    await seedTestUser(page, { onboarded: true, baseCurrency: 'INR' })
    await seedAccounts(page, [
      { id: 'acc-1', name: 'Main Checking', openingBalanceMinor: 5000000 },
    ])

    // Seed category and budget in local DB
    await waitForDb(page)
    await page.evaluate(({ userId }) => {
      const db = (window as unknown as {
        __SANCHAY_DB__?: {
          categories: { put: (data: unknown) => Promise<void> }
          budgets: { put: (data: unknown) => Promise<void> }
        }
      }).__SANCHAY_DB__
      if (!db) return

      const category = {
        id: 'cat-dining',
        userId,
        name: 'Food & Dining',
        kind: 'expense',
        parentId: null,
        icon: 'Utensils',
        color: '#ef4444',
        sortOrder: 0,
        archivedAt: null,
        systemKey: 'food_dining',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        serverSeq: 1,
        version: 1,
      }

      // Budget of 10,000 INR (1,000,000 minor) with 80% threshold
      const budget = {
        id: 'b-dining',
        userId,
        categoryId: 'cat-dining',
        amountMinor: 1000000,
        effectiveFrom: '2026-01',
        rolloverEnabled: false,
        alertThresholds: [80, 100],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        serverSeq: 1,
        version: 1,
      }

      return Promise.all([
        db.categories.put(category),
        db.budgets.put(budget),
      ])
    }, { userId: TEST_USER_ID })
  })

  test('entering an expense that crosses 80% threshold shows non-blocking warning', async ({ page }) => {
    await page.goto('/transactions/new?type=expense')

    // Select Food & Dining category
    const catSelect = page.locator('select').filter({ hasText: /Food|Dining|Select/i }).first()
    if (await catSelect.isVisible()) {
      await catSelect.selectOption({ label: 'Food & Dining' })
    }

    // Enter 8,500 INR (crosses 80% of 10,000 INR budget)
    const amountInput = page.locator('input[type="text"]').first()
    await amountInput.fill('8500')

    // The budget threshold warning appears
    const warning = page.locator('text=budget limit').or(page.locator('text=80%'))
    await expect(warning.first()).toBeVisible()
  })
})
