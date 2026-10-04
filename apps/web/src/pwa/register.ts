import { registerSW as vitePWARegister } from 'virtual:pwa-register'

let updateSW: (() => Promise<void>) | undefined

/**
 * Register the service worker with user-action update flow.
 * Never force-reloads mid-session.
 */
export function registerSW(): void {
  try {
    updateSW = vitePWARegister({
      onNeedRefresh() {
        window.dispatchEvent(new CustomEvent('sw:update-available'))
      },
      onOfflineReady() {
        window.dispatchEvent(new CustomEvent('sw:offline-ready'))
      },
      onRegistered(r) {
        if (r) {
          setInterval(
            () => {
              void r.update()
            },
            60 * 60 * 1000,
          )
        }
      },
    })
  } catch (err) {
    console.warn('Service worker registration deferred:', err)
  }
}

/** Call when user taps "Update" in the update toast */
export async function applyUpdate(): Promise<void> {
  await updateSW?.()
}
