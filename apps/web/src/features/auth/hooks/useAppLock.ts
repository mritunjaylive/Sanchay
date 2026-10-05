/**
 * features/auth/hooks/useAppLock.ts — Local PIN application lock hook.
 * Bridges to centralized useAppLockStore (P1-F).
 *
 * @see Sanchay_spec.md section 12.10, F-073
 */

import { useEffect } from 'react'
import { useAppLockStore } from '../stores/appLockStore'

export function useAppLock() {
  const store = useAppLockStore()

  useEffect(() => {
    if (!store.isReady) {
      void store.init()
    }
  }, [store.isReady, store.init])

  return {
    isReady: store.isReady,
    hasPin: store.hasPin,
    isLocked: store.isLocked,
    autoLockMinutes: store.autoLockMinutes,
    failedAttempts: store.failedAttempts,
    lockoutUntil: store.lockoutUntil,
    setPin: store.setPin,
    updateAutoLockMinutes: store.updateAutoLockMinutes,
    removePin: store.removePin,
    verifyAndUnlock: store.verifyAndUnlock,
    lock: store.lock,
  }
}
