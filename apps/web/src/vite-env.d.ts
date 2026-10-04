/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'workbox-precaching' {
  export function precacheAndRoute(entries: unknown): void
  export function cleanupOutdatedCaches(): void
}

declare module 'workbox-routing' {
  export class NavigationRoute {
    constructor(handler: (options: { request: Request }) => Promise<Response>, options?: unknown)
  }
  export function registerRoute(
    capture: unknown,
    handler?: unknown,
    method?: string,
  ): void
}

declare module 'workbox-strategies' {
  export class CacheFirst {
    constructor(options?: { cacheName?: string; plugins?: unknown[] })
  }
  export class StaleWhileRevalidate {
    constructor(options?: { cacheName?: string; plugins?: unknown[] })
  }
}

declare module 'workbox-expiration' {
  export class ExpirationPlugin {
    constructor(options: { maxEntries?: number; maxAgeSeconds?: number; purgeOnQuotaError?: boolean })
  }
}

interface ServiceWorkerGlobalScope {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>
}
