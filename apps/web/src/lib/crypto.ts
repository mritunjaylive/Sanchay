/**
 * lib/crypto.ts — Cryptographic utilities for local PIN authentication.
 *
 * Implements:
 * - PBKDF2-HMAC-SHA-256 hashing via native Web Crypto API (310,000 iterations)
 * - Constant-time hash comparison
 * - Automatic migration path from legacy SHA-256 (v1) to PBKDF2 (v2)
 * - Escalating lockout delay schedule
 *
 * @see Sanchay_spec.md section 12.10, F-073
 */

export const PBKDF2_ITERATIONS = 310_000
export const SALT_BYTES = 16
export const HASH_BYTES = 32

export interface StoredPinV1 {
  salt: string
  hash: string
  autoLockMinutes?: number
  v?: never
}

export interface StoredPinV2 {
  v: 2
  iterations: number
  salt: string
  hash: string
  autoLockMinutes?: number
}

export type StoredPinConfig = StoredPinV1 | StoredPinV2

export interface LockoutState {
  failedAttempts: number
  lockoutUntil: number | null
}

/**
 * Generates a random cryptographic salt (hex string).
 */
export function generateSalt(length = SALT_BYTES): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return bytesToHex(array)
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

/**
 * Computes PBKDF2-HMAC-SHA-256 hash of a PIN string (v2).
 */
export async function hashPin(
  pin: string,
  saltHex: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )

  const saltBytes = hexToBytes(saltHex)
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_BYTES * 8,
  )

  return bytesToHex(new Uint8Array(derivedBits))
}

/**
 * Legacy v1 salted single SHA-256 hash calculation (for migration).
 */
export async function hashPinV1(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${salt}:${pin}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(hashBuffer))
}

/**
 * Verifies PIN and returns whether it matches, plus whether migration to v2 is needed.
 */
export async function verifyPinWithConfig(
  pin: string,
  config: StoredPinConfig,
): Promise<{ isValid: boolean; needsMigration: boolean }> {
  if (config.v === 2) {
    const computedHash = await hashPin(pin, config.salt, config.iterations)
    return {
      isValid: constantTimeEqual(computedHash, config.hash),
      needsMigration: false,
    }
  }

  // Legacy v1
  const computedHash = await hashPinV1(pin, config.salt)
  const isValid = constantTimeEqual(computedHash, config.hash)
  return {
    isValid,
    needsMigration: isValid, // only migrate if PIN was correct
  }
}

/**
 * Backward compatible verifyPin helper.
 */
export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  const computed = await hashPin(pin, salt)
  return constantTimeEqual(computed, expectedHash)
}

/**
 * Returns escalating lockout delay in seconds according to attempt count:
 * - 1 to 4 attempts: 0s
 * - 5 attempts: 30s
 * - 6 attempts: 60s (1 min)
 * - 7 attempts: 300s (5 min)
 * - 8 attempts: 900s (15 min)
 * - 9+ attempts: 3600s (1 hour)
 */
export function getLockoutDurationSeconds(failedAttempts: number): number {
  if (failedAttempts < 5) return 0
  if (failedAttempts === 5) return 30
  if (failedAttempts === 6) return 60
  if (failedAttempts === 7) return 300
  if (failedAttempts === 8) return 900
  return 3600
}
