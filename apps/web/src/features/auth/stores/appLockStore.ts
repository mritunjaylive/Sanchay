/**
 * features/auth/stores/appLockStore.ts — Centralized App Lock Store (P1-F).
 *
 * Implements:
 * - Shared Zustand store for app lock across App.tsx, LockModal, and Settings
 * - Configurable autoLockMinutes: 0 (Immediately), 0.5 (30s), 1, 2, 5, 10, 15, 30, 60, 120, -1 (Restart only)
 * - Persisted in db.kv ('app_lock_pin_config')
 * - Escalating lockout protection
 * - Safe duration changes: requires current PIN when increasing duration (less secure)
 * - Timing logic on visibilitychange / pagehide / resume with injectable clock
 */

import { create } from 'zustand'
import { db } from '../../../db/db'
import {
  hashPin,
  generateSalt,
  verifyPinWithConfig,
  getLockoutDurationSeconds,
  PBKDF2_ITERATIONS,
  type StoredPinConfig,
  type StoredPinV2,
  type LockoutState,
} from '../../../lib/crypto'

export const PIN_CONFIG_KEY = 'app_lock_pin_config'
export const LOCKOUT_STATE_KEY = 'app_lock_attempt_state'
export const LAST_HIDDEN_KEY = 'app_lock_last_hidden_at'

export const AUTO_LOCK_OPTIONS: Array<{ value: number; labelKey: string; defaultLabel: string; isHighRisk?: boolean }> = [
  { value: 0, labelKey: 'settings.lockImmediately', defaultLabel: 'Immediately' },
  { value: 0.5, labelKey: 'settings.lock30Seconds', defaultLabel: '30 seconds' },
  { value: 1, labelKey: 'settings.lock1Minute', defaultLabel: '1 minute' },
  { value: 2, labelKey: 'settings.lock2Minutes', defaultLabel: '2 minutes' },
  { value: 5, labelKey: 'settings.lock5Minutes', defaultLabel: '5 minutes (default)' },
  { value: 10, labelKey: 'settings.lock10Minutes', defaultLabel: '10 minutes' },
  { value: 15, labelKey: 'settings.lock15Minutes', defaultLabel: '15 minutes' },
  { value: 30, labelKey: 'settings.lock30Minutes', defaultLabel: '30 minutes', isHighRisk: true },
  { value: 60, labelKey: 'settings.lock1Hour', defaultLabel: '1 hour', isHighRisk: true },
  { value: 120, labelKey: 'settings.lock2Hours', defaultLabel: '2 hours', isHighRisk: true },
  { value: -1, labelKey: 'settings.lockOnRestart', defaultLabel: 'Only when app restarts', isHighRisk: true },
]

export interface AppLockState {
  hasPin: boolean
  isLocked: boolean
  autoLockMinutes: number
  failedAttempts: number
  lockoutUntil: number | null
  isReady: boolean

  // Actions
  init: (clock?: () => number) => Promise<void>
  setPin: (pin: string, autoLockMinutes?: number) => Promise<void>
  updateAutoLockMinutes: (
    newMinutes: number,
    currentPinForVerification?: string,
  ) => Promise<{ success: boolean; error?: string }>
  removePin: (currentPinForVerification?: string) => Promise<{ success: boolean; error?: string }>
  verifyAndUnlock: (pin: string) => Promise<{ success: boolean; lockoutSeconds?: number }>
  lock: () => void
  handleVisibilityChange: (hidden: boolean, clock?: () => number) => Promise<void>
}

let _initialized = false

