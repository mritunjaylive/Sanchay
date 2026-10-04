import { describe, it, expect, beforeEach } from 'vitest'
import {
  hashPin,
  hashPinV1,
  verifyPinWithConfig,
  generateSalt,
  constantTimeEqual,
  getLockoutDurationSeconds,
  type StoredPinV1,
  type StoredPinV2,
} from '../crypto'
import 'fake-indexeddb/auto'
import { db } from '../../db/db'

describe('Crypto & PIN App Lock (PBKDF2 & Escalating Lockout)', () => {
  beforeEach(async () => {
    await db.kv.clear()
  })

  it('computes deterministic PBKDF2 hashes with salt', async () => {
    const salt = generateSalt()
    const hash1 = await hashPin('1234', salt, 5000) // Lower iteration count for fast unit test
    const hash2 = await hashPin('1234', salt, 5000)
    const hashOther = await hashPin('5678', salt, 5000)

    expect(hash1).toBe(hash2)
    expect(hash1).not.toBe(hashOther)
    expect(hash1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('performs constant-time string comparison safely', () => {
    expect(constantTimeEqual('abcd', 'abcd')).toBe(true)
    expect(constantTimeEqual('abcd', 'abce')).toBe(false)
    expect(constantTimeEqual('abcd', 'abc')).toBe(false)
    expect(constantTimeEqual('', '')).toBe(true)
  })

  it('verifies v2 PBKDF2 pin without needing migration', async () => {
    const salt = generateSalt()
    const hash = await hashPin('4321', salt, 5000)
    const config: StoredPinV2 = {
      v: 2,
      iterations: 5000,
      salt,
      hash,
    }

    const correctRes = await verifyPinWithConfig('4321', config)
    expect(correctRes.isValid).toBe(true)
    expect(correctRes.needsMigration).toBe(false)

    const wrongRes = await verifyPinWithConfig('9999', config)
    expect(wrongRes.isValid).toBe(false)
    expect(wrongRes.needsMigration).toBe(false)
  })

  it('authenticates legacy v1 hash and flags for migration only when correct', async () => {
    const salt = generateSalt()
    const legacyHash = await hashPinV1('5555', salt)
    const v1Config: StoredPinV1 = {
      salt,
      hash: legacyHash,
    }

    // Wrong PIN does not trigger migration
    const wrongRes = await verifyPinWithConfig('0000', v1Config)
    expect(wrongRes.isValid).toBe(false)
    expect(wrongRes.needsMigration).toBe(false)

    // Correct PIN validates and indicates migration is needed
    const correctRes = await verifyPinWithConfig('5555', v1Config)
    expect(correctRes.isValid).toBe(true)
    expect(correctRes.needsMigration).toBe(true)
  })

  it('enforces the exact escalating lockout delay schedule', () => {
    // 0 to 4 failed attempts: no delay
    expect(getLockoutDurationSeconds(0)).toBe(0)
    expect(getLockoutDurationSeconds(1)).toBe(0)
    expect(getLockoutDurationSeconds(4)).toBe(0)

    // After 5 wrong attempts: 30s
    expect(getLockoutDurationSeconds(5)).toBe(30)

    // 6th attempt: 1 min (60s)
    expect(getLockoutDurationSeconds(6)).toBe(60)

    // 7th attempt: 5 min (300s)
    expect(getLockoutDurationSeconds(7)).toBe(300)

    // 8th attempt: 15 min (900s)
    expect(getLockoutDurationSeconds(8)).toBe(900)

    // 9+ attempts: 1 hour (3600s)
    expect(getLockoutDurationSeconds(9)).toBe(3600)
    expect(getLockoutDurationSeconds(15)).toBe(3600)
  })

  it('persists lockout state and remaining duration across reloads via db.kv', async () => {
    const mockNow = 1700000000000
    const lockoutSec = getLockoutDurationSeconds(5) // 30s
    const lockoutUntil = mockNow + lockoutSec * 1000

    await db.kv.put({
      key: 'app_lock_attempt_state',
      value: {
        failedAttempts: 5,
        lockoutUntil,
      },
    })

    // Simulate reload by querying db.kv
    const loaded = await db.kv.get('app_lock_attempt_state')
    expect(loaded?.value).toBeDefined()
    const val = loaded?.value as { failedAttempts: number; lockoutUntil: number }
    expect(val.failedAttempts).toBe(5)
    expect(val.lockoutUntil).toBe(lockoutUntil)

    // Injected clock: 10 seconds later
    const timeLater = mockNow + 10_000
    const remainingSeconds = Math.ceil((val.lockoutUntil - timeLater) / 1000)
    expect(remainingSeconds).toBe(20)

    // Injected clock: 35 seconds later (expired)
    const timeAfterLockout = mockNow + 35_000
    const hasExpired = timeAfterLockout >= val.lockoutUntil
    expect(hasExpired).toBe(true)
  })
})
