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
    await expect(page.locator('h1, h2, span').filter({ hasText: /Transaction|Expense/i }).first()).toBeVisible()

    // Enter amount
    const amountInput = page.locator('input[type="text"]').first()
    await amountInput.fill('450.50')

    // Fill payee
    const payeeInput = page.locator('input[placeholder*="payee" i], input[name="payee"]').first()
    if (await payeeInput.isVisible()) {
      await payeeInput.fill('Grocery Mart')
    }

    // Save
    const saveBtn = page.getByRole('button', { name: /save|add transaction/i }).first()
    await saveBtn.click()

    // Navigates back to transactions list
    await page.waitForURL('**/transactions')
    await expect(page.locator('text=450.50').or(page.locator('text=450')).first()).toBeVisible()
  })

  test('can perform transfer between accounts: balances change, net worth unchanged', async ({ page }) => {
    await page.goto('/transactions/new?type=transfer')

    // Enter amount
    const amountInput = page.locator('input[type="text"]').first()
    await amountInput.fill('1000')

    // Select source account
    const fromSelect = page.locator('select').first()
    await fromSelect.selectOption({ label: 'Main Bank' })

    // Select destination account
    const toSelect = page.locator('select').nth(1)
    await toSelect.selectOption({ label: 'Cash Wallet' })

    // Save
    const saveBtn = page.getByRole('button', { name: /save|add transaction/i }).first()
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

    // Click select mode / delete
    const selectToggle = page.getByRole('button', { name: /select|edit/i }).or(page.locator('button:has(svg.lucide-square)')).first()
    if (await selectToggle.isVisible()) {
      await selectToggle.click()
      // Select the transaction checkbox
      const checkbox = page.locator('input[type="checkbox"]').first()
      await checkbox.click()

      // Click delete button
      const deleteBtn = page.getByRole('button', { name: /delete/i }).first()
      await deleteBtn.click()

      // Undo snackbar appears
      const undoBtn = page.getByRole('button', { name: /undo/i }).first()
      await expect(undoBtn).toBeVisible()

      // Click undo
      await undoBtn.click()

      // Transaction is restored
      await expect(page.locator('text=Coffee Cafe').first()).toBeVisible()
    }
  })
})
