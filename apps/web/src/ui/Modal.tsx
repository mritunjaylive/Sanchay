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
      }
    }

    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)

      // Focus the dialog container or first focusable element
      setTimeout(() => {
        const focusable = dialogRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop overlay button */}
      <button
        type="button"
        aria-label="Close dialog overlay"
        onClick={onClose}
        tabIndex={-1}
        className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 border-0 cursor-default -z-10"
      />

      {/* Dialog container */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-describedby={description ? 'modal-desc' : undefined}
        className={cn(
          'relative z-10 w-full bg-surface-elevated border border-border rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150 outline-none',
          sizeClasses[size],
          className,
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between p-5 border-b border-border">
            <div>
              {title && (
                <h2 id="modal-title" className="text-lg font-bold text-text">
                  {title}
                </h2>
              )}
              {description && (
                <p id="modal-desc" className="text-sm text-text-muted mt-0.5">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="text-text-muted hover:text-text p-1.5 rounded-lg hover:bg-surface-overlay transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <X size={20} />
            </button>
          </div>
        )}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
