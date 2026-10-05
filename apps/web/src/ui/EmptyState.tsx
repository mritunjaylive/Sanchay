import React from 'react'
import { Button } from './Button'
import { cn } from '../lib/cn'

export interface EmptyStateProps {
  icon?: React.ReactNode | undefined
  title: string
  description?: string | undefined
  actionLabel?: string | undefined
  onAction?: (() => void) | undefined
  actionIcon?: React.ReactNode | undefined
  className?: string | undefined
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl',
        'border border-dashed border-border/80 bg-surface-elevated/40',
        className,
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 shadow-xs">
        {icon ? (
          icon
        ) : (
          <svg
            className="w-7 h-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 14h6" />
            <path d="M12 9v6" />
          </svg>
        )}
      </div>

      <h3 className="text-base sm:text-lg font-bold text-text">{title}</h3>
      {description && (
        <p className="text-xs sm:text-sm text-text-muted max-w-sm mt-1 mb-5 leading-relaxed">
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <Button
          variant="primary"
          size="sm"
          onClick={onAction}
          leftIcon={actionIcon}
          className="shadow-sm"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
