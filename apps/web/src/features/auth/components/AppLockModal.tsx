import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Delete, AlertCircle } from 'lucide-react'
import { Button, Logo } from '../../../ui'

export interface AppLockModalProps {
  isOpen: boolean
  onUnlock: (pin: string) => Promise<{ success: boolean; lockoutSeconds?: number }>
}

export function AppLockModal({ isOpen, onUnlock }: AppLockModalProps) {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lockoutRemaining, setLockoutRemaining] = useState<number | null>(null)

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockoutRemaining || lockoutRemaining <= 0) return
    const timer = setInterval(() => {
      setLockoutRemaining((prev) => (prev && prev > 1 ? prev - 1 : null))
    }, 1000)
    return () => clearInterval(timer)
  }, [lockoutRemaining])

  const handleDigit = (digit: string) => {
    if (lockoutRemaining) return
    if (pin.length < 6) {
      const nextPin = pin + digit
      setPin(nextPin)
      if (nextPin.length >= 4) {
        void submitPin(nextPin)
      }
    }
  }

  const handleBackspace = () => {
    if (pin.length > 0) setPin(pin.slice(0, -1))
  }

  const submitPin = async (inputPin: string) => {
    setErrorMessage(null)
    const result = await onUnlock(inputPin)
    if (result.success) {
      setPin('')
      setErrorMessage(null)
    } else {
      setPin('')
      if (result.lockoutSeconds && result.lockoutSeconds > 0) {
        setLockoutRemaining(result.lockoutSeconds)
        setErrorMessage(`Too many incorrect attempts. Locked for ${result.lockoutSeconds}s.`)
      } else {
        setErrorMessage('Incorrect PIN. Please try again.')
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xs flex flex-col items-center text-center space-y-6">
        <div className="relative">
          <Logo size={60} className="shadow-md rounded-2xl" />
          <div className="absolute -bottom-1 -right-1 bg-surface-elevated border border-border p-1 rounded-full shadow-sm text-primary">
            <Lock size={14} />
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold text-text">Sanchay Locked</h2>
          <p className="text-xs text-text-muted mt-1">Enter your PIN to unlock</p>
        </div>

        {/* PIN Dots Display */}
        <div className="flex items-center gap-3 my-2">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full border transition-all ${
                pin.length > idx
                  ? 'bg-primary border-primary scale-110'
                  : 'bg-surface-elevated border-border'
              }`}
            />
          ))}
        </div>

        {/* Error or Lockout Message */}
        {(errorMessage || lockoutRemaining) && (
          <div className="p-2.5 bg-danger/10 border border-danger/20 rounded-xl flex items-center gap-2 text-danger text-xs font-semibold">
            <AlertCircle size={14} className="shrink-0" />
            <span>
              {lockoutRemaining
                ? `Locked: try again in ${lockoutRemaining}s`
                : errorMessage}
            </span>
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={Boolean(lockoutRemaining)}
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-surface-elevated hover:bg-surface-overlay border border-border text-xl font-bold text-text transition-all active:scale-95 disabled:opacity-40"
            >
              {digit}
            </button>
          ))}
          <div />
          <button
            type="button"
            disabled={Boolean(lockoutRemaining)}
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-surface-elevated hover:bg-surface-overlay border border-border text-xl font-bold text-text transition-all active:scale-95 disabled:opacity-40"
          >
            0
          </button>
          <button
            type="button"
            disabled={Boolean(lockoutRemaining)}
            onClick={handleBackspace}
            aria-label="Backspace"
            className="h-14 rounded-2xl bg-surface-elevated hover:bg-surface-overlay border border-border text-text-muted hover:text-text flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
          >
            <Delete size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
