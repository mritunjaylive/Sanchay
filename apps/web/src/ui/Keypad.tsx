import React from 'react'
import { cn } from '../lib/cn'
import { Delete, Check } from 'lucide-react'

export interface KeypadProps {
  value: string
  onChange: (newValue: string) => void
  onConfirm?: () => void
  className?: string
}

export function Keypad({ value, onChange, onConfirm, className }: KeypadProps) {
  const handleDigit = (digit: string) => {
    onChange(value === '0' ? digit : value + digit)
  }

  const handleOperator = (op: string) => {
    if (!value || value === '0') return
    const lastChar = value.slice(-1)
    if (['+', '-', '*', '/'].includes(lastChar)) {
      onChange(value.slice(0, -1) + op)
    } else {
      onChange(value + op)
    }
  }

  const handleBackspace = () => {
    if (value.length <= 1) {
      onChange('0')
    } else {
      onChange(value.slice(0, -1))
    }
  }

  const handleClear = () => {
    onChange('0')
  }

  return (
    <div className={cn('grid grid-cols-4 gap-2 select-none', className)}>
      <button
        type="button"
        onClick={() => handleOperator('+')}
        className="min-h-[48px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-colors flex items-center justify-center text-lg active:scale-95"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => handleOperator('-')}
        className="min-h-[48px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-colors flex items-center justify-center text-lg active:scale-95"
      >
        −
      </button>
      <button
        type="button"
        onClick={() => handleOperator('*')}
        className="min-h-[48px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-colors flex items-center justify-center text-lg active:scale-95"
      >
        ×
      </button>
      <button
        type="button"
        onClick={handleBackspace}
        aria-label="Backspace"
        className="min-h-[48px] font-semibold text-danger bg-danger/10 hover:bg-danger/20 rounded-xl transition-colors flex items-center justify-center active:scale-95"
      >
        <Delete size={20} />
      </button>

      {['7', '8', '9'].map((digit) => (
        <button
          key={digit}
          type="button"
          onClick={() => handleDigit(digit)}
          className="min-h-[52px] font-medium text-text bg-surface-elevated hover:bg-surface-overlay border border-border rounded-xl text-xl transition-colors active:scale-95"
        >
          {digit}
        </button>
      ))}
      <button
        type="button"
        onClick={() => handleOperator('/')}
        className="min-h-[48px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-colors flex items-center justify-center text-lg active:scale-95"
      >
        ÷
      </button>

      {['4', '5', '6'].map((digit) => (
        <button
          key={digit}
          type="button"
          onClick={() => handleDigit(digit)}
          className="min-h-[52px] font-medium text-text bg-surface-elevated hover:bg-surface-overlay border border-border rounded-xl text-xl transition-colors active:scale-95"
        >
          {digit}
        </button>
      ))}
      <button
        type="button"
        onClick={handleClear}
        className="min-h-[48px] text-xs font-bold text-text-muted bg-surface-elevated hover:bg-surface-overlay border border-border rounded-xl transition-colors active:scale-95 uppercase tracking-wider"
      >
        C
      </button>

      {['1', '2', '3'].map((digit) => (
        <button
          key={digit}
          type="button"
          onClick={() => handleDigit(digit)}
          className="min-h-[52px] font-medium text-text bg-surface-elevated hover:bg-surface-overlay border border-border rounded-xl text-xl transition-colors active:scale-95"
        >
          {digit}
        </button>
      ))}
      <button
        type="button"
        onClick={onConfirm}
        className="min-h-[52px] font-semibold text-white bg-primary hover:brightness-110 rounded-xl transition-all shadow-sm flex items-center justify-center active:scale-95 row-span-2"
        aria-label="Confirm"
      >
        <Check size={24} />
      </button>

      <button
        type="button"
        onClick={() => handleDigit('.')}
        className="min-h-[52px] font-bold text-text bg-surface-elevated hover:bg-surface-overlay border border-border rounded-xl text-xl transition-colors active:scale-95"
      >
        .
      </button>
      <button
        type="button"
        onClick={() => handleDigit('0')}
        className="col-span-2 min-h-[52px] font-medium text-text bg-surface-elevated hover:bg-surface-overlay border border-border rounded-xl text-xl transition-colors active:scale-95"
      >
        0
      </button>
    </div>
  )
}
