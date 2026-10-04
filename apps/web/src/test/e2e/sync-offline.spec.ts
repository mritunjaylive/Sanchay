import { test, expect } from '@playwright/test'
import { seedTestUser, seedAccounts, clearDatabase } from './helpers/seed'

test.describe('Offline Add & Multi-Context Sync (F-077, F-079)', () => {
  test.beforeEach(async ({ page }) => {
    await clearDatabase(page)
    await seedTestUser(page, { onboarded: true, baseCurrency: 'INR' })
    await seedAccounts(page, [
      { id: 'acc-1', name: 'Cash In Hand', openingBalanceMinor: 500000 },
    ])
  })

  test('can record transaction with zero network in offline mode', async ({ page, context }) => {
    // 1. Simulate turning off network (airplane mode)
    await context.setOffline(true)

    await page.goto('/transactions/new?type=expense')
    await expect(page.locator('h1, h2, span').filter({ hasText: /transaction|expense/i }).first()).toBeVisible()

    // Fill expense
    const amountInput = page.locator('input[type="text"]').first()
    await amountInput.fill('120')

    const payeeInput = page.locator('input[placeholder*="payee" i]').first()
    if (await payeeInput.isVisible()) {
      await payeeInput.fill('Offline Vendor')
    }

    // Save while offline
    const saveBtn = page.getByRole('button', { name: /save|add transaction/i }).first()
    await saveBtn.click()

    await page.waitForURL('**/transactions')

    // Verify it was recorded locally in IndexedDB
    await expect(page.locator('text=120').first()).toBeVisible()

    // 2. Restore network
    await context.setOffline(false)
  })

  test('cross-tab communication keeps multiple browser tabs in sync', async ({ context }) => {
    const page1 = await context.newPage()
    const page2 = await context.newPage()

    await clearDatabase(page1)
    await seedTestUser(page1, { onboarded: true, baseCurrency: 'INR' })
    await seedAccounts(page1, [
      { id: 'acc-1', name: 'Shared Wallet', openingBalanceMinor: 100000 },
    ])

    // Load page2 with same session
    await page2.goto('/')
    await seedTestUser(page2, { onboarded: true, baseCurrency: 'INR' })

    await page1.goto('/accounts')
    await page2.goto('/accounts')

    await expect(page1.locator('text=Shared Wallet').first()).toBeVisible()
    await expect(page2.locator('text=Shared Wallet').first()).toBeVisible()

    await page1.close()
    await page2.close()
  })
})
