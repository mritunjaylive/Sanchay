import { cn } from '../lib/cn'

export interface ProgressBarProps {
  value: number // 0 to 100+
  max?: number | undefined
  tone?: 'auto' | 'primary' | 'gold' | 'warning' | 'danger' | undefined
  size?: 'xs' | 'sm' | 'md' | 'lg' | undefined
  className?: string | undefined
  showLabel?: boolean | undefined
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'auto',
  size = 'md',
  className,
}: ProgressBarProps) {
  const percentage = Math.max(0, (value / max) * 100)
  const clampedWidth = Math.min(100, percentage)

  let barColorClass = 'bg-primary'
  if (tone === 'auto') {
    if (percentage > 100) barColorClass = 'bg-danger'
    else if (percentage >= 75) barColorClass = 'bg-warning'
    else barColorClass = 'bg-primary'
  } else if (tone === 'gold') {
    barColorClass = 'bg-gold'
  } else if (tone === 'warning') {
    barColorClass = 'bg-warning'
  } else if (tone === 'danger') {
    barColorClass = 'bg-danger'
  }

  const heightClasses = {
    xs: 'h-1.5',
    sm: 'h-2',
    md: 'h-2.5',
    lg: 'h-3.5',
  }

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(percentage)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'w-full bg-surface-overlay rounded-full overflow-hidden',
        heightClasses[size],
        className,
      )}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-300 ease-out', barColorClass)}
        style={{ width: `${clampedWidth}%` }}
      />
    </div>
  )
}
