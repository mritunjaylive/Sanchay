import React from 'react'
import { cn } from '../lib/cn'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'hero' | 'interactive' | 'outline' | 'elevated'
}

export function Card({ className, variant = 'default', children, ...props }: CardProps) {
  const variants = {
    default: 'bg-surface-elevated border border-border/70 rounded-2xl shadow-xs',
    hero: 'bg-gradient-to-br from-surface-elevated via-surface-elevated to-primary/5 border border-primary/20 rounded-3xl shadow-sm',
    interactive:
      'bg-surface-elevated border border-border/70 rounded-2xl shadow-xs hover:-translate-y-0.5 hover:shadow-md hover:border-border transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary',
    outline: 'bg-transparent border border-border/80 rounded-2xl',
    elevated: 'bg-surface-elevated border border-border/80 rounded-2xl shadow-md',
  }

  return (
    <div
      className={cn(
        'p-4 sm:p-5 transition-all',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between pb-3 mb-2 border-b border-border/50', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('font-bold text-base text-text tracking-tight', className)} {...props}>
      {children}
    </h3>
  )
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('pt-1', className)} {...props}>{children}</div>
}
