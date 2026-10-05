import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/authStore'
import type { AuthErrorCode } from '../stores/authStore'
import { Button, Input, LanguageSwitcher, Logo, BrandName } from '../../../ui'
import { Mail, Lock, AlertCircle } from 'lucide-react'

export default function SignInScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { signInWithEmail, signInWithGoogle, signInOffline, isSubmitting, resendConfirmation, error, clearError } =
    useAuthStore()

  // Redirect to intended destination after login
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'

  // Only show offline demo mode button in local dev when not using a deployed/cloud Supabase instance
  const isDeployedOrCloudSupabase =
    import.meta.env.PROD ||
    (Boolean(import.meta.env['VITE_SUPABASE_URL']) &&
      !import.meta.env['VITE_SUPABASE_URL'].includes('127.0.0.1') &&
      !import.meta.env['VITE_SUPABASE_URL'].includes('localhost'))

  const showOfflineMode = !isDeployedOrCloudSupabase

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)

  /** Map typed error code to a translated user-facing message */
  function getErrorMessage(code: AuthErrorCode | null): string | null {
    if (!code) return null
    switch (code) {
      case 'invalid_credentials':
        return t('auth.errors.invalidCredentials', 'Incorrect email or password. Please try again.')
      case 'email_not_confirmed':
        return t('auth.errors.emailNotConfirmed', 'Please confirm your email address before signing in.')
      case 'network':
        return t('auth.errors.network', 'You appear to be offline. Check your connection and try again.')
      case 'rate_limited':
        return t('auth.errors.rateLimited', 'Too many attempts. Please wait a moment before trying again.')
      default:
        return t('auth.errors.unknown', 'Something went wrong. Please try again.')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setErrorCode(null)
    setFormError(null)

    if (!email || !password) {
      setFormError(t('auth.fillAllFields', 'Please fill in all fields'))
      return
    }

    const result = await signInWithEmail(email, password)

    if (result.error) {
      setErrorCode(result.error)
      // Move focus to error alert for screen readers
      const alertEl = document.getElementById('signin-error-alert')
      alertEl?.focus()
    } else {
      navigate(from, { replace: true })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter') {
      void handleSubmit(e as unknown as React.FormEvent)
    }
  }

  const handleGoogle = async () => {
    clearError()
    setErrorCode(null)
    await signInWithGoogle()
    // Google OAuth redirects to /auth/callback — no navigation needed here
  }

  const handleOffline = async () => {
    clearError()
    setErrorCode(null)
    await signInOffline()
    navigate('/', { replace: true })
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return
    const { error: resendError } = await resendConfirmation(email)
    if (!resendError) {
      setResendCooldown(30)
      const interval = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
  }

  const displayedError = formError ?? getErrorMessage(errorCode) ?? (error ? t('auth.errors.unknown', 'Something went wrong. Please try again.') : null)

  return (
    <div className="w-full max-w-md mx-auto p-2 sm:p-6 lg:p-0 space-y-6">
      <div className="text-center lg:text-left mb-6">
        <div className="flex justify-center lg:justify-start mb-3 lg:hidden">
          <Logo size={48} className="shadow-md rounded-2xl" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-text">
          {t('auth.welcomeBack', 'Welcome back')}
        </h1>
        <p className="text-sm text-text-muted mt-1">{t('auth.signInSubtitle', 'Sign in to access your offline-first financial accounts')}</p>
        <div className="flex justify-center lg:justify-start mt-3">
          <LanguageSwitcher variant="buttons" />
        </div>
      </div>

      {displayedError && (
        <div
          id="signin-error-alert"
          role="alert"
          tabIndex={-1}
          className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-xl flex flex-col gap-2 text-danger text-sm"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle size={18} className="shrink-0" />
            <span>{displayedError}</span>
          </div>
          {errorCode === 'email_not_confirmed' && email && (
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={resendCooldown > 0}
              className="text-xs underline self-start disabled:opacity-50"
            >
              {resendCooldown > 0
                ? t('auth.resendCooldown', 'Resend in {{seconds}}s', { seconds: resendCooldown })
                : t('auth.resendConfirmation', 'Resend confirmation email')}
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-4" noValidate>
        <Input
          id="signin-email"
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
          id="signin-password"
          type="password"
          label={t('auth.password', 'Password')}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock size={18} />}
          required
          autoComplete="current-password"
        />

        <div className="flex items-center justify-between text-xs">
          <Link to="/auth/magic-link" className="text-primary hover:underline font-medium">
            {t('auth.useMagicLink', 'Sign in with Magic Link')}
          </Link>
          <Link to="/auth/reset-password" className="text-text-muted hover:text-text font-medium">
            {t('auth.forgotPassword', 'Forgot password?')}
          </Link>
        </div>

        <Button
          id="signin-submit"
          type="submit"
          variant="primary"
          className="w-full"
          isLoading={isSubmitting}
          disabled={isSubmitting}
        >
          {t('auth.signIn', 'Sign In')}
        </Button>
      </form>

      <div className="relative my-6 text-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <span className="relative px-3 bg-surface-elevated text-xs uppercase tracking-wider text-text-muted">
          {t('common.or', 'or')}
        </span>
      </div>

      <Button
        id="signin-google"
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => void handleGoogle()}
        disabled={isSubmitting}
      >
        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        {t('auth.continueWithGoogle', 'Continue with Google')}
      </Button>

      {showOfflineMode && (
        <div className="mt-3">
          <Button
            id="signin-offline"
            type="button"
            variant="outline"
            className="w-full border-dashed border-primary/40 text-primary hover:bg-primary/5"
            onClick={() => void handleOffline()}
            disabled={isSubmitting}
          >
            ⚡ {t('auth.continueOffline', 'Continue in Offline / Demo Mode')}
          </Button>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-text-muted">
        {t('auth.noAccount', "Don't have an account?")}{' '}
        <Link to="/auth/sign-up" className="text-primary hover:underline font-semibold">
          {t('auth.signUp', 'Sign Up')}
        </Link>
      </p>
    </div>
  )
}
