import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { transactionRepo } from '../../../db/repositories/transactionRepo'
import { useAuthStore } from '../../auth/stores/authStore'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { parseAmountToMinor, formatMoney } from '../../../lib/money'
import { suggestPayees, suggestCategoryForPayee } from '../../../domain/suggestions'
import { checkBudgetThreshold, getEffectiveBudget } from '../../../domain/budgets'
import { periodFor } from '../../../domain/dates'
import { fxService } from '../../fx/services/fxService'
import { Button, Input, Select, Card, Keypad, Badge } from '../../../ui'
import { ArrowLeft, Trash2, Copy, AlertTriangle, Calculator, Sparkles, RefreshCw } from 'lucide-react'
import type { TransactionType } from '@sanchay/shared'

export default function TransactionEditorScreen() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id && id !== 'new')
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.session?.user)
  const { baseCurrency, locale } = useSettingsStore()
  const monthStartDay = useAuthStore((s) => s.profile?.monthStartDay) ?? 1

  // Form fields
  const [type, setType] = useState<TransactionType>('expense')
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
  const [showKeypad, setShowKeypad] = useState(false)
  const [budgetWarning, setBudgetWarning] = useState<string | null>(null)

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
      const minor = existingTx.amountMinor
      setAmountExpr((minor / 100).toString())
      setAccountId(existingTx.accountId)
      setToAccountId(existingTx.toAccountId ?? '')
      setCategoryId(existingTx.categoryId ?? '')
      setOccurredOn(existingTx.occurredOn)
      setPayee(existingTx.payee ?? '')
      setNote(existingTx.note ?? '')
    }
  }, [existingTx])

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

  // Budget threshold warning check (spec F-039)
  useEffect(() => {
    if (type !== 'expense' || !allBudgets || !allTxs) {
      setBudgetWarning(null)
      return
    }

    try {
      const newExpenseMinor = parseAmountToMinor(amountExpr, baseCurrency)
      if (newExpenseMinor <= 0) {
        setBudgetWarning(null)
        return
      }

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
          newExpenseMinor,
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
  }, [type, amountExpr, categoryId, occurredOn, allBudgets, allTxs, isEditing, id, baseCurrency, locale, monthStartDay])

  const handleSave = async (andAddAnother = false) => {
    if (!user || !accountId) return

    let amountMinor = 0
    try {
      amountMinor = parseAmountToMinor(amountExpr, baseCurrency)
    } catch {
      alert(t('transactions.invalidAmount', 'Invalid amount expression'))
      return
    }

    if (amountMinor <= 0) {
      alert(t('transactions.amountGreaterThanZero', 'Amount must be greater than zero'))
      return
    }

    const account = accounts?.find((a) => a.id === accountId)
    const currency = account?.currency ?? baseCurrency
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

  const relevantCategories = (categories ?? []).filter((c) => {
    if (type === 'expense') return c.kind === 'expense'
    if (type === 'income') return c.kind === 'income'
    return false
  })

  return (
    <div className="space-y-5 pb-20 md:pb-8 max-w-xl mx-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text font-medium"
        >
          <ArrowLeft size={16} />
          <span>{t('common.cancel', 'Cancel')}</span>
        </button>

        {isEditing && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleDuplicate} title="Duplicate">
              <Copy size={16} />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDelete} title="Delete">
              <Trash2 size={16} className="text-danger" />
            </Button>
          </div>
        )}
      </div>

      {/* Transaction Type Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-surface-elevated border border-border rounded-xl">
        {(['expense', 'income', 'transfer', 'adjustment'] as TransactionType[]).map((tType) => (
          <button
            key={tType}
            type="button"
            onClick={() => setType(tType)}
            className={`min-h-[40px] text-xs font-semibold rounded-lg capitalize transition-all ${
              type === tType
                ? tType === 'expense'
                  ? 'bg-danger text-white shadow-xs'
                  : tType === 'income'
                  ? 'bg-success text-white shadow-xs'
                  : 'bg-primary text-white shadow-xs'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {t(`transactions.${tType}`, tType)}
          </button>
        ))}
      </div>

      {/* Amount Display & Keypad Toggle */}
      <Card className="p-4 bg-gradient-to-br from-surface-elevated to-surface-overlay/20">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {t('transactions.amount', 'Amount')}
          </span>
          <button
            type="button"
            onClick={() => setShowKeypad(!showKeypad)}
            className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
          >
            <Calculator size={14} />
            <span>{showKeypad ? t('common.hideKeypad', 'Hide Keypad') : t('common.calculator', 'Keypad')}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-text-muted">{baseCurrency}</span>
          <input
            type="text"
            inputMode="decimal"
            value={amountExpr}
            onChange={(e) => setAmountExpr(e.target.value)}
            className="w-full text-3xl font-extrabold text-text bg-transparent border-none outline-none tracking-tight"
            placeholder="0"
          />
        </div>

        {/* Budget Warning Banner (Spec F-039) */}
        {budgetWarning && (
          <div className="mt-3 p-2.5 bg-warning/10 border border-warning/30 rounded-lg flex items-center gap-2 text-warning text-xs font-semibold animate-in fade-in">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{budgetWarning}</span>
          </div>
        )}

        {/* Interactive Keypad */}
        {showKeypad && (
          <div className="mt-4 pt-4 border-t border-border">
            <Keypad
              value={amountExpr}
              onChange={setAmountExpr}
              onConfirm={() => setShowKeypad(false)}
            />
          </div>
        )}
      </Card>

      {/* Main Form Fields */}
      <Card className="p-5 space-y-4">
        {/* Accounts Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label={type === 'transfer' ? t('transactions.fromAccount', 'From Account') : t('accounts.account', 'Account')}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
            options={accounts?.map((a) => ({ value: a.id, label: a.name })) ?? []}
          />

          {type === 'transfer' && (
            <Select
              label={t('transactions.toAccount', 'To Account')}
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              required
              options={
                accounts
                  ?.filter((a) => a.id !== accountId)
                  .map((a) => ({ value: a.id, label: a.name })) ?? []
              }
            />
          )}
        </div>

        {/* Cross-Currency Transfer: Destination Amount */}
        {type === 'transfer' &&
          toAccountId &&
          accounts?.find((a) => a.id === toAccountId)?.currency !==
            accounts?.find((a) => a.id === accountId)?.currency && (
            <Input
              type="text"
              inputMode="decimal"
              label={`Destination Amount (${accounts?.find((a) => a.id === toAccountId)?.currency})`}
              placeholder="Leave blank to auto-calculate with exchange rate"
              value={toAmountExpr}
              onChange={(e) => setToAmountExpr(e.target.value)}
            />
          )}

        {/* Foreign Currency: Manual FX Rate Override */}
        {accounts?.find((a) => a.id === accountId)?.currency &&
          accounts?.find((a) => a.id === accountId)?.currency !== baseCurrency && (
            <Input
              type="text"
              inputMode="decimal"
              label={`Exchange Rate (1 ${accounts?.find((a) => a.id === accountId)?.currency} = X ${baseCurrency})`}
              placeholder="1.0"
              value={customFxRate}
              onChange={(e) => setCustomFxRate(e.target.value)}
              helperText="Auto-computed from cached rates. You can manually adjust this rate."
            />
          )}

        {/* Category Picker (for income/expense) */}
        {(type === 'expense' || type === 'income') && (
          <Select
            label={t('categories.category', 'Category')}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={[
              { value: '', label: t('common.selectCategory', '-- Select Category --') },
              ...relevantCategories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        )}

        {/* Date */}
        <Input
          type="date"
          label={t('common.date', 'Date')}
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          required
        />

        {/* Payee with Autocomplete Suggestions */}
        <div className="space-y-1.5">
          <Input
            label={type === 'income' ? t('transactions.payer', 'Payer / Source') : t('transactions.payee', 'Payee / Merchant')}
            placeholder="e.g. Swiggy, Amazon, Salary"
            value={payee}
            onChange={(e) => handlePayeeChange(e.target.value)}
          />
          {payeeSuggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-text-muted flex items-center gap-1">
                <Sparkles size={12} /> {t('common.suggested', 'Suggested:')}
              </span>
              {payeeSuggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => handlePayeeChange(sug)}
                  className="text-xs px-2 py-0.5 rounded-full bg-surface-overlay text-text hover:bg-primary/20 hover:text-primary transition-colors font-medium"
                >
                  {sug}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Note */}
        <Input
          label={t('common.note', 'Note (Optional)')}
          placeholder={t('transactions.notePlaceholder', 'Add remarks or details...')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-muted uppercase tracking-wider block">
              {t('transactions.tags', 'Tags')}
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
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-border bg-surface-elevated text-text-muted hover:text-text'
                    }`}
                  >
                    #{tg.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        {!isEditing && (
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => handleSave(true)}
          >
            {t('transactions.saveAndAddAnother', 'Save & Add Another')}
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          className="flex-1"
          onClick={() => handleSave(false)}
        >
          {isEditing ? t('common.update', 'Update') : t('common.save', 'Save')}
        </Button>
      </div>
    </div>
  )
}
