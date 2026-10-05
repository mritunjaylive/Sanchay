import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme } from '@sanchay/shared'

export type Accent = 'teal' | 'blue' | 'violet' | 'rose' | 'amber' | 'emerald'

interface SettingsState {
  theme: Theme
  accent: Accent
  locale: string
  baseCurrency: string
  hideBalances: boolean
  sidebarCollapsed: boolean

  setTheme: (theme: Theme) => void
  setAccent: (accent: Accent) => void
  setHideBalances: (hide: boolean) => void
  setLocale: (locale: string) => void
  setBaseCurrency: (currency: string) => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      accent: 'teal',
      locale: 'en-IN',
      baseCurrency: 'INR',
      hideBalances: false,
      sidebarCollapsed: false,

      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setHideBalances: (hideBalances) => set({ hideBalances }),
      setLocale: (locale) => set({ locale }),
      setBaseCurrency: (baseCurrency) => set({ baseCurrency }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    {
      name: 'sanchay-settings',
      // Exclude sensitive fields from persistence
      partialize: (state) => ({
        theme: state.theme,
        accent: state.accent,
        locale: state.locale,
        baseCurrency: state.baseCurrency,
        hideBalances: state.hideBalances,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
)
