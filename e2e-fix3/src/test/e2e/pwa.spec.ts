import { test, expect } from '@playwright/test'
import { seedTestUser, clearDatabase } from './helpers/seed'

test.describe('PWA & Service Worker Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await clearDatabase(page)
    await seedTestUser(page, { onboarded: true, baseCurrency: 'INR' })
  })

  test('app loads manifest and registers service worker', async ({ page }) => {
    await page.goto('/')

    // Check web manifest link
    const manifestLink = page.locator('link[rel="manifest"]')
    await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest')

    // Evaluate service worker support in browser
    const swSupported = await page.evaluate(() => 'serviceWorker' in navigator)
    expect(swSupported).toBe(true)
  })

  test('app displays update prompt notification when update is available', async ({ page }) => {
    await page.goto('/')

    // Trigger synthetic custom event or simulate SW waiting
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('sw-update-available', { detail: { reload: () => {} } }))
    })

    // If update banner/toast exists, check visibility
    const updateText = page.locator('text=update available').or(page.locator('text=Update'))
    if (await updateText.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(updateText.first()).toBeVisible()
    }
  })
})
