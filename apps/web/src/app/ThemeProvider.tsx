import { useEffect, type ReactNode } from 'react'
import { useSettingsStore } from '../features/settings/stores/settingsStore'

interface ThemeProviderProps {
  children: ReactNode
}

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

    // Apply accent CSS variable
    const color = accentColors[accent] ?? accentColors['emerald'] ?? '160 84% 39%'
    root.style.setProperty('--color-accent', color)
    root.style.setProperty('--color-primary', color)
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

const accentColors: Record<string, string> = {
  emerald: '160 84% 39%',
  blue: '217 91% 60%',
  violet: '250 89% 62%',
  rose: '347 77% 50%',
  amber: '43 96% 56%',
  teal: '173 80% 36%',
}
