/**
 * lib/ids.ts — ID generation utilities.
 *
 * UUIDv7: time-ordered, client-generated primary keys (good for IndexedDB and Postgres).
 * UUIDv5: deterministic IDs for recurring occurrence transactions.
 *
 * @see Sanchay_spec.md section 7.1, 10.5
 */

// ── UUIDv7 ─────────────────────────────────────────────────────────────────

/**
 * Generate a UUIDv7 (time-ordered).
 * Format: 48-bit ms timestamp | 4-bit version (7) | 12-bit random | 2-bit variant | 62-bit random
 */
export function uuidv7(): string {
  const now = Date.now()

  // 48-bit timestamp (ms)
  const tsHi = Math.floor(now / 0x1_0000) // top 32 bits
  const tsLo = now & 0xffff              // bottom 16 bits

  // Random bytes
  const rand = crypto.getRandomValues(new Uint8Array(10))

  // Set version (7) and variant (10xx)
  rand[0] = ((rand[0]! & 0x0f) | 0x70)
  rand[2] = ((rand[2]! & 0x3f) | 0x80)

  const hex = [
    hex32(tsHi),
    hex16(tsLo),
    hex8(rand[0]!),
    hex8(rand[1]!),
    hex8(rand[2]!),
    hex8(rand[3]!),
    hex8(rand[4]!),
    hex8(rand[5]!),
    hex8(rand[6]!),
    hex8(rand[7]!),
    hex8(rand[8]!),
    hex8(rand[9]!),
  ]

  return `${hex[0]}${hex[1]}-${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}${hex[10]}${hex[11]}`
}

// ── UUIDv5 (SHA-1 namespace) ───────────────────────────────────────────────

const NAMESPACE_OID = '6ba7b812-9dad-11d1-80b4-00c04fd430c8'

/**
 * Generate a deterministic UUIDv5 from a namespace UUID + name string.
 * Used to generate stable IDs for recurring occurrences:
 *   id = uuidv5(ruleId + ':' + occurrenceDate)
 * Two devices generating the same occurrence therefore produce the same row ID.
 *
 * @see Sanchay_spec.md section 10.5
 */
export async function uuidv5(name: string, namespace = NAMESPACE_OID): Promise<string> {
  const nsBytes = uuidToBytes(namespace)
  const nameBytes = new TextEncoder().encode(name)

  const combined = new Uint8Array(nsBytes.length + nameBytes.length)
  combined.set(nsBytes)
  combined.set(nameBytes, nsBytes.length)

  const hashBuffer = await crypto.subtle.digest('SHA-1', combined)
  const hash = new Uint8Array(hashBuffer)

  // Set version (5) and variant (10xx)
  hash[6] = ((hash[6]! & 0x0f) | 0x50)
  hash[8] = ((hash[8]! & 0x3f) | 0x80)

  return [
    bytesToHex(hash.slice(0, 4)),
    bytesToHex(hash.slice(4, 6)),
    bytesToHex(hash.slice(6, 8)),
    bytesToHex(hash.slice(8, 10)),
    bytesToHex(hash.slice(10, 16)),
  ].join('-')
}

/** Deterministic ID for a recurring occurrence (synchronous via cached hash). */
export async function recurringOccurrenceId(ruleId: string, occurrenceDate: string): Promise<string> {
  return uuidv5(`${ruleId}:${occurrenceDate}`)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function hex8(n: number): string { return n.toString(16).padStart(2, '0') }
function hex16(n: number): string { return n.toString(16).padStart(4, '0') }
function hex32(n: number): string { return n.toString(16).padStart(8, '0') }

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
