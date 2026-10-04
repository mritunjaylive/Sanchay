import React from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../ui'
import { CheckCircle } from 'lucide-react'

export default function VerifyEmailScreen() {
  const { t } = useTranslation()

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-surface-elevated border border-border rounded-2xl shadow-xl text-center">
      <div className="w-12 h-12 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={28} />
      </div>
      <h1 className="text-xl font-bold text-text">{t('auth.emailVerifiedTitle', 'Email Verified!')}</h1>
      <p className="text-sm text-text-muted mt-2">
        {t('auth.emailVerifiedBody', 'Your email address has been verified successfully. You can now sign in to your account.')}
      </p>
      <Link to="/auth/sign-in">
        <Button variant="primary" className="w-full mt-6">
          {t('auth.continueToSignIn', 'Continue to Sign In')}
        </Button>
      </Link>
    </div>
  )
}
