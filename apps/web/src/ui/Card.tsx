import React from 'react'
import { cn } from '../lib/cn'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outline'
}

export function Card({ className, variant = 'default', children, ...props }: CardProps) {
  const variants = {
    default: 'bg-surface-elevated border border-border shadow-xs',
    elevated: 'bg-surface-elevated border border-border shadow-md',
    outline: 'bg-transparent border border-border',
  }

  return (
    <div className={cn('rounded-xl p-5 transition-shadow', variants[variant], className)} {...props}>
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
    <h3 className={cn('font-semibold text-base text-text', className)} {...props}>
      {children}
    </h3>
  )
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('pt-1', className)} {...props}>{children}</div>
}
