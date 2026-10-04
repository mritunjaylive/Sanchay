/**
 * DB mapper — converts between snake_case (server/Postgres) and camelCase (local Dexie).
 * All conversions happen ONLY in this module.
 *
 * @see Sanchay_spec.md section 7.1
 */

/** Convert a snake_case key to camelCase. */
function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

/** Convert a camelCase key to snake_case. */
function toSnake(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase()
}

/** Recursively map all keys of an object from snake_case to camelCase. */
export function fromServer(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[toCamel(key)] = value
  }
  return result
}

/** Recursively map all keys of an object from camelCase to snake_case. */
export function toServer(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[toSnake(key)] = value
  }
  return result
}
