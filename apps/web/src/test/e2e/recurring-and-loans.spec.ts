import { test, expect } from '@playwright/test'
import { seedTestUser, seedAccounts, clearDatabase, TEST_USER_ID } from './helpers/seed'

test.describe('Recurring Rules, Bills & Loans (F-040, F-046)', () => {
  test.beforeEach(async ({ page }) => {
    await clearDatabase(page)
    await seedTestUser(page, { onboarded: true, baseCurrency: 'INR' })
    await seedAccounts(page, [
      { id: 'acc-bank', name: 'HDFC Bank', openingBalanceMinor: 5000000 },
    ])
  })

  test('can create a recurring monthly bill rule', async ({ page }) => {
    await page.goto('/bills')

    // Switch to rules tab
    const rulesTab = page.getByRole('tab', { name: /rules/i })
    await rulesTab.click()

    // Click new rule button
    const newRuleBtn = page.getByRole('button', { name: /new rule|add rule|add recurring/i }).first()
    await newRuleBtn.click()

    // Fill rule details (scoped to the modal form; fields are found by label)
    const form = page.locator('form')
    await form.getByLabel(/title|description/i).fill('Gym Membership')
    await form.getByLabel(/amount/i).fill('2000')
    await form.getByLabel(/account/i).selectOption({ label: 'HDFC Bank' })

    // Save rule
    await form.getByRole('button', { name: /save/i }).click()

    // Assert rule appears in the list
    await expect(page.locator('text=Gym Membership').first()).toBeVisible()
  })

  test('can create a loan and view the amortization schedule', async ({ page }) => {
    await page.goto('/loans')

    // Open new loan modal
    const addLoanBtn = page.getByRole('button', { name: /add loan|new loan/i }).first()
    await addLoanBtn.click()

    // Fill loan form (fields are found by label)
    const form = page.locator('form')
    await form.getByLabel(/loan.*name/i).fill('Personal Loan')
    await form.getByLabel(/principal/i).fill('100000') // 100,000 INR
    await form.getByLabel(/interest/i).fill('12') // 12% annual rate

    await form.getByRole('button', { name: /save|create/i }).click()

    // Loan account created and schedule rendered
    await expect(page.locator('text=Personal Loan').first()).toBeVisible()
    await expect(page.locator('text=Amortization Schedule').first()).toBeVisible()
  })
})
