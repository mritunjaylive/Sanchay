import { useEffect, useState, useRef } from 'react'
import { cn } from '../lib/cn'

export interface AnimatedNumberProps {
  value: number
  durationMs?: number | undefined
  formatFn?: ((val: number) => string) | undefined
  className?: string | undefined
}

export function AnimatedNumber({
  value,
  durationMs = 500,
  formatFn,
  className,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const prevValueRef = useRef(value)

  useEffect(() => {
    // Respect user's reduced motion preference
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplayValue(value)
      prevValueRef.current = value
      return
    }

    const startValue = prevValueRef.current
    const endValue = value
    if (startValue === endValue) return

    const startTime = performance.now()
    let animationFrameId: number

    const step = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / durationMs)
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(startValue + (endValue - startValue) * easeProgress)

      setDisplayValue(current)

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step)
      } else {
        setDisplayValue(endValue)
        prevValueRef.current = endValue
      }
    }

    animationFrameId = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(animationFrameId)
      prevValueRef.current = endValue
    }
  }, [value, durationMs])

  return (
    <span className={cn('tabular-nums font-mono', className)}>
      {formatFn ? formatFn(displayValue) : displayValue.toLocaleString()}
    </span>
  )
}
