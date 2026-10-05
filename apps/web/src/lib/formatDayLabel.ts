import i18n from '../i18n/i18n'

/**
 * Formats a calendar date string (YYYY-MM-DD) into a friendly label:
 * "Today", "Yesterday", or formatted like "Mon, 5 Oct" based on current locale.
 */
export function formatDayLabel(dateStr: string, customLocale?: string): string {
  if (!dateStr) return ''

  const today = new Date()
  const todayStr = today.toISOString().substring(0, 10)

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().substring(0, 10)

  const currentLang = customLocale || i18n.resolvedLanguage || i18n.language || 'en'
  const isHindi = currentLang.startsWith('hi')

  if (dateStr === todayStr) {
    return isHindi ? 'आज' : 'Today'
  }

  if (dateStr === yesterdayStr) {
    return isHindi ? 'कल' : 'Yesterday'
  }

  // Parse YYYY-MM-DD safely into local date
  const parts = dateStr.split('-')
  const year = parseInt(parts[0] ?? '2026', 10)
  const month = parseInt(parts[1] ?? '1', 10) - 1
  const day = parseInt(parts[2] ?? '1', 10)
  const dateObj = new Date(year, month, day)

  try {
    const formatter = new Intl.DateTimeFormat(isHindi ? 'hi-IN' : 'en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    return formatter.format(dateObj)
  } catch {
    return dateStr
  }
}
