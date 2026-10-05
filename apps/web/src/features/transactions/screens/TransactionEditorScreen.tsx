import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { transactionRepo } from '../../../db/repositories/transactionRepo'
import { categoryRepo } from '../../../db/repositories/categoryRepo'
import { useAuthStore } from '../../auth/stores/authStore'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { parseAmountToMinor, formatMoney, minorToDecimalString } from '../../../lib/money'
import { suggestPayees, suggestCategoryForPayee } from '../../../domain/suggestions'
import { checkBudgetThreshold, getEffectiveBudget } from '../../../domain/budgets'
import { periodFor } from '../../../domain/dates'
import { fxService } from '../../fx/services/fxService'
import { useFxRatesMap } from '../../fx/hooks/useFxRatesMap'
import {
  Page,
  PageHeader,
  Button,
  Input,
  Select,
  Card,
  Keypad,
  SegmentedControl,
  CategoryIcon,
  toast,
} from '../../../ui'
import {
  Trash2,
  Copy,
  AlertTriangle,
  Calculator,
  Sparkles,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { TransactionType, Category, Account } from '@sanchay/shared'
import { cn } from '../../../lib/cn'

export default function TransactionEditorScreen() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id && id !== 'new')
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.session?.user)
  const { baseCurrency, locale } = useSettingsStore()
  const monthStartDay = useAuthStore((s) => s.profile?.monthStartDay) ?? 1

  // Form fields
  const [type, setType] = useState<TransactionType>(() => {
    const q = searchParams.get('type')
    return q === 'income' || q === 'transfer' || q === 'adjustment' ? q : 'expense'
  })
  const [amountExpr, setAmountExpr] = useState('0')
  const [toAmountExpr, setToAmountExpr] = useState('')
  const [customFxRate, setCustomFxRate] = useState('1')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().substring(0, 10))
  const [payee, setPayee] = useState('')
  const [note, setNote] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [showKeypad, setShowKeypad] = useState(true)
  const [isNoteExpanded, setIsNoteExpanded] = useState(false)
  const [budgetWarning, setBudgetWarning] = useState<string | null>(null)

  const todayStr = useMemo(() => new Date().toISOString().substring(0, 10), [])
  const yesterdayStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().substring(0, 10)
  }, [])

  // DB queries
  const existingTx = useLiveQuery(() => (isEditing && id ? db.transactions.get(id) : undefined), [
    isEditing,
    id,
  ])
  const existingTags = useLiveQuery(
    () => (isEditing && id ? transactionRepo.getTagsForTransaction(id) : []),
    [isEditing, id],
  )
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).sortBy('sortOrder'), [])
  const categories = useLiveQuery(() => db.categories.filter((c) => !c.deletedAt).sortBy('sortOrder'), [])
  const tags = useLiveQuery(() => db.tags.filter((t) => !t.deletedAt).toArray(), [])
  const allTxs = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])
  const allBudgets = useLiveQuery(() => db.budgets.filter((b) => !b.deletedAt).toArray(), [])

  // Initialize form when editing
  useEffect(() => {
    if (existingTx) {
      setType(existingTx.type)
      const txAccount = accounts?.find((a) => a.id === existingTx.accountId)
      const txCurr = txAccount?.currency ?? baseCurrency
      setAmountExpr(minorToDecimalString(existingTx.amountMinor, txCurr))
      setAccountId(existingTx.accountId)
      setToAccountId(existingTx.toAccountId ?? '')
      setCategoryId(existingTx.categoryId ?? '')
      setOccurredOn(existingTx.occurredOn)
      setPayee(existingTx.payee ?? '')
      setNote(existingTx.note ?? '')
      if (existingTx.note) setIsNoteExpanded(true)
    }
  }, [existingTx, accounts, baseCurrency])

  useEffect(() => {
    if (existingTags) {
      setSelectedTagIds(existingTags)
    }
  }, [existingTags])

  // Default account selection for new transaction
  useEffect(() => {
    if (!isEditing && accounts && accounts.length > 0 && !accountId) {
      setAccountId(accounts[0]!.id)
    }
  }, [isEditing, accounts, accountId])

  // Payee autocomplete suggestions
  const payeeSuggestions = useMemo(() => {
    if (!allTxs || !payee.trim() || payee.length < 2) return []
    return suggestPayees(allTxs, payee, 4)
  }, [allTxs, payee])

  // Smart category suggestion when typing payee
  const handlePayeeChange = (value: string) => {
    setPayee(value)
    if (allTxs && value.trim().length >= 2 && !categoryId) {
      const suggestions = suggestCategoryForPayee(allTxs, value)
      if (suggestions.length > 0) {
        setCategoryId(suggestions[0]!.categoryId)
      }
    }
  }

  // Currency resolution: follows active account currency, falls back to baseCurrency
  const activeAccount = accounts?.find((a) => a.id === accountId)
  const txCurrency = activeAccount?.currency ?? baseCurrency
  const { convertToSync } = useFxRatesMap()

  // Budget threshold warning check (spec F-039)
  useEffect(() => {
    if (type !== 'expense' || !allBudgets || !allTxs) {
      setBudgetWarning(null)
      return
    }

    try {
      const newExpenseMinor = parseAmountToMinor(amountExpr, txCurrency)
      if (newExpenseMinor <= 0) {
        setBudgetWarning(null)
        return
      }

      // Convert expense to baseCurrency before checking against monthly budget
      const newExpenseInBase = convertToSync(newExpenseMinor, txCurrency, baseCurrency)

      const targetMonth = occurredOn.substring(0, 7)
      const effective = getEffectiveBudget(allBudgets, categoryId || null, targetMonth)

      if (effective && effective.amountMinor > 0) {
        const { start, end } = periodFor(occurredOn, monthStartDay)
        const spentBeforeMinor = allTxs
          .filter((tx) => {
            if (tx.deletedAt || tx.type !== 'expense') return false
            if (tx.occurredOn < start || tx.occurredOn > end) return false
            if (categoryId && tx.categoryId !== categoryId) return false
            if (isEditing && tx.id === id) return false
            return true
          })
          .reduce((sum, tx) => sum + (tx.baseAmountMinor ?? tx.amountMinor), 0)

        const threshold = checkBudgetThreshold(
          spentBeforeMinor,
          newExpenseInBase,
          effective.amountMinor,
          effective.alertThresholds ?? [80, 100],
        )

        if (threshold) {
          setBudgetWarning(
            `This expense crosses your ${threshold}% budget limit (${formatMoney(
              effective.amountMinor,
              baseCurrency,
              locale,
            )})!`,
          )
        } else {
          setBudgetWarning(null)
        }
      } else {
        setBudgetWarning(null)
      }
    } catch {
      setBudgetWarning(null)
    }
  }, [type, amountExpr, categoryId, occurredOn, allBudgets, allTxs, isEditing, id, txCurrency, baseCurrency, locale, monthStartDay, convertToSync])

  const handleSave = async (andAddAnother = false) => {
    if (!user || !accountId) return

    let amountMinor = 0
    try {
      amountMinor = parseAmountToMinor(amountExpr, txCurrency)
    } catch {
      toast.error(t('transactions.invalidAmount', 'Invalid amount expression'))
      return
    }

    if (amountMinor <= 0) {
      toast.error(t('transactions.amountGreaterThanZero', 'Amount must be greater than zero'))
      return
    }

    const account = accounts?.find((a) => a.id === accountId)
    const currency = txCurrency
    const toAccount = accounts?.find((a) => a.id === toAccountId)

    // Calculate baseAmountMinor and FX rate
    const { baseAmountMinor, rateUsed } = await fxService.convert(
      amountMinor,
      currency,
      baseCurrency,
      occurredOn,
      customFxRate !== '1' ? customFxRate : undefined,
    )

    let finalToAmountMinor: number | null = null
    if (type === 'transfer' && toAccount) {
      if (toAmountExpr.trim()) {
        finalToAmountMinor = parseAmountToMinor(toAmountExpr, toAccount.currency)
      } else if (toAccount.currency !== currency) {
        const converted = await fxService.convert(amountMinor, currency, toAccount.currency, occurredOn)
        finalToAmountMinor = converted.baseAmountMinor
      } else {
        finalToAmountMinor = amountMinor
      }
    }

    if (isEditing && id) {
      await transactionRepo.update(
        id,
        {
          type,
          accountId,
          toAccountId: type === 'transfer' ? toAccountId || null : null,
          amountMinor,
          toAmountMinor: finalToAmountMinor,
          baseAmountMinor,
          fxRate: rateUsed,
          occurredOn,
          categoryId: type === 'expense' || type === 'income' ? categoryId || null : null,
          payee: payee.trim() || null,
          note: note.trim() || null,
        },
        selectedTagIds,
      )
      navigate('/transactions')
    } else {
      await transactionRepo.create({
        userId: user.id,
        type,
        accountId,
        toAccountId: type === 'transfer' ? toAccountId || null : null,
        amountMinor,
        toAmountMinor: finalToAmountMinor,
        baseAmountMinor,
        fxRate: rateUsed,
        occurredOn,
        occurredTime: null,
        categoryId: type === 'expense' || type === 'income' ? categoryId || null : null,
        payee: payee.trim() || null,
        note: note.trim() || null,
        paymentMethod: null,
        adjustmentSign: null,
        recurringRuleId: null,
        recurringOccurrenceDate: null,
        source: 'manual',
        tagIds: selectedTagIds,
      })

      if (andAddAnother) {
        setAmountExpr('0')
        setToAmountExpr('')
        setPayee('')
        setNote('')
        setBudgetWarning(null)
      } else {
        navigate('/transactions')
      }
    }
  }

  const handleDelete = async () => {
    if (id && window.confirm(t('transactions.deleteConfirm', 'Delete this transaction?'))) {
      await transactionRepo.delete(id)
      navigate('/transactions')
    }
  }

  const handleDuplicate = async () => {
    if (id) {
      await transactionRepo.duplicate(id)
      navigate('/transactions')
    }
  }

  const relevantCategories = useMemo(() => {
    if (!categories) return []
    const seen = new Set<string>()
    const list: Category[] = []
    for (const c of categories) {
      if (user?.id && c.userId && c.userId !== user.id) continue
      if (type === 'expense' && c.kind !== 'expense') continue
      if (type === 'income' && c.kind !== 'income') continue
      const norm = c.name.trim().toLowerCase()
      if (!seen.has(norm)) {
        seen.add(norm)
        list.push(c)
      }
    }
    return list
  }, [categories, type, user?.id])

  // Currency symbol via narrowSymbol (P1-H)
  const currencySymbol = useMemo(() => {
    try {
      const parts = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: txCurrency,
        currencyDisplay: 'narrowSymbol',
      }).formatToParts(0)
      const sym = parts.find((p) => p.type === 'currency')?.value
      return sym || txCurrency
    } catch {
      return txCurrency
    }
  }, [txCurrency, locale])

  // Approximate base amount conversion when account currency differs from base
  const approxBaseAmountMinor = useMemo(() => {
    if (txCurrency === baseCurrency || !amountExpr) return null
    try {
      const minor = parseAmountToMinor(amountExpr, txCurrency)
      return convertToSync(minor, txCurrency, baseCurrency)
    } catch {
      return null
    }
  }, [amountExpr, txCurrency, baseCurrency, convertToSync])

  const handleCancel = () => {
    if (location.key === 'default' || (window.history.state && window.history.state.idx === 0)) {
      navigate('/transactions', { replace: true })
    } else {
      navigate(-1)
    }
  }

  return (
    <Page width="narrow" className="max-w-3xl space-y-6 pb-28">
      {/* Header */}
      <PageHeader
        title={isEditing ? t('nav.editTransaction', 'Edit Transaction') : t('nav.newTransaction', 'New Transaction')}
        backTo="/transactions"
        actions={
          isEditing ? (
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDuplicate}
                title={t('transaction.duplicate', 'Duplicate')}
              >
                <Copy size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                title={t('transaction.delete', 'Delete')}
              >
                <Trash2 size={16} className="text-danger" />
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Main Grid: Left = Amount & Type & Keypad; Right = Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (Amount, Type, Keypad) */}
        <div className="lg:col-span-6 space-y-5">
          {/* Transaction Type SegmentedControl */}
          <SegmentedControl
            options={[
              { value: 'expense', label: t('transaction.expense', 'Expense') },
              { value: 'income', label: t('transaction.income', 'Income') },
              { value: 'transfer', label: t('transaction.transfer', 'Transfer') },
            ]}
            value={type}
            onChange={(val) => setType(val as TransactionType)}
          />

          {/* Hero Amount Display Card */}
          <Card
            variant="hero"
            className="p-5 sm:p-6 text-center space-y-2 relative overflow-hidden"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-text-muted">
              <span>{t('transaction.amount', 'Amount')}</span>
              <button
                type="button"
                onClick={() => setShowKeypad(!showKeypad)}
                className="flex items-center gap-1 text-primary hover:underline font-medium"
              >
                <Calculator size={14} />
                <span>{showKeypad ? t('transactions.hideKeypad', 'Hide Keypad') : t('transactions.showKeypad', 'Show Keypad')}</span>
              </button>
            </div>

            {/* Centered baseline row: symbol + auto-expanding input */}
            <div className="flex items-baseline justify-center gap-2 py-3">
              <span className="text-3xl font-semibold text-text-muted leading-none select-none">
                {currencySymbol}
              </span>
              <input
                type="text"
                inputMode="decimal"
                data-testid="tx-amount-input"
                aria-label={`Amount in ${txCurrency}`}
                value={amountExpr}
                onChange={(e) => setAmountExpr(e.target.value)}
                style={{ width: `${Math.min(14, Math.max(2, (amountExpr || '0').length + 1))}ch` }}
                className="text-5xl font-extrabold tabular-nums text-text bg-transparent border-none outline-none tracking-tight leading-none text-left"
                placeholder="0"
              />
            </div>

            {/* Approximate base currency line when tx currency != base currency */}
            {txCurrency !== baseCurrency && (
              <div className="flex items-center justify-center gap-2 text-xs text-text-muted pb-1">
                <span className="px-1.5 py-0.5 rounded bg-surface-overlay text-[10px] font-mono font-semibold uppercase">
                  {txCurrency}
                </span>
                {approxBaseAmountMinor !== null && (
                  <span>
                    ≈ {formatMoney(approxBaseAmountMinor, baseCurrency, locale)} at today&apos;s rate
                  </span>
                )}
              </div>
            )}

            {/* Budget Warning Banner (Spec F-039) */}
            {budgetWarning && (
              <div className="mt-2 p-2.5 bg-danger/10 border border-danger/30 rounded-xl flex items-center gap-2 text-danger text-xs font-semibold animate-in fade-in">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{budgetWarning}</span>
              </div>
            )}

            {/* Interactive Keypad */}
            {showKeypad && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <Keypad
                  value={amountExpr}
                  onChange={setAmountExpr}
                  onConfirm={() => setShowKeypad(false)}
                />
              </div>
            )}
          </Card>
        </div>

        {/* Right Column (Details: Category, Account, Date, Payee, Note, Tags) */}
        <div className="lg:col-span-6 space-y-5">
          {/* Category Icon Grid (for expense & income) */}
          {(type === 'expense' || type === 'income') && (
            <Card className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {t('transaction.category', 'Category')}
                </label>
                {categoryId && (
                  <span className="text-xs font-bold text-primary">
                    {categories?.find((c) => c.id === categoryId)?.name}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2.5 max-h-56 overflow-y-auto no-scrollbar pr-0.5">
                {relevantCategories.map((cat) => {
                  const isSelected = categoryId === cat.id
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryId(cat.id)}
                      className={cn(
                        'flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-150',
                        'hover:bg-surface-overlay active:scale-95 border focus:outline-none focus:ring-2 focus:ring-primary/40',
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-xs'
                          : 'border-transparent bg-surface-overlay/40',
                      )}
                    >
                      <CategoryIcon
                        icon={cat.icon}
                        color={cat.color}
                        size="md"
                      />
                      <span className="text-[11px] font-medium text-text truncate max-w-full mt-1.5 leading-tight">
                        {cat.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Accounts Selector (Cards / Chips) */}
          <Card className="p-4 sm:p-5 space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-text-muted block">
              {type === 'transfer' ? t('transactions.fromAccount', 'From Account') : t('transaction.account', 'Account')}
            </label>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {accounts?.map((acc) => {
                const isSelected = accountId === acc.id
                return (
                  <button
                    key={acc.id}
                    type="button"
                    data-testid={`from-account-${acc.id}`}
                    onClick={() => setAccountId(acc.id)}
                    className={cn(
                      'shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all',
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary shadow-xs'
                        : 'border-border bg-surface-elevated text-text hover:bg-surface-overlay',
                    )}
                  >
                    <span>{acc.name}</span>
                    <span className="text-[10px] text-text-muted font-normal uppercase">
                      {acc.currency}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* To Account (if Transfer) */}
            {type === 'transfer' && (
              <div className="pt-3 border-t border-border/40 space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-text-muted block">
                  {t('transactions.toAccount', 'To Account')}
                </label>
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                  {accounts
                    ?.filter((a) => a.id !== accountId)
                    .map((acc) => {
                      const isSelected = toAccountId === acc.id
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          data-testid={`to-account-${acc.id}`}
                          onClick={() => setToAccountId(acc.id)}
                          className={cn(
                            'shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all',
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary shadow-xs'
                              : 'border-border bg-surface-elevated text-text hover:bg-surface-overlay',
                          )}
                        >
                          <span>{acc.name}</span>
                          <span className="text-[10px] text-text-muted font-normal uppercase">
                            {acc.currency}
                          </span>
                        </button>
                      )
                    })}
                </div>
              </div>
            )}
          </Card>

          {/* Date with Quick Chips */}
          <Card className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                {t('transaction.date', 'Date')}
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setOccurredOn(todayStr)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                    occurredOn === todayStr
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border bg-surface-elevated text-text hover:bg-surface-overlay',
                  )}
                >
                  {t('common.today', 'Today')}
                </button>
                <button
                  type="button"
                  onClick={() => setOccurredOn(yesterdayStr)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                    occurredOn === yesterdayStr
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border bg-surface-elevated text-text hover:bg-surface-overlay',
                  )}
                >
                  {t('common.yesterday', 'Yesterday')}
                </button>
              </div>
            </div>

            <Input
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              className="h-10 text-sm"
              required
            />
          </Card>

          {/* Payee with Autocomplete Suggestions */}
          <Card className="p-4 sm:p-5 space-y-2.5">
            <Input
              label={type === 'income' ? t('transactions.payer', 'Payer / Source') : t('transaction.payee', 'Payee / Merchant')}
              placeholder="e.g. Swiggy, Amazon, Salary"
              value={payee}
              onChange={(e) => handlePayeeChange(e.target.value)}
              className="h-10 text-sm"
            />
            {payeeSuggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] text-text-muted flex items-center gap-1">
                  <Sparkles size={12} /> {t('common.suggested', 'Suggested:')}
                </span>
                {payeeSuggestions.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => handlePayeeChange(sug)}
                    className="text-xs px-2.5 py-0.5 rounded-full bg-surface-overlay text-text hover:bg-primary/20 hover:text-primary transition-colors font-medium"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Note & Tags Collapsible Card */}
          <Card className="p-4 sm:p-5 space-y-3">
            <button
              type="button"
              onClick={() => setIsNoteExpanded(!isNoteExpanded)}
              className="w-full flex items-center justify-between text-xs font-semibold text-text-muted hover:text-text transition-colors"
            >
              <span>{t('transaction.note', 'Note & Tags')}</span>
              {isNoteExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {isNoteExpanded && (
              <div className="space-y-4 pt-2 border-t border-border/40 animate-in fade-in duration-150">
                <Input
                  label={t('common.note', 'Note (Optional)')}
                  placeholder={t('transactions.notePlaceholder', 'Add remarks or details…')}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />

                {tags && tags.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-muted uppercase tracking-wider block">
                      {t('transaction.tags', 'Tags')}
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tg) => {
                        const isSelected = selectedTagIds.includes(tg.id)
                        return (
                          <button
                            key={tg.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTagIds(selectedTagIds.filter((tid) => tid !== tg.id))
                              } else {
                                setSelectedTagIds([...selectedTagIds, tg.id])
                              }
                            }}
                            className={cn(
                              'text-xs px-2.5 py-1 rounded-full border transition-all',
                              isSelected
                                ? 'border-primary bg-primary/10 text-primary font-semibold'
                                : 'border-border bg-surface-elevated text-text-muted hover:text-text',
                            )}
                          >
                            #{tg.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Sticky Bottom Save Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur-md border-t border-border/60 p-4 z-40 shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none sm:w-32"
            onClick={() => navigate('/transactions')}
          >
            {t('common.cancel', 'Cancel')}
          </Button>

          {!isEditing && (
            <Button
              type="button"
              variant="secondary"
              className="hidden sm:inline-flex flex-1"
              onClick={() => handleSave(true)}
            >
              {t('transaction.saveAndAddAnother', 'Save & Add Another')}
            </Button>
          )}

          <Button
            type="button"
            variant="primary"
            data-testid="tx-save"
            className="flex-2 sm:flex-1"
            onClick={() => handleSave(false)}
          >
            {isEditing ? t('common.saveChanges', 'Save Changes') : t('common.save', 'Save')}
          </Button>
        </div>
      </div>
    </Page>
  )
}
