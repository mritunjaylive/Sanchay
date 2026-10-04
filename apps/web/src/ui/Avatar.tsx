import { useState } from 'react'
import { User } from 'lucide-react'
import { cn } from '../lib/cn'

export interface AvatarProps {
  src?: string | null
  name?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number
  className?: string
  alt?: string
}

const SIZE_MAP = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm font-semibold',
  lg: 'w-12 h-12 text-base font-semibold',
  xl: 'w-14 h-14 text-lg font-bold',
}

function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return ''
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return (parts[0]?.slice(0, 2) ?? '').toUpperCase()
  }
  return (((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase())
}

export function Avatar({ src, name, size = 'md', className, alt }: AvatarProps) {
  const [imageError, setImageError] = useState(false)
  const initials = getInitials(name)
  const sizeClasses = typeof size === 'string' ? SIZE_MAP[size] : ''
  const inlineStyle =
    typeof size === 'number'
      ? { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }
      : undefined

  return (
    <div
      style={inlineStyle}
      className={cn(
        'relative inline-flex items-center justify-center shrink-0 rounded-full select-none overflow-hidden',
        'bg-gradient-to-tr from-primary to-emerald-400 text-white shadow-sm ring-1 ring-primary/30',
        sizeClasses,
        className,
      )}
      title={name || alt || undefined}
    >
      {src && !imageError ? (
        <img
          src={src}
          alt={alt || name || 'User avatar'}
          onError={() => setImageError(true)}
          className="w-full h-full object-cover"
        />
      ) : initials ? (
        <span className="font-bold tracking-wider">{initials}</span>
      ) : (
        <User className="w-1/2 h-1/2 opacity-90" />
      )}
    </div>
  )
}
