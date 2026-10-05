import React from 'react'
import { cn } from '../lib/cn'

export interface ProgressRingProps {
  value: number // 0 to 100
  size?: number
  strokeWidth?: number
  tone?: 'gold' | 'primary' | 'success' | 'warning' | 'danger'
  children?: React.ReactNode
  className?: string
}

export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 6,
  tone = 'primary',
  children,
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, value))
  const strokeDashoffset = circumference - (clamped / 100) * circumference

  const toneStrokeMap = {
    gold: 'text-gold',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  }

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rotate-[-90deg] transition-all"
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="stroke-surface-overlay fill-none"
        />
        {/* Progress indicator */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={cn(
            'fill-none stroke-current transition-all duration-500 ease-out',
            toneStrokeMap[tone],
          )}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center text-center">
          {children}
        </div>
      )}
    </div>
  )
}
