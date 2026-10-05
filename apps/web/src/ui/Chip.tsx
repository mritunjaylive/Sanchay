import React from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/cn'

export interface ChipProps {
  label: React.ReactNode
  selected?: boolean | undefined
  onClick?: (() => void) | undefined
  onRemove?: (() => void) | undefined
  icon?: React.ReactNode | undefined
  count?: number | undefined
  className?: string | undefined
  disabled?: boolean | undefined
}

export function Chip({
  label,
  selected = false,
  onClick,
  onRemove,
  icon,
  count,
  className,
  disabled = false,
}: ChipProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
        'border transition-all duration-150 select-none min-h-[36px]',
        selected
          ? 'bg-primary/10 border-primary text-primary font-semibold shadow-xs'
          : 'bg-surface-elevated border-border text-text hover:bg-surface-overlay hover:border-border/80',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{label}</span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-tight',
            selected
              ? 'bg-primary text-primary-foreground'
              : 'bg-surface-overlay text-text-muted',
          )}
        >
          {count}
        </span>
      )}
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation()
              onRemove()
            }
          }}
          className="p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors ml-0.5"
          aria-label="Remove filter"
        >
          <X size={12} />
        </span>
      )}
    </button>
  )
}
