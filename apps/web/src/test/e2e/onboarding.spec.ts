import { test, expect } from '@playwright/test'
import { clearDatabase, seedTestUser } from './helpers/seed'

test.describe('Onboarding Flow (F-010 to F-014)', () => {
  test.beforeEach(async ({ page }) => {
    await clearDatabase(page)
  })

  test('non-onboarded user is redirected to /onboarding and can complete steps', async ({ page }) => {
    // Surface app-side failures (handleFinish swallows errors with console.error)
    const problems: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

    // Seed authenticated session but NOT onboarded
    await seedTestUser(page, { onboarded: false, baseCurrency: 'INR' })

    await page.goto('/')
    await page.waitForURL('**/onboarding')
    await expect(page.locator('h1, h2').filter({ hasText: /welcome|get started|sanchay/i }).first()).toBeVisible()

    // Step 1: Language & Currency -> Click Continue
    const continueBtn = page.getByRole('button', { name: /continue|next/i }).first()
    await continueBtn.click()

    // Step 2: Account setup
    await page.getByLabel('Account Name').fill('My Bank Account')

    const step2Continue = page.getByRole('button', { name: /continue|next/i }).first()
    await step2Continue.click()

    // Step 3: Finish onboarding
    const finishBtn = page.getByRole('button', { name: /start using sanchay/i }).first()
    await finishBtn.click()

    // Redirected to home dashboard
    await expect(page).toHaveURL(/\/$/, { timeout: 15000 })
    expect(problems, 'unexpected console errors').toEqual([])
    await expect(page.locator('header, aside, main').getByText('Sanchay').locator('visible=true').first()).toBeVisible()
  })
})
