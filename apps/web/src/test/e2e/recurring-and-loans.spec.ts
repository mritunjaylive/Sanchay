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

    // Fill rule details
    const titleInput = page.locator('input[placeholder*="title" i], input[placeholder*="netflix" i]').first()
    await titleInput.fill('Gym Membership')

    const amountInput = page.locator('input[placeholder*="0.00" i], input[type="text"]').nth(1)
    await amountInput.fill('2000')

    // Select account
    const accSelect = page.locator('select').first()
    await accSelect.selectOption({ label: 'HDFC Bank' })

    // Save rule
    const saveBtn = page.getByRole('button', { name: /create rule|save/i }).first()
    await saveBtn.click()

    // Assert rule appears in the list
    await expect(page.locator('text=Gym Membership').first()).toBeVisible()
  })

  test('can create a loan and view the amortization schedule', async ({ page }) => {
    await page.goto('/loans')

    // Open new loan modal
    const addLoanBtn = page.getByRole('button', { name: /add loan|new loan/i }).first()
    await addLoanBtn.click()

    // Fill loan form
    const loanNameInput = page.locator('input[placeholder*="car loan" i], input[type="text"]').first()
    await loanNameInput.fill('Personal Loan')

    const principalInput = page.locator('input[placeholder*="principal" i], input[type="text"]').nth(1)
    await principalInput.fill('100000') // 100,000 INR

    const rateInput = page.locator('input[placeholder*="8.5" i], input[type="text"]').nth(2)
    await rateInput.fill('12') // 12% annual rate

    const createLoanBtn = page.getByRole('button', { name: /create loan|save/i }).first()
    await createLoanBtn.click()

    // Loan account created and schedule rendered
    await expect(page.locator('text=Personal Loan').first()).toBeVisible()
    await expect(page.locator('text=Amortization Schedule').first()).toBeVisible()
  })
})
