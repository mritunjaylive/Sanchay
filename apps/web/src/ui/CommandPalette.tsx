import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import {
  Search,
  PlusCircle,
  Home,
  List,
  Wallet,
  PiggyBank,
  Receipt,
  Landmark,
  Target,
  BarChart2,
  Calendar,
  FileSpreadsheet,
  Settings,
  HelpCircle,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  RefreshCw,
} from 'lucide-react'
import { cn } from '../lib/cn'

export interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
}

interface CommandItem {
  id: string
  title: string
  category: string
  icon: React.ReactNode
  onSelect: () => void
  keywords?: string[]
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const items: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      // Quick Actions
      {
        id: 'new-expense',
        title: t('transactions.addExpense', 'Add Expense'),
        category: t('common.actions', 'Quick Actions'),
        icon: <TrendingDown size={16} className="text-danger" />,
        onSelect: () => {
          navigate('/transactions/new?type=expense')
          onClose()
        },
        keywords: ['expense', 'add', 'spend', 'new'],
      },
      {
        id: 'new-income',
        title: t('transactions.addIncome', 'Add Income'),
        category: t('common.actions', 'Quick Actions'),
        icon: <TrendingUp size={16} className="text-success" />,
        onSelect: () => {
          navigate('/transactions/new?type=income')
          onClose()
        },
        keywords: ['income', 'add', 'salary', 'earn', 'new'],
      },
      {
        id: 'new-transfer',
        title: t('transactions.addTransfer', 'Add Transfer'),
        category: t('common.actions', 'Quick Actions'),
        icon: <RefreshCw size={16} className="text-primary" />,
        onSelect: () => {
          navigate('/transactions/new?type=transfer')
          onClose()
        },
        keywords: ['transfer', 'move', 'between', 'new'],
      },

      // Navigation
      {
        id: 'nav-home',
        title: t('nav.home', 'Home'),
        category: t('nav.navigation', 'Navigation'),
        icon: <Home size={16} />,
        onSelect: () => {
          navigate('/')
          onClose()
        },
      },
      {
        id: 'nav-transactions',
        title: t('nav.transactions', 'Transactions'),
        category: t('nav.navigation', 'Navigation'),
        icon: <List size={16} />,
        onSelect: () => {
          navigate('/transactions')
          onClose()
        },
      },
      {
        id: 'nav-accounts',
        title: t('nav.accounts', 'Accounts'),
        category: t('nav.navigation', 'Navigation'),
        icon: <Wallet size={16} />,
        onSelect: () => {
          navigate('/accounts')
          onClose()
        },
      },
      {
        id: 'nav-budgets',
        title: t('nav.budgets', 'Budgets'),
        category: t('nav.navigation', 'Navigation'),
        icon: <PiggyBank size={16} />,
        onSelect: () => {
          navigate('/budgets')
          onClose()
        },
      },
      {
        id: 'nav-bills',
        title: t('nav.bills', 'Bills & Recurring'),
        category: t('nav.navigation', 'Navigation'),
        icon: <Receipt size={16} />,
        onSelect: () => {
          navigate('/bills')
          onClose()
        },
      },
      {
        id: 'nav-loans',
        title: t('nav.loans', 'Loans & Liabilities'),
        category: t('nav.navigation', 'Navigation'),
        icon: <Landmark size={16} />,
        onSelect: () => {
          navigate('/loans')
          onClose()
        },
      },
      {
        id: 'nav-goals',
        title: t('nav.goals', 'Savings Goals'),
        category: t('nav.navigation', 'Navigation'),
        icon: <Target size={16} />,
        onSelect: () => {
          navigate('/goals')
          onClose()
        },
      },
      {
        id: 'nav-reports',
        title: t('nav.reports', 'Reports & Analytics'),
        category: t('nav.navigation', 'Navigation'),
        icon: <BarChart2 size={16} />,
        onSelect: () => {
          navigate('/reports/summary')
          onClose()
        },
      },
      {
        id: 'nav-calendar',
        title: t('nav.calendar', 'Calendar'),
        category: t('nav.navigation', 'Navigation'),
        icon: <Calendar size={16} />,
        onSelect: () => {
          navigate('/calendar')
          onClose()
        },
      },
      {
        id: 'nav-import',
        title: t('nav.import', 'Import & Export'),
        category: t('nav.navigation', 'Navigation'),
        icon: <FileSpreadsheet size={16} />,
        onSelect: () => {
          navigate('/import')
          onClose()
        },
      },
      {
        id: 'nav-settings',
        title: t('nav.settings', 'Settings'),
        category: t('nav.navigation', 'Navigation'),
        icon: <Settings size={16} />,
        onSelect: () => {
          navigate('/settings')
          onClose()
        },
      },
      {
        id: 'nav-help',
        title: t('nav.help', 'Help & Creator Details'),
        category: t('nav.navigation', 'Navigation'),
        icon: <HelpCircle size={16} />,
        onSelect: () => {
          navigate('/help')
          onClose()
        },
      },
    ]

    return list
  }, [t, navigate, onClose])

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase().trim()
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.keywords?.some((k) => k.toLowerCase().includes(q)),
    )
  }, [items, query])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex]!.onSelect()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredItems, selectedIndex, onClose])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4">
      {/* Backdrop */}
      <button
        type="button"
        tabIndex={-1}
        onClick={onClose}
        aria-label="Close command palette"
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 border-0 cursor-default"
      />

      {/* Palette Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        className={cn(
          'relative z-10 w-full max-w-xl bg-surface-elevated border border-border/80',
          'rounded-2xl shadow-2xl overflow-hidden flex flex-col',
          'animate-in zoom-in-95 duration-150',
        )}
      >
        {/* Search Input Box */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/70 bg-surface/50">
          <Search size={18} className="text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('common.commandPlaceholder', 'Type a command or search...')}
            className="w-full bg-transparent text-sm text-text placeholder:text-text-muted outline-none"
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono bg-surface-overlay text-text-muted border border-border rounded-md">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto p-2 space-y-1"
          role="listbox"
        >
          {filteredItems.length === 0 ? (
            <div className="p-6 text-center text-xs text-text-muted">
              {t('common.noResults', 'No results found.')}
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={item.onSelect}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs transition-colors',
                    isSelected
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-text hover:bg-surface-overlay',
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={cn(
                        'p-1.5 rounded-lg border shrink-0',
                        isSelected
                          ? 'bg-primary/20 border-primary/30 text-primary'
                          : 'bg-surface-overlay border-border text-text-muted',
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-muted">{item.category}</span>
                    {isSelected && <ArrowRight size={14} className="text-primary shrink-0" />}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="px-4 py-2 bg-surface border-t border-border/60 flex items-center justify-between text-[11px] text-text-muted">
          <span>{t('common.navigateWithArrows', 'Use ↑ ↓ to navigate, Enter to select')}</span>
          <span>Sanchay 1.0</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
