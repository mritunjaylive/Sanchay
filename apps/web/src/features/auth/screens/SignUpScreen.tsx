import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/authStore'
import { Button, Input, Logo } from '../../../ui'
import { Mail, Lock, User, AlertCircle, CheckCircle } from 'lucide-react'

export default function SignUpScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { signUpWithEmail, isLoading, error, clearError } = useAuthStore()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setFormError(null)

    if (password.length < 10) {
      setFormError(t('auth.passwordLength', 'Password must be at least 10 characters'))
      return
    }

    if (password !== confirmPassword) {
      setFormError(t('auth.passwordMismatch', 'Passwords do not match'))
      return
    }

    try {
      await signUpWithEmail(email, password, displayName)
      setIsSuccess(true)
    } catch {
      // Handled in store
    }
  }

  if (isSuccess) {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-surface-elevated border border-border rounded-2xl shadow-xl text-center">
        <div className="w-12 h-12 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={28} />
        </div>
        <h2 className="text-xl font-bold text-text">{t('auth.checkEmail', 'Check your email')}</h2>
        <p className="text-sm text-text-muted mt-2">
          {t('auth.verificationLinkSent', 'We have sent a verification link to')} <span className="font-semibold text-text">{email}</span>.
        </p>
        <Button
          variant="primary"
          className="w-full mt-6"
          onClick={() => navigate('/auth/sign-in')}
        >
          {t('auth.backToSignIn', 'Back to Sign In')}
        </Button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-surface-elevated border border-border rounded-2xl shadow-xl">
      <div className="text-center mb-6">
        <div className="flex justify-center mb-3">
          <Logo size={52} className="shadow-md rounded-2xl" />
        </div>
        <h1 className="text-2xl font-bold text-text">Sanchay</h1>
        <p className="text-sm text-text-muted mt-1">{t('auth.signUpSubtitle', 'Create your account to start tracking')}</p>
      </div>

      {(error || formError) && (
        <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-xl flex items-center gap-2.5 text-danger text-sm">
          <AlertCircle size={18} className="shrink-0" />
          <span>{formError || error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="text"
          label={t('auth.name', 'Full Name')}
          placeholder="e.g. Rahul Sharma"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          leftIcon={<User size={18} />}
          required
        />

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

        <Input
          type="password"
          label={t('auth.password', 'Password')}
          placeholder="Minimum 10 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock size={18} />}
          helperText={t('auth.passwordHint', 'Minimum 10 characters')}
          required
          autoComplete="new-password"
        />

        <Input
          type="password"
          label={t('auth.confirmPassword', 'Confirm Password')}
          placeholder="Re-enter password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          leftIcon={<Lock size={18} />}
          required
          autoComplete="new-password"
        />

        <Button type="submit" variant="primary" className="w-full mt-2" isLoading={isLoading}>
          {t('auth.createAccount', 'Create Account')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-text-muted">
        {t('auth.alreadyHaveAccount', 'Already have an account?')}{' '}
        <Link to="/auth/sign-in" className="text-primary hover:underline font-semibold">
          {t('auth.signIn', 'Sign In')}
        </Link>
      </p>
    </div>
  )
}
