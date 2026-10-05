import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '../lib/cn'

export type PageWidth = 'narrow' | 'default' | 'wide'

export interface PageProps {
  width?: PageWidth | undefined
  children: React.ReactNode
  className?: string | undefined
  id?: string | undefined
}

const WIDTH_MAP: Record<PageWidth, string> = {
  narrow: 'max-w-2xl',
  default: 'max-w-5xl',
  wide: 'max-w-6xl',
}

export function Page({ width = 'default', children, className, id }: PageProps) {
  return (
    <div
      id={id}
      className={cn(
        'mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 md:py-8 space-y-6',
        WIDTH_MAP[width],
        className,
      )}
    >
      {children}
    </div>
  )
}

export interface PageHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode | undefined
  actions?: React.ReactNode | undefined
  action?: React.ReactNode | undefined
  backTo?: string | (() => void) | undefined
  className?: string | undefined
}

export function PageHeader({
  title,
  subtitle,
  actions,
  action,
  backTo,
  className,
}: PageHeaderProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const headerActions = actions ?? action

  const handleBack = () => {
    if (typeof backTo === 'function') {
      backTo()
    } else if (typeof backTo === 'string') {
      navigate(backTo)
    } else {
      if (location.key === 'default' || (window.history.state && window.history.state.idx === 0)) {
        navigate('/', { replace: true })
      } else {
        navigate(-1)
      }
    }
  }

  return (
    <header className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-4', className)}>
      <div className="flex items-start sm:items-center gap-3">
        {backTo && (
          <button
            type="button"
            onClick={handleBack}
            className="p-2 -ml-2 rounded-xl text-text-muted hover:text-text hover:bg-surface-overlay transition-colors shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text leading-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-text-muted mt-0.5 leading-normal">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {headerActions && (
        <div className="flex items-center gap-2.5 flex-wrap sm:shrink-0">
          {headerActions}
        </div>
      )}
    </header>
  )
}
