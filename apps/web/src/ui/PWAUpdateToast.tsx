import { useEffect, useState } from 'react'
import { applyUpdate } from '../pwa/register'

/**
 * PWA update toast — shown when a new service worker is waiting.
 * Never force-reloads mid-edit. User must tap to update.
 */
export function PWAUpdateToast() {
  const [showUpdate, setShowUpdate] = useState(false)
  const [showOfflineReady, setShowOfflineReady] = useState(false)

  useEffect(() => {
    const handleUpdate = () => setShowUpdate(true)
    const handleOffline = () => {
      setShowOfflineReady(true)
      setTimeout(() => setShowOfflineReady(false), 4000)
    }

    window.addEventListener('sw:update-available', handleUpdate)
    window.addEventListener('sw:offline-ready', handleOffline)
    return () => {
      window.removeEventListener('sw:update-available', handleUpdate)
      window.removeEventListener('sw:offline-ready', handleOffline)
    }
  }, [])

  if (!showUpdate && !showOfflineReady) return null

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-slide-up"
    >
      {showUpdate && (
        <div className="glass-card p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Update available</p>
            <p className="text-text-muted text-xs mt-0.5">A new version of Sanchay is ready.</p>
          </div>
          <button
            onClick={() => void applyUpdate()}
            className="bg-primary text-primary-foreground text-sm font-medium px-3 py-1.5 rounded-lg shrink-0 hover:opacity-90 transition-opacity"
          >
            Update
          </button>
        </div>
      )}
      {showOfflineReady && (
        <div className="glass-card p-4">
          <p className="font-medium text-sm">Ready to work offline ✓</p>
        </div>
      )}
    </div>
  )
}
