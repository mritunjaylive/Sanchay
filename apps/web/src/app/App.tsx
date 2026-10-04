import { useEffect } from 'react'
import { AppRouter } from './router'
import { ThemeProvider } from './ThemeProvider'
import { useAuthStore } from '../features/auth/stores/authStore'
import { useAppLock } from '../features/auth/hooks/useAppLock'
import { AppLockModal } from '../features/auth/components/AppLockModal'
import { PWAUpdateToast } from '../ui/PWAUpdateToast'
import { ToastContainer } from '../ui/Toast'
import { syncEngine } from '../features/sync/services/syncEngine'

export default function App() {
  const initialize = useAuthStore((s) => s.initialize)
  const { isLocked, verifyAndUnlock, hasPin } = useAppLock()

  useEffect(() => {
    void initialize()
    syncEngine.init()
  }, [initialize])

  return (
    <ThemeProvider>
      <AppRouter />
      <PWAUpdateToast />
      <ToastContainer />
      {hasPin && (
        <AppLockModal isOpen={isLocked} onUnlock={verifyAndUnlock} />
      )}
    </ThemeProvider>
  )
}


