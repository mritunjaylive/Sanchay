import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import { Button } from '../../../ui'

export function ReportHeader() {
  const { t } = useTranslation()
  const location = useLocation()

  const tabs = [
    { path: '/reports/summary', label: t('reports.summaryTab', 'Summary') },
    { path: '/reports/categories', label: t('reports.categoriesTab', 'Categories') },
    { path: '/reports/trends', label: t('reports.trendsTab', 'Trends') },
    { path: '/reports/net-worth', label: t('reports.netWorthTab', 'Net Worth') },
    { path: '/reports/budget', label: t('reports.budgetVsActualTab', 'Budget vs Actual') },
  ]

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-text-muted hover:text-text hover:bg-surface-overlay'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      <Button
        variant="outline"
        size="sm"
        leftIcon={<Printer size={14} />}
        onClick={() => window.print()}
        className="print:hidden shrink-0"
      >
        {t('reports.print', 'Print Report')}
      </Button>
    </div>
  )
}
