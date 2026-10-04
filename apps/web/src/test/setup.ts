import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Mock BroadcastChannel if not available
if (typeof BroadcastChannel === 'undefined') {
  class MockBroadcastChannel {
    name: string
    onmessage: ((event: MessageEvent) => void) | null = null
    constructor(name: string) {
      this.name = name
    }
    postMessage() {}
    close() {}
  }
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    value: MockBroadcastChannel,
    writable: true,
  })
}

// Mock navigator.storage
if (!navigator.storage) {
  Object.defineProperty(navigator, 'storage', {
    value: {
      persist: async () => true,
      persisted: async () => true,
      estimate: async () => ({ usage: 1024, quota: 1048576 }),
    },
  })
}
