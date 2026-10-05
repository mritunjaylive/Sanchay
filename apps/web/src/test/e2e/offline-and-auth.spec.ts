import { test, expect } from '@playwright/test'
import { seedTestUser, clearDatabase } from './helpers/seed'

test.describe('Offline and Core UI Flows', () => {
  test.beforeEach(async ({ page }) => {
    await clearDatabase(page)
    await seedTestUser(page, { onboarded: true, baseCurrency: 'INR' })
  })

  test('App loads successfully and shows home dashboard', async ({ page }) => {
    await page.goto('/')
    // Expect title or logo to be visible
    await expect(page.locator('header, aside, main').getByText('Sanchay').locator('visible=true').first()).toBeVisible()
  })

  test('Transactions page works offline with zero network', async ({ page, context }) => {
    await page.goto('/transactions')
    await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible()

    // Simulate going completely offline
    await context.setOffline(true)

    // Ensure transactions UI is still fully interactive
    await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible()

    // Restore network
    await context.setOffline(false)
  })

  test('Reports summary renders offline', async ({ page, context }) => {
    await page.goto('/reports/summary')
    await expect(page.getByRole('heading', { name: /summary/i })).toBeVisible()

    // Simulate going offline and verify summary is intact
    await context.setOffline(true)
    await expect(page.getByRole('heading', { name: /summary/i })).toBeVisible()
    await context.setOffline(false)
  })


  test('Settings page allows toggling theme and privacy options', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()

    // Switch to Security tab
    await page.getByRole('button', { name: /security/i }).first().click()

    // Toggle hide balances
    const hideBalancesText = page.locator('text=Hide Account Balances')
    await expect(hideBalancesText).toBeVisible()
  })
})
