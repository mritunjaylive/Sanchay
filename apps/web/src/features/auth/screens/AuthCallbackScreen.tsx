/**
 * features/auth/screens/AuthCallbackScreen.tsx
 *
 * P0-A: Handles OAuth/magic-link/email-confirm/password-reset redirects.
 * Supabase's detectSessionInUrl processes the code/tokens in the URL.
 * We simply wait for getSession() to confirm, then navigate to the app.
 */

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LoadingSpinner } from '../../../ui/LoadingSpinner'
import { Button } from '../../../ui'
import { AlertCircle } from 'lucide-react'

const TIMEOUT_MS = 10_000

export default function AuthCallbackScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const urlParams = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))

    // Check for error in URL first
    const urlError = urlParams.get('error_description') ?? hashParams.get('error_description')
    if (urlError) {
      setStatus('error')
      setErrorMsg(decodeURIComponent(urlError))
      return
    }

    // Import the supabase client — this triggers detectSessionInUrl processing
    const doCallback = async () => {
      try {
        const { supabase } = await import('../../../lib/supabase')

        // Poll for session (detectSessionInUrl runs asynchronously)
        const deadline = Date.now() + TIMEOUT_MS
        let session = null

        while (Date.now() < deadline) {
          if (cancelled) return
          const { data } = await supabase.auth.getSession()
          if (data.session) {
            session = data.session
            break
          }
          await new Promise((r) => setTimeout(r, 300))
        }

        if (cancelled) return

        if (!session) {
          setStatus('error')
          setErrorMsg(t('auth.errors.callbackTimeout', 'Sign-in timed out. Please try again.'))
          return
        }

        // Clean up the URL and redirect
        history.replaceState(null, '', window.location.pathname)
        navigate('/', { replace: true })
      } catch (e: unknown) {
        if (!cancelled) {
          setStatus('error')
          setErrorMsg(e instanceof Error ? e.message : t('auth.errors.unknown', 'Something went wrong.'))
        }
      }
    }

    void doCallback()
    return () => { cancelled = true }
  }, [navigate, t])

  if (status === 'loading') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-surface">
        <LoadingSpinner size="lg" />
        <p className="text-text-muted text-sm">{t('auth.signingIn', 'Signing you in…')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-surface p-6">
      <div className="flex items-center gap-2 text-danger">
        <AlertCircle size={24} />
        <span className="font-semibold">{t('auth.errors.callbackFailed', 'Sign-in failed')}</span>
      </div>
      {errorMsg && <p className="text-sm text-text-muted text-center max-w-sm">{errorMsg}</p>}
      <Button variant="primary" onClick={() => navigate('/auth/sign-in', { replace: true })}>
        {t('auth.backToSignIn', 'Back to sign in')}
      </Button>
    </div>
  )
}
