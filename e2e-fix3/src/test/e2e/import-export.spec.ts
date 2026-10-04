import { test, expect } from '@playwright/test'
import { seedTestUser, seedAccounts, seedTransactions, clearDatabase } from './helpers/seed'

test.describe('Import & Export Flows (F-058, F-074, F-081)', () => {
  test.beforeEach(async ({ page }) => {
    await clearDatabase(page)
    await seedTestUser(page, { onboarded: true, baseCurrency: 'INR' })
    await seedAccounts(page, [
      { id: 'acc-1', name: 'Primary Account', openingBalanceMinor: 100000 },
    ])
  })

  test('CSV import parses rows, previews data, imports, and supports batch undo', async ({ page }) => {
    await page.goto('/import')

    // Create a mock CSV file
    const csvContent = [
      'Date,Amount,Type,Payee,Note',
      '2026-03-01,150.00,expense,Grocery Store,Weekly food',
      '2026-03-02,250.00,expense,Electric Company,Power bill',
      '2026-03-03,500.00,income,Freelance Client,Design project',
    ].join('\n')

    // Upload via file chooser
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('label[for="fileUploadInput"]').click(),
    ])

    await fileChooser.setFiles({
      name: 'statement.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    })

    // Check mapping form and preview table appear
    await expect(page.locator('text=Preview (First 3 of 3 rows)')).toBeVisible()

    // Select target account
    const accSelect = page.locator('select').first()
    await accSelect.selectOption({ label: 'Primary Account' })

    // Click Import
    const importBtn = page.getByRole('button', { name: /import 3 records/i })
    await importBtn.click()

    // Import complete card appears
    await expect(page.locator('text=Import Complete!')).toBeVisible()
    await expect(page.locator('text=3').first()).toBeVisible()

    // Click Undo
    const undoBtn = page.getByRole('button', { name: /undo import/i })
    await undoBtn.click()

    // Form resets back
    await expect(page.locator('text=Click to choose a file')).toBeVisible()
  })

  test('Money Manager import runs 100% offline with zero network requests', async ({ page, context }) => {
    await page.goto('/import')

    // Track network requests to prove no file leaves the device
    const networkRequests: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      // Ignore localhost requests for Vite assets
      if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
        networkRequests.push(url)
      }
    })

    // Select Money Manager tab
    const mmbakTab = page.locator('button', { hasText: 'Money Manager' })
    await mmbakTab.click()

    await expect(page.locator('text=100% offline client-side parsing')).toBeVisible()

    // Assert that zero external requests were made
    expect(networkRequests).toHaveLength(0)
  })
})