export const useAppLockStore = create<AppLockState>((set, get) => ({
  hasPin: false,
  isLocked: false,
  autoLockMinutes: 5,
  failedAttempts: 0,
  lockoutUntil: null,
  isReady: false,

  init: async (clock = Date.now) => {
    try {
      const [pinEntry, lockoutEntry] = await Promise.all([
        db.kv.get(PIN_CONFIG_KEY),
        db.kv.get(LOCKOUT_STATE_KEY),
      ])

      const now = clock()

      if (pinEntry?.value) {
        const config = pinEntry.value as StoredPinConfig
        const autoLockMinutes = config.autoLockMinutes ?? 5
        set({
          hasPin: true,
          isLocked: true, // Always lock on cold start if PIN is configured
          autoLockMinutes,
        })
      } else {
        set({ hasPin: false, isLocked: false })
      }

      if (lockoutEntry?.value) {
        const state = lockoutEntry.value as LockoutState
        set({ failedAttempts: state.failedAttempts || 0 })
        if (state.lockoutUntil && state.lockoutUntil > now) {
          set({ lockoutUntil: state.lockoutUntil })
        } else {
          set({ lockoutUntil: null })
        }
      }

      // Register global lifecycle listeners once
      if (!_initialized && typeof window !== 'undefined') {
        _initialized = true

        const onHidden = () => {
          void get().handleVisibilityChange(true)
        }
        const onVisible = () => {
          void get().handleVisibilityChange(false)
        }

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            onHidden()
          } else if (document.visibilityState === 'visible') {
            onVisible()
          }
        })

        window.addEventListener('pagehide', onHidden)
        window.addEventListener('freeze', onHidden)
      }
    } catch (err) {
      console.error('Failed to initialize appLockStore:', err)
    } finally {
      set({ isReady: true })
    }
  },

  handleVisibilityChange: async (hidden: boolean, clock = Date.now) => {
    const { hasPin, isLocked, autoLockMinutes } = get()
    if (!hasPin) return

    const now = clock()

    if (hidden) {
      // Save last hidden timestamp
      await db.kv.put({ key: LAST_HIDDEN_KEY, value: now })
      if (autoLockMinutes === 0) {
        set({ isLocked: true })
      }
    } else {
      // App became visible
      if (isLocked) return

      if (autoLockMinutes === -1) {
        // -1 means lock on app cold start only, never on background resume
        return
      }

      const lastHiddenEntry = await db.kv.get(LAST_HIDDEN_KEY)
      const lastHiddenAt = (lastHiddenEntry?.value as number | undefined) ?? null

      if (!lastHiddenAt) {
        set({ isLocked: true })
        return
      }

      const elapsedMs = now - lastHiddenAt
      const thresholdMs = autoLockMinutes * 60_000

      if (elapsedMs >= thresholdMs) {
        set({ isLocked: true })
      }
    }
  },

  setPin: async (pin: string, autoLockMinutes = 5) => {
    const salt = generateSalt()
    const hash = await hashPin(pin, salt, PBKDF2_ITERATIONS)
    const config: StoredPinV2 = {
      v: 2,
      iterations: PBKDF2_ITERATIONS,
      salt,
      hash,
      autoLockMinutes,
    }

    await Promise.all([
      db.kv.put({ key: PIN_CONFIG_KEY, value: config }),
      db.kv.delete(LOCKOUT_STATE_KEY),
      db.kv.delete(LAST_HIDDEN_KEY),
    ])

    set({
      hasPin: true,
      isLocked: false,
      autoLockMinutes,
      failedAttempts: 0,
      lockoutUntil: null,
    })
  },

  updateAutoLockMinutes: async (newMinutes: number, currentPinForVerification?: string) => {
    const { autoLockMinutes } = get()
    const entry = await db.kv.get(PIN_CONFIG_KEY)
    if (!entry?.value) {
      return { success: false, error: 'no_pin_set' }
    }

    const config = entry.value as StoredPinConfig

    // If increasing duration or setting to -1 (less secure), require verification
    const isIncreasing =
      (newMinutes === -1 && autoLockMinutes !== -1) ||
      (newMinutes !== -1 && autoLockMinutes !== -1 && newMinutes > autoLockMinutes)

    if (isIncreasing) {
      if (!currentPinForVerification) {
        return { success: false, error: 'pin_required' }
      }
      const { isValid } = await verifyPinWithConfig(currentPinForVerification, config)
      if (!isValid) {
        return { success: false, error: 'invalid_pin' }
      }
    }

    const updatedConfig: StoredPinConfig = {
      ...config,
      autoLockMinutes: newMinutes,
    }

    await db.kv.put({ key: PIN_CONFIG_KEY, value: updatedConfig })
    set({ autoLockMinutes: newMinutes })
    return { success: true }
  },

  removePin: async (currentPinForVerification?: string) => {
    const entry = await db.kv.get(PIN_CONFIG_KEY)
    if (entry?.value && currentPinForVerification) {
      const config = entry.value as StoredPinConfig
      const { isValid } = await verifyPinWithConfig(currentPinForVerification, config)
      if (!isValid) {
        return { success: false, error: 'invalid_pin' }
      }
    }

    await Promise.all([
      db.kv.delete(PIN_CONFIG_KEY),
      db.kv.delete(LOCKOUT_STATE_KEY),
      db.kv.delete(LAST_HIDDEN_KEY),
    ])

    set({
      hasPin: false,
      isLocked: false,
      autoLockMinutes: 5,
      failedAttempts: 0,
      lockoutUntil: null,
    })

    return { success: true }
  },

  verifyAndUnlock: async (pin: string) => {
    const { lockoutUntil, failedAttempts } = get()
    const now = Date.now()

    if (lockoutUntil && now < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - now) / 1000)
      return { success: false, lockoutSeconds: remaining }
    }

    const entry = await db.kv.get(PIN_CONFIG_KEY)
    if (!entry?.value) {
      set({ isLocked: false })
      return { success: true }
    }

    const config = entry.value as StoredPinConfig
    const { isValid, needsMigration } = await verifyPinWithConfig(pin, config)

    if (isValid) {
      set({
        isLocked: false,
        failedAttempts: 0,
        lockoutUntil: null,
      })
      await Promise.all([
        db.kv.delete(LOCKOUT_STATE_KEY),
        db.kv.delete(LAST_HIDDEN_KEY),
      ])

      // Upgrade legacy v1 hash to PBKDF2 v2 seamlessly if needed
      if (needsMigration) {
        const newSalt = generateSalt()
        const newHash = await hashPin(pin, newSalt, PBKDF2_ITERATIONS)
        const upgradedConfig: StoredPinV2 = {
          v: 2,
          iterations: PBKDF2_ITERATIONS,
          salt: newSalt,
          hash: newHash,
          autoLockMinutes: config.autoLockMinutes ?? 5,
        }
        await db.kv.put({ key: PIN_CONFIG_KEY, value: upgradedConfig })
      }

      return { success: true }
    } else {
      const nextAttempts = failedAttempts + 1
      const lockoutDuration = getLockoutDurationSeconds(nextAttempts)
      const nextLockoutUntil = lockoutDuration > 0 ? now + lockoutDuration * 1000 : null

      set({
        failedAttempts: nextAttempts,
        lockoutUntil: nextLockoutUntil,
      })

      await db.kv.put({
        key: LOCKOUT_STATE_KEY,
        value: {
          failedAttempts: nextAttempts,
          lockoutUntil: nextLockoutUntil,
        },
      })

      return { success: false, lockoutSeconds: lockoutDuration }
    }
  },

  lock: () => set({ isLocked: true }),
}))
