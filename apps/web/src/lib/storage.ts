/**
 * lib/storage.ts — Storage persistence and quota estimation.
 *
 * Implements F-079:
 * - Requests persistent storage from navigator.storage to prevent browser cache eviction
 * - Estimates quota usage for local IndexedDB and cache storage
 */

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted()
      if (isPersisted) return true
      return await navigator.storage.persist()
    } catch {
      return false
    }
  }
  return false
}

export async function getStorageQuota(): Promise<{ usage: number; quota: number; percent: number } | null> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate()
      const usage = estimate.usage ?? 0
      const quota = estimate.quota ?? 1
      return {
        usage,
        quota,
        percent: Math.min(100, Math.round((usage / quota) * 100)),
      }
    } catch {
      return null
    }
  }
  return null
}
