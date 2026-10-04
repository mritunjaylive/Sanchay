/**
 * features/auth/hooks/useAppLock.ts — Local PIN application lock.
 *
 * Implements:
 * - Local storage of PBKDF2-salted PIN in `db.kv` (v2, never synced)
 * - Automatic migration from legacy v1 SHA-256 hashes
 * - Escalating lockout delays on consecutive failed attempts persisted in `db.kv`
 * - Visibility change auto-lock detection
 *
 * @see Sanchay_spec.md section 12.10, F-073
 */

import { useState, useEffect, useCallback } from 'react'
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

const PIN_CONFIG_KEY = 'app_lock_pin_config'
const LOCKOUT_STATE_KEY = 'app_lock_attempt_state'

export function useAppLock() {
  const [hasPin, setHasPin] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Load config and persistent lockout state on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const [pinEntry, lockoutEntry] = await Promise.all([
          db.kv.get(PIN_CONFIG_KEY),
          db.kv.get(LOCKOUT_STATE_KEY),
        ])

        if (pinEntry?.value) {
          setHasPin(true)
          setIsLocked(true) // Lock on app start if PIN is configured
        }

        if (lockoutEntry?.value) {
          const state = lockoutEntry.value as LockoutState
          setFailedAttempts(state.failedAttempts || 0)
          if (state.lockoutUntil && state.lockoutUntil > Date.now()) {
            setLockoutUntil(state.lockoutUntil)
          } else if (state.lockoutUntil && state.lockoutUntil <= Date.now()) {
            // Lockout period has elapsed
            setLockoutUntil(null)
          }
        }
      } catch (err) {
        console.error('Failed to load app lock config:', err)
      } finally {
        setIsReady(true)
      }
    }
    void loadConfig()
  }, [])

  // Lock when page becomes hidden
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden' && hasPin) {
        setIsLocked(true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [hasPin])

  const setPin = useCallback(async (pin: string, autoLockMinutes = 5) => {
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
    ])

    setHasPin(true)
    setIsLocked(false)
    setFailedAttempts(0)
    setLockoutUntil(null)
  }, [])

  const removePin = useCallback(async () => {
    await Promise.all([
      db.kv.delete(PIN_CONFIG_KEY),
      db.kv.delete(LOCKOUT_STATE_KEY),
    ])
    setHasPin(false)
    setIsLocked(false)
    setFailedAttempts(0)
    setLockoutUntil(null)
  }, [])

  const verifyAndUnlock = useCallback(
    async (pin: string): Promise<{ success: boolean; lockoutSeconds?: number }> => {
      // Check active lockout
      if (lockoutUntil && Date.now() < lockoutUntil) {
        const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000)
        return { success: false, lockoutSeconds: remaining }
      }

      const entry = await db.kv.get(PIN_CONFIG_KEY)
      if (!entry?.value) {
        setIsLocked(false)
        return { success: true }
      }

      const config = entry.value as StoredPinConfig
      const { isValid, needsMigration } = await verifyPinWithConfig(pin, config)

      if (isValid) {
        // Successful verification
        setIsLocked(false)
        setFailedAttempts(0)
        setLockoutUntil(null)
        await db.kv.delete(LOCKOUT_STATE_KEY)

        // Seamless migration: upgrade legacy v1 hash to PBKDF2 v2
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
        // Failed attempt: update attempt counter and apply escalating delay
        const nextAttempts = failedAttempts + 1
        setFailedAttempts(nextAttempts)

        const lockoutDuration = getLockoutDurationSeconds(nextAttempts)
        const nextLockoutUntil = lockoutDuration > 0 ? Date.now() + lockoutDuration * 1000 : null
        setLockoutUntil(nextLockoutUntil)

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
    [failedAttempts, lockoutUntil],
  )

  return {
    isReady,
    hasPin,
    isLocked,
    failedAttempts,
    lockoutUntil,
    setPin,
    removePin,
    verifyAndUnlock,
    lock: () => setIsLocked(true),
  }
}
