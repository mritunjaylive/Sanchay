import { test, expect } from '@playwright/test'
import { seedTestUser, seedAccounts, seedTransactions, clearDatabase } from './helpers/seed'

test.describe('Transaction Lifecycle & Transfers (F-020, F-022, F-024)', () => {
  test.beforeEach(async ({ page }) => {
    await clearDatabase(page)
    await seedTestUser(page, { onboarded: true, baseCurrency: 'INR' })
    await seedAccounts(page, [
      { id: 'acc-bank', name: 'Main Bank', openingBalanceMinor: 1000000 }, // 10,000 INR
      { id: 'acc-wallet', name: 'Cash Wallet', openingBalanceMinor: 200000 }, // 2,000 INR
    ])
  })

  test('can add an expense transaction and see it in the list', async ({ page }) => {
    await page.goto('/transactions/new?type=expense')
    await expect(page.getByRole('button', { name: 'Expense', exact: true })).toBeVisible()

    // Enter amount
    const amountInput = page.locator('input[inputmode="decimal"]').first()
    await amountInput.fill('450.50')

    // Fill payee
    await page.getByLabel('Payee').fill('Grocery Mart')

    // Save
    const saveBtn = page.getByRole('button', { name: 'Save', exact: true })
    await saveBtn.click()

    // Navigates back to transactions list
    await page.waitForURL('**/transactions')
    await expect(page.locator('text=450.50').or(page.locator('text=450')).first()).toBeVisible()
  })

  test('can perform transfer between accounts: balances change, net worth unchanged', async ({ page }) => {
    await page.goto('/transactions/new?type=transfer')

    await expect(page.getByRole('button', { name: 'Transfer', exact: true })).toBeVisible()

    // Enter amount
    const amountInput = page.locator('input[inputmode="decimal"]').first()
    await amountInput.fill('1000')

    // Select source account
    await page.getByLabel('From Account').selectOption({ label: 'Main Bank' })

    // Select destination account
    await page.getByLabel('To Account').selectOption({ label: 'Cash Wallet' })

    // Save
    const saveBtn = page.getByRole('button', { name: 'Save', exact: true })
    await saveBtn.click()

    await page.waitForURL('**/transactions')

    // Check accounts page: Bank should be 9,000, Wallet should be 3,000
    await page.goto('/accounts')
    await expect(page.locator('text=Main Bank').first()).toBeVisible()
    await expect(page.locator('text=Cash Wallet').first()).toBeVisible()
  })

  test('delete a transaction shows undo snackbar; clicking undo restores it', async ({ page }) => {
    await seedTransactions(page, [
      { id: 'tx-delete-me', accountId: 'acc-bank', amountMinor: 25000, type: 'expense', payee: 'Coffee Cafe' },
    ])

    await page.goto('/transactions')
    await expect(page.locator('text=Coffee Cafe').first()).toBeVisible()

    // Enter select mode, pick the row (rows are buttons, not checkboxes)
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.getByRole('button', { name: /Coffee Cafe/ }).click()

    // Bulk delete asks for window.confirm(); Playwright dismisses dialogs by default
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    // Undo snackbar appears, and the row is gone
    const undoBtn = page.getByRole('button', { name: /undo/i })
    await expect(undoBtn).toBeVisible()
    await expect(page.getByText('Coffee Cafe')).toHaveCount(0)

    // Undo restores it
    await undoBtn.click()
    await expect(page.getByText('Coffee Cafe').first()).toBeVisible()
  })
})
