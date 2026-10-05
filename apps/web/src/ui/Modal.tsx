import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import { X } from 'lucide-react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }

      // Tab trap
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement?.focus()
            e.preventDefault()
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement?.focus()
            e.preventDefault()
          }
        }
      }
    }

    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)

      setTimeout(() => {
        const focusable = dialogRef.current?.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (focusable) {
          focusable.focus()
        } else {
          dialogRef.current?.focus()
        }
      }, 50)
    }

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
      }
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      {/* Backdrop overlay button */}
      <button
        type="button"
        aria-label="Close dialog overlay"
        onClick={onClose}
        tabIndex={-1}
        className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 border-0 cursor-default -z-10"
      />

      {/* Dialog / Bottom-sheet container */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-describedby={description ? 'modal-desc' : undefined}
        className={cn(
          'relative z-10 w-full bg-surface-elevated border-t sm:border border-border/80',
          'rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col',
          'max-h-[92dvh] sm:max-h-[90vh] overflow-hidden',
          'animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 outline-none',
          'pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:pb-0',
          sizeClasses[size],
          className,
        )}
      >
        {/* Mobile Drag Indicator Handle */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <div className="w-12 h-1.5 bg-border rounded-full" />
        </div>

        {(title || description) && (
          <div className="flex items-start justify-between px-5 py-3.5 sm:py-4 border-b border-border/70">
            <div>
              {title && (
                <h2 id="modal-title" className="text-lg font-bold text-text leading-snug">
                  {title}
                </h2>
              )}
              {description && (
                <p id="modal-desc" className="text-xs text-text-muted mt-0.5 leading-normal">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 -mr-1.5 rounded-xl text-text-muted hover:text-text hover:bg-surface-overlay transition-colors"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
