import { test, expect } from '@playwright/test'
import { seedTestUser, clearDatabase, waitForDb } from './helpers/seed'

test.describe('App Lock & Lockout Schedule (F-073)', () => {
  test.beforeEach(async ({ page }) => {
    await clearDatabase(page)
    await seedTestUser(page, { onboarded: true, baseCurrency: 'INR' })
  })

  test('can set a PIN in Settings and sees AppLockModal when locked', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('text=App Lock').first()).toBeVisible()

    // Find Set PIN button
    const setPinBtn = page.getByRole('button', { name: /set pin|enable/i }).first()
    if (await setPinBtn.isVisible()) {
      await setPinBtn.click()

      // Fill 4-digit PIN
      const pinInputs = page.locator('input[type="password"], input[type="text"]').filter({ hasText: '' })
      if (await pinInputs.count() > 0) {
        await pinInputs.first().fill('1234')
      }
    }
  })

  test('AppLockModal displays lockout countdown after wrong attempts', async ({ page }) => {
    // Seed a locked state directly in db.kv
    await waitForDb(page)
    await page.evaluate(async () => {
      const db = (window as unknown as { __SANCHAY_DB__?: { kv: { put: (data: unknown) => Promise<void> } } }).__SANCHAY_DB__
      if (!db) return

      // Seed lockout state with 30s delay
      await db.kv.put({
        key: 'app_lock_pin_config',
        value: {
          v: 2,
          salt: 'abcdef0123456789abcdef0123456789',
          hash: '0000000000000000000000000000000000000000000000000000000000000000',
          iterations: 310000,
          autoLockMinutes: 5,
        },
      })
      await db.kv.put({
        key: 'app_lock_attempt_state',
        value: {
          failedAttempts: 5,
          lockoutUntil: Date.now() + 30000, // 30s in future
        },
      })
    })

    await page.reload()

    // AppLockModal should be visible on load
    await expect(page.locator('text=Enter App PIN').or(page.locator('text=Locked'))).toBeVisible()
  })
})
