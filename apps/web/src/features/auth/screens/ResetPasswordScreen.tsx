import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/authStore'
import { Button, Input } from '../../../ui'
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'

export default function ResetPasswordScreen() {
  const { t } = useTranslation()
  const { resetPassword, isLoading, error, clearError } = useAuthStore()

  const [email, setEmail] = useState('')
  const [isSent, setIsSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    if (!email) return

    try {
      await resetPassword(email)
      setIsSent(true)
    } catch {
      // Handled in store
    }
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-surface-elevated border border-border rounded-2xl shadow-xl">
      <Link to="/auth/sign-in" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text mb-4">
        <ArrowLeft size={16} />
        <span>{t('auth.backToSignIn', 'Back to Sign In')}</span>
      </Link>

      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-text">{t('auth.resetPasswordTitle', 'Reset Password')}</h1>
        <p className="text-sm text-text-muted mt-1">
          {t('auth.resetPasswordSubtitle', "Enter your email and we'll send you a link to reset your password.")}
        </p>
      </div>

      {isSent ? (
        <div className="text-center py-4">
          <div className="w-12 h-12 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={28} />
          </div>
          <h2 className="text-base font-semibold text-text">{t('auth.emailSent', 'Check your inbox')}</h2>
          <p className="text-sm text-text-muted mt-1">
            {t('auth.resetLinkSentTo', 'Password reset instructions have been sent to')} <span className="font-semibold text-text">{email}</span>.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl flex items-center gap-2.5 text-danger text-sm">
              <AlertCircle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Input
            type="email"
            label={t('auth.email', 'Email Address')}
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail size={18} />}
            required
            autoComplete="email"
          />

          <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
            {t('auth.sendResetLink', 'Send Reset Link')}
          </Button>
        </form>
      )}
    </div>
  )
}
