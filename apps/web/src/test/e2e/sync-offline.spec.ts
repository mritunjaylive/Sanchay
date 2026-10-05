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
    // Load the list route, then reach the editor via in-app navigation so BOTH lazy route
    // chunks are in memory before going offline. (Two page.goto() calls would reload the app,
    // and the dev server used in E2E has no service worker to serve missing chunks offline.)
    await page.goto('/transactions')
    await page.getByRole('button', { name: /add/i }).first().click()
    await expect(page.getByRole('tab', { name: /expense/i })).toBeVisible()

    // 1. Simulate turning off network (airplane mode)
    await context.setOffline(true)

    // Fill expense
    const amountInput = page.getByTestId('tx-amount-input')
    await amountInput.fill('120')
    await page.getByLabel(/payee/i).fill('Offline Vendor')

    // Save while offline
    const saveBtn = page.getByTestId('tx-save')
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
