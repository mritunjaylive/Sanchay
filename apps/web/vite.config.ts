import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.ts',
      registerType: 'prompt', // never auto-update mid-session
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
      },
      manifest: {
        id: '/',
        name: 'Sanchay',
        short_name: 'Sanchay',
        description: 'Offline-first personal finance manager',
        display: 'standalone',
        start_url: '/?source=pwa',
        scope: '/',
        theme_color: '#10b981',
        background_color: '#000000',
        lang: 'en',
        categories: ['finance'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Add Expense',
            short_name: 'Expense',
            url: '/transactions/new?type=expense',
            icons: [{ src: '/icons/shortcut-expense.png', sizes: '96x96' }],
          },
          {
            name: 'Add Income',
            short_name: 'Income',
            url: '/transactions/new?type=income',
            icons: [{ src: '/icons/shortcut-income.png', sizes: '96x96' }],
          },
          {
            name: 'Reports',
            short_name: 'Reports',
            url: '/reports/summary',
            icons: [{ src: '/icons/shortcut-reports.png', sizes: '96x96' }],
          },
        ],
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@sanchay/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          db: ['dexie', 'dexie-react-hooks'],
        },
      },
    },
  },
})
