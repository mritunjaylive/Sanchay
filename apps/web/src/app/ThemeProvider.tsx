import { useEffect, type ReactNode } from 'react'
import { useSettingsStore, type Accent } from '../features/settings/stores/settingsStore'

interface ThemeProviderProps {
  children: ReactNode
}

const VALID_ACCENTS: Accent[] = ['teal', 'blue', 'violet', 'rose', 'amber', 'emerald']

export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = useSettingsStore((s) => s.theme)
  const accent = useSettingsStore((s) => s.accent)

  useEffect(() => {
    const root = document.documentElement

    // Apply theme class
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.toggle('dark', isDark)
    } else {
      root.classList.toggle('dark', theme === 'dark')
    }

    // Set data-accent on <html> (no longer writes --color-primary or --color-accent inline)
    const validAccent = VALID_ACCENTS.includes(accent as Accent) ? accent : 'teal'
    root.setAttribute('data-accent', validAccent)
  }, [theme, accent])

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle('dark', e.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return <>{children}</>
}
