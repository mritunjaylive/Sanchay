import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import { Button } from '../../../ui'

interface ReportHeaderProps {
  rightElement?: React.ReactNode | undefined
}

export function ReportHeader({ rightElement }: ReportHeaderProps) {
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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
      {/* Scrollable segmented navigation */}
      <div className="relative overflow-x-auto no-scrollbar -mx-1 px-1">
        <nav className="inline-flex p-1 bg-surface-overlay/80 backdrop-blur-xs rounded-xl border border-border/50 gap-1" aria-label="Report navigation">
          {tabs.map((tab) => {
            const isActive = location.pathname === tab.path
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-text-muted hover:text-text hover:bg-surface-elevated/60'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        {rightElement}
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Printer size={14} />}
          onClick={() => window.print()}
          className="print:hidden h-8 text-xs px-2.5"
          aria-label={t('reports.print', 'Print Report')}
        >
          <span className="hidden sm:inline">{t('reports.print', 'Print Report')}</span>
        </Button>
      </div>
    </div>
  )
}
