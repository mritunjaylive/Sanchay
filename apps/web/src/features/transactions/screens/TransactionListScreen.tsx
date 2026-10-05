import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { transactionRepo } from '../../../db/repositories/transactionRepo'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { useAuthStore } from '../../auth/stores/authStore'
import { useToastStore } from '../../../ui/Toast'
import { formatDayLabel } from '../../../lib/formatDayLabel'
import {
  Page,
  PageHeader,
  Button,
  Input,
  Card,
  Chip,
  Amount,
  EmptyState,
  Modal,
  Select,
  SkeletonCard,
  SkeletonRow,
} from '../../../ui'
import { TransactionRow } from '../components/TransactionRow'
import {
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Download,
  CheckSquare,
  Square,
  Receipt,
  X,
} from 'lucide-react'
import type { Transaction, Account, Category } from '@sanchay/shared'

const PAGE_SIZE_DAYS = 25

export default function TransactionListScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.session?.user)
  const { baseCurrency, locale } = useSettingsStore()
  const showToast = useToastStore((s) => s.showToast)

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [accountFilter, setAccountFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [visibleDaysCount, setVisibleDaysCount] = useState(PAGE_SIZE_DAYS)

  // Multi-select bulk state
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const todayStr = useMemo(() => new Date().toISOString().substring(0, 10), [])

  // Reactive DB queries
  const transactions = useLiveQuery(
    () => db.transactions.filter((tx) => !tx.deletedAt).reverse().sortBy('occurredOn'),
    [],
  )
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).toArray(), [])
  const categories = useLiveQuery(() => db.categories.filter((c) => !c.deletedAt).toArray(), [])

  const isLoading = transactions === undefined || accounts === undefined || categories === undefined

  // Deduplicated categories for filter dropdown
  const uniqueCategories = useMemo(() => {
    if (!categories) return []
    const seen = new Set<string>()
    const list: Category[] = []
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
    const map = new Map<string, Account>()
    accounts?.forEach((a) => map.set(a.id, a))
    return map
  }, [accounts])

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    categories?.forEach((c) => map.set(c.id, c))
    return map
  }, [categories])

  // Filtered transactions
  const filtered = useMemo(() => {
    if (!transactions) return []

    return transactions.filter((tx) => {
      // Type filter
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false

      // Account filter
      if (
        accountFilter !== 'all' &&
        tx.accountId !== accountFilter &&
        tx.toAccountId !== accountFilter
      ) {
        return false
      }

      // Category filter
      if (categoryFilter !== 'all' && tx.categoryId !== categoryFilter) return false

      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        const payeeMatch = tx.payee?.toLowerCase().includes(query) ?? false
        const noteMatch = tx.note?.toLowerCase().includes(query) ?? false
        const catName = categoryMap.get(tx.categoryId ?? '')?.name.toLowerCase() ?? ''
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

  const visibleGroups = useMemo(
    () => groupedByDay.slice(0, visibleDaysCount),
    [groupedByDay, visibleDaysCount],
  )

  const hasMoreDays = groupedByDay.length > visibleDaysCount

  // Active filters check
  const hasActiveFilters =
    typeFilter !== 'all' || accountFilter !== 'all' || categoryFilter !== 'all' || searchQuery !== ''

  const clearAllFilters = () => {
    setTypeFilter('all')
    setAccountFilter('all')
    setCategoryFilter('all')
    setSearchQuery('')
  }

  // Multi-select handlers
  const toggleSelect = (id: string, isSelected: boolean) => {
    const next = new Set(selectedIds)
    if (isSelected) next.add(id)
    else next.delete(id)
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

    if (
      window.confirm(
        t('transactions.bulkDeleteConfirm', {
          count: idsToDelete.length,
          defaultValue: `Delete ${idsToDelete.length} transactions?`,
        }),
      )
    ) {
      await transactionRepo.bulkDelete(idsToDelete)
      setSelectedIds(new Set())
      setIsSelectMode(false)

      showToast({
        message: t('transactions.deletedCount', {
          count: idsToDelete.length,
          defaultValue: `Deleted ${idsToDelete.length} transactions`,
        }),
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

    const headers = [
      'Date',
      'Type',
      'Amount',
      'Currency',
      'Account',
      'To Account',
      'Category',
      'Payee',
      'Note',
    ]
    const rows = filtered.map((tx) => [
      tx.occurredOn,
      tx.type,
      (tx.amountMinor / 100).toFixed(2),
      accountMap.get(tx.accountId)?.currency ?? baseCurrency,
      accountMap.get(tx.accountId)?.name ?? '',
      tx.toAccountId ? accountMap.get(tx.toAccountId)?.name ?? '' : '',
      tx.categoryId ? categoryMap.get(tx.categoryId)?.name ?? '' : '',
      `"${(tx.payee ?? '').replace(/"/g, '""')}"`,
      `"${(tx.note ?? '').replace(/"/g, '""')}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sanchay-transactions-${todayStr}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <Page width="default" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-36 bg-surface-elevated animate-pulse rounded-lg" />
          <div className="h-9 w-24 bg-surface-elevated animate-pulse rounded-xl" />
        </div>
        <SkeletonCard className="h-14" />
        <div className="space-y-3 pt-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </Page>
    )
  }

  return (
    <Page width="default" className="space-y-5">
      {/* Header */}
      <PageHeader
        title={t('transactions.title', 'Transactions')}
        subtitle={`${filtered.length} ${t('transactions.records', 'records')}`}
        actions={
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
              size="sm"
              leftIcon={<Plus size={16} />}
              onClick={() => navigate('/transactions/new')}
            >
              {t('transactions.addTransaction', 'Add')}
            </Button>
          </div>
        }
      />

      {/* Sticky Search & Filter Bar */}
      <div className="sticky top-14 z-10 bg-surface/95 backdrop-blur-md pt-1 pb-3 space-y-2.5 -mx-4 px-4 sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          <Input
            placeholder={t('transactions.searchPlaceholder', 'Search payee, note, category…')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={16} />}
            className="h-10 text-sm"
          />
          <Button
            variant={hasActiveFilters ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setIsFilterModalOpen(true)}
            leftIcon={<SlidersHorizontal size={15} />}
            className="shrink-0 h-10 px-3"
          >
            <span className="hidden sm:inline">{t('transactions.filter', 'Filters')}</span>
          </Button>
        </div>

        {/* Filter Chips Pill Row */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          {typeFilter !== 'all' && (
            <Chip
              label={`Type: ${typeFilter}`}
              selected={true}
              onRemove={() => setTypeFilter('all')}
            />
          )}

          {accountFilter !== 'all' && (
            <Chip
              label={`Account: ${accountMap.get(accountFilter)?.name || accountFilter}`}
              selected={true}
              onRemove={() => setAccountFilter('all')}
            />
          )}

          {categoryFilter !== 'all' && (
            <Chip
              label={`Category: ${categoryMap.get(categoryFilter)?.name || categoryFilter}`}
              selected={true}
              onRemove={() => setCategoryFilter('all')}
            />
          )}

          {searchQuery.trim() !== '' && (
            <Chip
              label={`Search: "${searchQuery}"`}
              selected={true}
              onRemove={() => setSearchQuery('')}
            />
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-text-muted hover:text-danger font-medium px-2 py-1 rounded-lg transition-colors shrink-0"
            >
              {t('transactions.clearAll', 'Clear all')}
            </button>
          )}
        </div>
      </div>

      {/* Bulk actions banner */}
      {isSelectMode && (
        <div className="sticky top-32 z-20 p-3 bg-primary/10 border border-primary/20 backdrop-blur-md rounded-2xl flex items-center justify-between text-sm shadow-sm animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-text font-medium flex items-center gap-1.5 hover:underline focus:outline-none"
            >
              {selectedIds.size === filtered.length ? (
                <CheckSquare size={18} className="text-primary" />
              ) : (
                <Square size={18} className="text-text-muted" />
              )}
              <span>
                {t('transactions.selectedCount', {
                  count: selectedIds.size,
                  defaultValue: `${selectedIds.size} selected`,
                })}
              </span>
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
        <EmptyState
          icon={<Receipt size={28} />}
          title={
            hasActiveFilters
              ? t('transactions.noMatches', 'No matching transactions')
              : t('transactions.noTransactions', 'No transactions yet')
          }
          description={
            hasActiveFilters
              ? t('transactions.tryAdjustingFilters', 'Try adjusting your search query or active filters.')
              : t(
                  'transactions.noTransactionsDesc',
                  'Start tracking your spending and income by recording your first transaction.',
                )
          }
          actionLabel={hasActiveFilters ? t('transactions.clearAll', 'Clear all') : t('transactions.addTransaction', 'Add Transaction')}
          onAction={hasActiveFilters ? clearAllFilters : () => navigate('/transactions/new')}
          className="py-16"
        />
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => (
            <Card key={group.date} className="p-0 overflow-hidden rounded-2xl border-border/60">
              {/* Daily Header with Subtotals */}
              <div className="sticky top-32 z-5 flex items-center justify-between px-4 py-2 bg-surface-elevated/90 backdrop-blur-xs border-b border-border/40 text-xs">
                <span className="font-bold text-text">
                  {formatDayLabel(group.date, todayStr)}
                </span>
                <div className="flex items-center gap-3 font-semibold">
                  {group.dayIncomeMinor > 0 && (
                    <Amount
                      minor={group.dayIncomeMinor}
                      currency={baseCurrency}
                      tone="income"
                      showSign={true}
                      className="text-xs font-bold"
                    />
                  )}
                  {group.dayExpenseMinor > 0 && (
                    <Amount
                      minor={group.dayExpenseMinor}
                      currency={baseCurrency}
                      tone="expense"
                      showSign={true}
                      className="text-xs font-bold text-text"
                    />
                  )}
                </div>
              </div>

              {/* Transactions in this Day */}
              <div className="divide-y divide-border/30 p-1">
                {group.items.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    category={tx.categoryId ? categoryMap.get(tx.categoryId) : undefined}
                    account={accountMap.get(tx.accountId)}
                    toAccount={tx.toAccountId ? accountMap.get(tx.toAccountId) : undefined}
                    isSelectMode={isSelectMode}
                    selected={selectedIds.has(tx.id)}
                    onSelect={toggleSelect}
                  />
                ))}
              </div>
            </Card>
          ))}

          {/* Load More Pagination */}
          {hasMoreDays && (
            <div className="text-center pt-2 pb-6">
              <Button
                variant="outline"
                size="md"
                onClick={() => setVisibleDaysCount((prev) => prev + PAGE_SIZE_DAYS)}
                className="w-full sm:w-auto px-8"
              >
                Load more ({groupedByDay.length - visibleDaysCount} days remaining)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Filter Bottom-Sheet / Modal */}
      <Modal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title={t('transactions.filter', 'Filter Transactions')}
      >
        <div className="space-y-4 py-2">
          <Select
            label={t('transaction.type', 'Type')}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: 'all', label: t('transactions.allTypes', 'All Types') },
              { value: 'expense', label: t('transaction.expense', 'Expense') },
              { value: 'income', label: t('transaction.income', 'Income') },
              { value: 'transfer', label: t('transaction.transfer', 'Transfer') },
              { value: 'adjustment', label: t('transaction.adjustment', 'Adjustment') },
            ]}
          />

          <Select
            label={t('transaction.account', 'Account')}
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            options={[
              { value: 'all', label: t('transactions.allAccounts', 'All Accounts') },
              ...(accounts?.map((a) => ({ value: a.id, label: a.name })) ?? []),
            ]}
          />

          <Select
            label={t('transaction.category', 'Category')}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            options={[
              { value: 'all', label: t('transactions.allCategories', 'All Categories') },
              ...uniqueCategories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />

          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                clearAllFilters()
                setIsFilterModalOpen(false)
              }}
            >
              {t('transactions.clearAll', 'Clear All')}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => setIsFilterModalOpen(false)}
            >
              {t('common.done', 'Done')}
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  )
}
