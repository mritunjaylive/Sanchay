import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import './index.css'
import './i18n/i18n'
import { registerSW } from './pwa/register'
import { requestPersistentStorage } from './lib/storage'

// Register service worker (update-on-user-action strategy)
registerSW()
void requestPersistentStorage()

if (import.meta.env.DEV || typeof window !== 'undefined') {
  import('./db/db').then(({ db }) => {
    ;(window as unknown as { __SANCHAY_DB__: typeof db }).__SANCHAY_DB__ = db
  })
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
