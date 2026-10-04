import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function QuickAddFAB() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={() => navigate('/transactions/new')}
      aria-label={t('transactions.addTransaction', 'Add Transaction')}
      className="relative -top-4 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:brightness-110 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 shrink-0"
    >
      <Plus size={24} />
    </button>
  )
}
