import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { transactionRepo } from '../../../db/repositories/transactionRepo'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { useAuthStore } from '../../auth/stores/authStore'
import { useToastStore } from '../../../ui/Toast'
import { formatMoney } from '../../../lib/money'
import { Button, Input, Select, Card, Badge } from '../../../ui'
import {
  Plus,
  Search,
  Filter,
  Trash2,
  Download,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  SlidersHorizontal,
  CheckSquare,
  Square,
} from 'lucide-react'
import type { Transaction, TransactionType } from '@sanchay/shared'

export default function TransactionListScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.session?.user)
  const { hideBalances, baseCurrency, locale } = useSettingsStore()
  const showToast = useToastStore((s) => s.showToast)

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [accountFilter, setAccountFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [isFilterExpanded, setIsFilterExpanded] = useState(false)

  // Multi-select bulk state
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Reactive DB queries
  const transactions = useLiveQuery(
    () => db.transactions.filter((tx) => !tx.deletedAt).reverse().sortBy('occurredOn'),
    [],
  )
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).toArray(), [])
  const categories = useLiveQuery(() => db.categories.filter((c) => !c.deletedAt).toArray(), [])

  // Deduplicated categories for filter dropdown
  const uniqueCategories = useMemo(() => {
    if (!categories) return []
    const seen = new Set<string>()
    const list: typeof categories = []
    for (const c of categories) {
      if (user?.id && c.userId && c.userId !== user.id) continue
      const norm = `${c.kind}:${c.name.trim().toLowerCase()}`
      if (!seen.has(norm)) {
        seen.add(norm)
        list.push(c)
      }
    }
    return list
  }, [categories, user?.id])

  // Lookup maps
  const accountMap = useMemo(() => {
    const map = new Map<string, string>()
    accounts?.forEach((a) => map.set(a.id, a.name))
    return map
  }, [accounts])

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>()
    categories?.forEach((c) => map.set(c.id, c.name))
    return map
  }, [categories])

  const accountCurrencyMap = useMemo(() => {
    const map = new Map<string, string>()
    accounts?.forEach((a) => map.set(a.id, a.currency))
    return map
  }, [accounts])

  // Filtered transactions
  const filtered = useMemo(() => {
    if (!transactions) return []

    return transactions.filter((tx) => {
      // Type filter
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false

      // Account filter
      if (accountFilter !== 'all' && tx.accountId !== accountFilter && tx.toAccountId !== accountFilter)
        return false

      // Category filter
      if (categoryFilter !== 'all' && tx.categoryId !== categoryFilter) return false

      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        const payeeMatch = tx.payee?.toLowerCase().includes(query) ?? false
        const noteMatch = tx.note?.toLowerCase().includes(query) ?? false
        const catName = categoryMap.get(tx.categoryId ?? '')?.toLowerCase() ?? ''
        const catMatch = catName.includes(query)
        if (!payeeMatch && !noteMatch && !catMatch) return false
      }

      return true
    })
  }, [transactions, typeFilter, accountFilter, categoryFilter, searchQuery, categoryMap])

  // Group by day with daily totals
  const groupedByDay = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string
        items: Transaction[]
        dayIncomeMinor: number
        dayExpenseMinor: number
      }
    >()

    for (const tx of filtered) {
      let group = map.get(tx.occurredOn)
      if (!group) {
        group = {
          date: tx.occurredOn,
          items: [],
          dayIncomeMinor: 0,
          dayExpenseMinor: 0,
        }
        map.set(tx.occurredOn, group)
      }
      group.items.push(tx)

      const amount = tx.amountMinor
      if (tx.type === 'income') group.dayIncomeMinor += amount
      else if (tx.type === 'expense') group.dayExpenseMinor += amount
    }

    return Array.from(map.values())
  }, [filtered])

  // Multi-select handlers
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((tx) => tx.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const idsToDelete = Array.from(selectedIds)

    if (window.confirm(t('transactions.bulkDeleteConfirm', `Delete ${idsToDelete.length} transactions?`))) {
      await transactionRepo.bulkDelete(idsToDelete)
      setSelectedIds(new Set())
      setIsSelectMode(false)

      showToast({
        message: t('transactions.deletedCount', `Deleted ${idsToDelete.length} transactions`),
        type: 'info',
        durationMs: 8000,
        action: {
          label: t('common.undo', 'Undo'),
          onClick: async () => {
            for (const id of idsToDelete) {
              await transactionRepo.restore(id)
            }
          },
        },
      })
    }
  }

  // Export filtered list to CSV (spec F-058)
  const handleExportCSV = () => {
    if (filtered.length === 0) return

    const headers = ['Date', 'Type', 'Amount', 'Currency', 'Account', 'To Account', 'Category', 'Payee', 'Note']
    const rows = filtered.map((tx) => [
      tx.occurredOn,
      tx.type,
      (tx.amountMinor / 100).toFixed(2),
      accountCurrencyMap.get(tx.accountId) ?? '',
      accountMap.get(tx.accountId) ?? '',
      tx.toAccountId ? accountMap.get(tx.toAccountId) ?? '' : '',
      tx.categoryId ? categoryMap.get(tx.categoryId) ?? '' : '',
      `"${(tx.payee ?? '').replace(/"/g, '""')}"`,
      `"${(tx.note ?? '').replace(/"/g, '""')}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sanchay-transactions-${new Date().toISOString().substring(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const renderAmount = (minor: number, currency = baseCurrency) => {
    if (hideBalances) return '••••••'
    return formatMoney(minor, currency, locale)
  }

  return (
    <div className="space-y-4 pb-20 md:pb-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('transactions.title', 'Transactions')}</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {filtered.length} {t('transactions.records', 'records')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <>
              <Button
                variant={isSelectMode ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => {
                  setIsSelectMode(!isSelectMode)
                  setSelectedIds(new Set())
                }}
              >
                {isSelectMode ? t('common.done', 'Done') : t('common.select', 'Select')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                title={t('transactions.exportCSV', 'Export CSV')}
              >
                <Download size={16} />
              </Button>
            </>
          )}
          <Button
            variant="primary"
            leftIcon={<Plus size={16} />}
            onClick={() => navigate('/transactions/new')}
          >
            {t('transactions.addTransaction', 'Add')}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card className="p-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder={t('transactions.searchPlaceholder', 'Search payee, category, note...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={16} />}
            className="h-10 text-sm"
          />
          <Button
            variant={isFilterExpanded ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setIsFilterExpanded(!isFilterExpanded)}
            className="shrink-0"
          >
            <Filter size={16} />
          </Button>
        </div>

        {isFilterExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 mt-3 border-t border-border">
            <Select
              label={t('common.type', 'Type')}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Types' },
                { value: 'expense', label: 'Expense' },
                { value: 'income', label: 'Income' },
                { value: 'transfer', label: 'Transfer' },
                { value: 'adjustment', label: 'Adjustment' },
              ]}
            />

            <Select
              label={t('accounts.account', 'Account')}
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Accounts' },
                ...(accounts?.map((a) => ({ value: a.id, label: a.name })) ?? []),
              ]}
            />

            <Select
              label={t('categories.category', 'Category')}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Categories' },
                ...uniqueCategories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
        )}
      </Card>

      {/* Bulk actions banner */}
      {isSelectMode && (
        <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-text font-medium flex items-center gap-1.5 hover:underline"
            >
              {selectedIds.size === filtered.length ? <CheckSquare size={18} /> : <Square size={18} />}
              <span>{selectedIds.size} selected</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 size={14} />}
              disabled={selectedIds.size === 0}
              onClick={handleBulkDelete}
            >
              {t('common.delete', 'Delete')}
            </Button>
          </div>
        </div>
      )}

      {/* Grouped Transaction List */}
      {groupedByDay.length === 0 ? (
        <Card className="py-16 text-center text-text-muted">
          <p className="text-base font-medium">{t('transactions.noMatches', 'No transactions found.')}</p>
          <p className="text-xs mt-1">{t('transactions.tryAdjustingFilters', 'Try adjusting your search or filters.')}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedByDay.map((group) => (
            <Card key={group.date} className="p-0 overflow-hidden">
              {/* Daily Header with Subtotals */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-surface-overlay/50 border-b border-border/50 text-xs">
                <span className="font-bold text-text">{group.date}</span>
                <div className="flex items-center gap-3 font-semibold">
                  {group.dayIncomeMinor > 0 && (
                    <span className="text-success">+{renderAmount(group.dayIncomeMinor)}</span>
                  )}
                  {group.dayExpenseMinor > 0 && (
                    <span className="text-danger">-{renderAmount(group.dayExpenseMinor)}</span>
                  )}
                </div>
              </div>

              {/* Transactions in this Day */}
              <div className="divide-y divide-border/50">
                {group.items.map((tx) => {
                  const isIncome = tx.type === 'income'
                  const isTransfer = tx.type === 'transfer'
                  const isAdjustment = tx.type === 'adjustment'
                  const isSelected = selectedIds.has(tx.id)

                  return (
                    <button
                      type="button"
                      key={tx.id}
                      onClick={() => {
                        if (isSelectMode) toggleSelect(tx.id)
                        else navigate(`/transactions/${tx.id}`)
                      }}
                      className={`w-full text-left px-4 py-3.5 flex items-center justify-between transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-surface-overlay/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isSelectMode ? (
                          <div className="text-primary shrink-0">
                            {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                          </div>
                        ) : (
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isIncome
                                ? 'bg-success/10 text-success'
                                : isTransfer
                                ? 'bg-primary/10 text-primary'
                                : isAdjustment
                                ? 'bg-warning/10 text-warning'
                                : 'bg-surface-overlay text-text'
                            }`}
                          >
                            {isTransfer ? (
                              <ArrowRight size={18} />
                            ) : isIncome ? (
                              <TrendingUp size={18} />
                            ) : isAdjustment ? (
                              <SlidersHorizontal size={18} />
                            ) : (
                              <TrendingDown size={18} />
                            )}
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text truncate">
                            {tx.payee ||
                              (tx.categoryId ? categoryMap.get(tx.categoryId) : undefined) ||
                              tx.type.toUpperCase()}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5 truncate">
                            <span>{accountMap.get(tx.accountId) ?? 'Unknown'}</span>
                            {isTransfer && tx.toAccountId && (
                              <span>→ {accountMap.get(tx.toAccountId)}</span>
                            )}
                            {tx.note && <span>• {tx.note}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-sm font-bold ${
                            isIncome || (isAdjustment && tx.adjustmentSign === '+')
                              ? 'text-success'
                              : isTransfer
                              ? 'text-primary'
                              : 'text-text'
                          }`}
                        >
                          {isIncome || (isAdjustment && tx.adjustmentSign === '+') ? '+' : isTransfer ? '' : '-'}
                          {renderAmount(tx.amountMinor, accountCurrencyMap.get(tx.accountId) ?? baseCurrency)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
