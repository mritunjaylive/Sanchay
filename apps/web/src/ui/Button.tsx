import React from 'react'
import { cn } from '../lib/cn'
import { LoadingSpinner } from './LoadingSpinner'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none min-h-[44px] select-none'

    const variants = {
      primary:
        'bg-primary text-primary-foreground hover:brightness-105 active:brightness-95 shadow-xs font-semibold',
      secondary:
        'bg-surface-elevated text-text hover:bg-surface-overlay border border-border/80 shadow-xs font-medium',
      outline:
        'border border-border/80 bg-transparent text-text hover:bg-surface-overlay font-medium',
      ghost:
        'bg-transparent text-text hover:bg-surface-overlay font-medium',
      danger:
        'bg-danger text-danger-foreground hover:brightness-110 shadow-xs font-semibold',
      gold:
        'bg-gradient-to-b from-gold to-[hsl(43_96%_42%)] text-gold-foreground hover:brightness-105 shadow-xs font-semibold',
    }

    const sizes = {
      sm: 'text-xs px-3 py-1.5 gap-1.5 min-h-[36px]',
      md: 'text-sm px-4 py-2 gap-2 min-h-[44px]',
      lg: 'text-base px-6 py-3 gap-2.5 min-h-[52px]',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && <LoadingSpinner size="sm" />}
        {!isLoading && leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
        {children}
        {!isLoading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
      </button>
    )
  },
)

Button.displayName = 'Button'
