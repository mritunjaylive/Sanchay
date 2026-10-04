import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme } from '@sanchay/shared'

interface SettingsState {
  theme: Theme
  accent: string
  locale: string
  baseCurrency: string
  hideBalances: boolean

  setTheme: (theme: Theme) => void
  setAccent: (accent: string) => void
  setHideBalances: (hide: boolean) => void
  setLocale: (locale: string) => void
  setBaseCurrency: (currency: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      accent: 'emerald',
      locale: 'en-IN',
      baseCurrency: 'INR',
      hideBalances: false,

      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setHideBalances: (hideBalances) => set({ hideBalances }),
      setLocale: (locale) => set({ locale }),
      setBaseCurrency: (baseCurrency) => set({ baseCurrency }),
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
      }),
    },
  ),
)
