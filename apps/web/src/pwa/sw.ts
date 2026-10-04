/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope

// ── Precache app shell (injected by vite-plugin-pwa) ──
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// ── Navigation fallback (SPA) ──
registerRoute(
  new NavigationRoute(
    async (options: { request: Request }) => {
      const cache = await caches.open('sanchay-shell')
      const matched = await cache.match('/index.html')
      return matched ?? fetch(options.request)
    },
  ),
)

// ── Runtime cache: receipt images (CacheFirst, bounded) ──
registerRoute(
  ({ url }: { url: URL }) => url.pathname.includes('/receipts/'),
  new CacheFirst({
    cacheName: 'sanchay-receipts',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  }),
)

// ── Never cache Supabase API/RPC responses ──
registerRoute(
  ({ url }: { url: URL }) => url.hostname.includes('supabase'),
  async ({ request }: { request: Request }) => fetch(request),
)

// ── Push notification handler ──
self.addEventListener('push', (event) => {
  if (!event.data) return

  const payload = event.data.json() as {
    title: string
    body: string
    url?: string
    tag?: string
  }

  const notificationOptions: NotificationOptions = {
    body: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { url: payload.url ?? '/' },
  }

  if (payload.tag) {
    notificationOptions.tag = payload.tag
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions),
  )
})

// ── Notification click — focus or open the right route ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url: string }).url

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(self.location.origin))
        if (existing) {
          void existing.focus()
          void existing.navigate(url)
        } else {
          void self.clients.openWindow(url)
        }
      }),
  )
})

// ── Skip waiting when told to (user-initiated update) ──
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string }).type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})
