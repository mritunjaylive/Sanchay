import React from 'react'
import { cn } from '../lib/cn'

export interface SegmentOption<T extends string = string> {
  value: T
  label: React.ReactNode
  icon?: React.ReactNode
  tone?: 'primary' | 'expense' | 'income' | 'neutral'
}

export interface SegmentedControlProps<T extends string = string> {
  value: T
  onChange: (value: T) => void
  options: SegmentOption<T>[]
  size?: 'sm' | 'md'
  fullWidth?: boolean
  className?: string
}

export function SegmentedControl<T extends string = string>({
  value,
  onChange,
  options,
  size = 'md',
  fullWidth = true,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex p-1 bg-surface-overlay/80 border border-border/80 rounded-xl select-none',
        fullWidth && 'w-full grid',
        fullWidth && options.length === 2 && 'grid-cols-2',
        fullWidth && options.length === 3 && 'grid-cols-3',
        fullWidth && options.length === 4 && 'grid-cols-4',
        fullWidth && options.length === 5 && 'grid-cols-5',
        className,
      )}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value

        let activeToneClass = 'bg-surface-elevated text-text shadow-sm border border-border/40 font-semibold'
        if (opt.tone === 'income') {
          activeToneClass = 'bg-income/10 text-income border border-income/30 font-semibold shadow-xs'
        } else if (opt.tone === 'expense') {
          activeToneClass = 'bg-surface-elevated text-text border border-border font-semibold shadow-xs'
        } else if (opt.tone === 'primary') {
          activeToneClass = 'bg-primary text-primary-foreground font-semibold shadow-xs'
        }

        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-all duration-150',
              size === 'sm' ? 'py-1 px-2.5 min-h-[32px]' : 'py-1.5 px-3 min-h-[40px]',
              isSelected
                ? activeToneClass
                : 'text-text-muted hover:text-text hover:bg-surface/50 border border-transparent',
            )}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span className="truncate">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
