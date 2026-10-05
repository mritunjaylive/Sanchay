import { useSettingsStore } from '../features/settings/stores/settingsStore'
import { formatMoney } from '../lib/money'
import { cn } from '../lib/cn'

export type AmountTone = 'income' | 'expense' | 'neutral' | 'danger' | 'muted'
export type AmountSize = 'display' | 'lg' | 'md' | 'sm' | 'xs'

export interface AmountProps {
  minor: number
  currency?: string | undefined
  tone?: AmountTone | undefined
  size?: AmountSize | undefined
  showSign?: boolean | undefined
  className?: string | undefined
  hideable?: boolean | undefined
}

const SIZE_MAP: Record<AmountSize, string> = {
  display: 'text-display tracking-tight font-extrabold',
  lg: 'text-2xl sm:text-3xl font-bold tracking-tight',
  md: 'text-base sm:text-lg font-semibold',
  sm: 'text-sm font-medium',
  xs: 'text-xs font-medium',
}

const TONE_MAP: Record<AmountTone, string> = {
  income: 'text-income',
  expense: 'text-text',
  neutral: 'text-text',
  danger: 'text-danger font-semibold',
  muted: 'text-text-muted',
}

export function Amount({
  minor,
  currency,
  tone = 'neutral',
  size = 'md',
  showSign = false,
  className,
  hideable = true,
}: AmountProps) {
  const { hideBalances, baseCurrency, locale } = useSettingsStore()

  if (hideable && hideBalances) {
    return (
      <span
        className={cn(
          'font-mono tracking-widest select-none',
          SIZE_MAP[size],
          TONE_MAP[tone],
          className,
        )}
        aria-label="Hidden Balance"
      >
        ••••••
      </span>
    )
  }

  const activeCurrency = currency || baseCurrency
  const formatted = formatMoney(Math.abs(minor), activeCurrency, locale)

  let prefix = ''
  if (showSign) {
    if (minor > 0 && tone === 'income') prefix = '+'
    else if (minor < 0) prefix = '-'
  }

  return (
    <span
      className={cn(
        'font-variant-numeric:tabular-nums whitespace-nowrap',
        SIZE_MAP[size],
        TONE_MAP[tone],
        className,
      )}
    >
      {prefix}
      {formatted}
    </span>
  )
}
