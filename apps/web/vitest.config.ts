import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/test/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/lib/**', 'src/sync/**'],
      thresholds: {
        lines: 90,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@sanchay/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
})
