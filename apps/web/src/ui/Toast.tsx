import React from 'react'
import { create } from 'zustand'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '../lib/cn'

export interface ToastItem {
  id: string
  message: string
  type?: 'success' | 'error' | 'info'
  durationMs?: number
  action?: {
    label: string
    onClick: () => void
  }
}

interface ToastStore {
  toasts: ToastItem[]
  showToast: (toast: Omit<ToastItem, 'id'>) => string
  dismissToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9)
    const duration = toast.durationMs ?? 4000
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
      }, duration)
    }

    return id
  },
  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },
}))

export function ToastContainer() {
  const { toasts, dismissToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => {
        const icons = {
          success: <CheckCircle2 className="text-success shrink-0" size={18} />,
          error: <AlertCircle className="text-danger shrink-0" size={18} />,
          info: <Info className="text-primary shrink-0" size={18} />,
        }

        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-center justify-between gap-3 p-3.5 bg-surface-elevated text-text border border-border rounded-xl shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-200',
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {icons[toast.type ?? 'info']}
              <p className="text-sm font-medium truncate">{toast.message}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick()
                    dismissToast(toast.id)
                  }}
                  className="text-xs font-bold text-primary hover:underline px-2 py-1 min-h-[36px]"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss toast"
                className="text-text-muted hover:text-text p-1 rounded-md"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
