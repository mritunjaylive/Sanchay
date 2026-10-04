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
    const rulesTab = page.getByRole('button', { name: /rules/i })
    await rulesTab.click()

    // Click new rule button
    const newRuleBtn = page.getByRole('button', { name: /new rule|add rule/i }).first()
    await newRuleBtn.click()

    // Fill rule details (scoped to the modal form; fields are found by label)
    const form = page.locator('form')
    await form.getByLabel('Title / Description').fill('Gym Membership')
    await form.getByLabel('Amount').fill('2000')
    await form.getByLabel('Account').selectOption({ label: 'HDFC Bank' })

    // Save rule
    await form.getByRole('button', { name: 'Save', exact: true }).click()

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
    await form.getByLabel('Loan / Counterparty Name').fill('Personal Loan')
    await form.getByLabel('Principal Amount').fill('100000') // 100,000 INR
    await form.getByLabel('Interest %').fill('12') // 12% annual rate

    await form.getByRole('button', { name: 'Save', exact: true }).click()

    // Loan account created and schedule rendered
    await expect(page.locator('text=Personal Loan').first()).toBeVisible()
    await expect(page.locator('text=Amortization Schedule').first()).toBeVisible()
  })
})
