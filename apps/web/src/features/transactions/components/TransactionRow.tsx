import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Transaction, Category, Account } from '@sanchay/shared'
import { CategoryIcon, Amount } from '../../../ui'
import { ArrowRight, Check } from 'lucide-react'
import { cn } from '../../../lib/cn'

export interface TransactionRowProps {
  transaction: Transaction
  category?: Category | undefined
  account?: Account | undefined
  toAccount?: Account | undefined
  selected?: boolean | undefined
  isSelectMode?: boolean | undefined
  onSelect?: ((id: string, selected: boolean) => void) | undefined
  onClick?: (() => void) | undefined
  showDate?: boolean | undefined
  className?: string | undefined
}

export function TransactionRow({
  transaction,
  category,
  account,
  toAccount,
  selected = false,
  isSelectMode = false,
  onSelect,
  onClick,
  showDate = false,
  className,
}: TransactionRowProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const isIncome = transaction.type === 'income'
  const isExpense = transaction.type === 'expense'
  const isTransfer = transaction.type === 'transfer'
  const isAdjustment = transaction.type === 'adjustment'

  const tone = isIncome
    ? 'income'
    : isExpense
    ? 'expense'
    : isTransfer
    ? 'muted'
    : transaction.adjustmentSign === '+'
    ? 'income'
    : 'expense'

  const title =
    transaction.payee?.trim() ||
    category?.name ||
    (isTransfer
      ? t('transaction.transfer', 'Transfer')
      : isAdjustment
      ? t('transaction.adjustment', 'Adjustment')
      : t('common.unspecified', 'Unspecified'))

  const subtitleParts: string[] = []
  if (isTransfer) {
    const fromName = account?.name || t('common.unspecified', 'Account')
    const toName = toAccount?.name || t('common.unspecified', 'Account')
    subtitleParts.push(`${fromName} → ${toName}`)
  } else if (account?.name) {
    subtitleParts.push(account.name)
  }

  if (category?.name && transaction.payee?.trim()) {
    subtitleParts.push(category.name)
  }

  if (transaction.note?.trim()) {
    subtitleParts.push(transaction.note.trim())
  }

  const handleClick = (e: React.MouseEvent) => {
    if (isSelectMode) {
      e.preventDefault()
      onSelect?.(transaction.id, !selected)
      return
    }
    if (onClick) {
      onClick()
    } else {
      navigate(`/transactions/${transaction.id}`)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick(e as unknown as React.MouseEvent)
        }
      }}
      className={cn(
        'group flex items-center justify-between gap-3 px-3 py-3 rounded-xl transition-all duration-150',
        'hover:bg-surface-elevated/80 active:scale-[0.99] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40',
        selected && 'bg-primary/10 hover:bg-primary/15',
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {isSelectMode && (
          <button
            type="button"
            aria-label={selected ? 'Deselect transaction' : 'Select transaction'}
            onClick={(e) => {
              e.stopPropagation()
              onSelect?.(transaction.id, !selected)
            }}
            className={cn(
              'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors focus:outline-none focus:ring-1 focus:ring-primary',
              selected
                ? 'bg-primary border-primary text-white'
                : 'border-border bg-surface hover:border-primary',
            )}
          >
            {selected && <Check size={14} className="stroke-[3]" />}
          </button>
        )}

        <div className="shrink-0">
          {isTransfer ? (
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <ArrowRight size={18} />
            </div>
          ) : (
            <CategoryIcon
              icon={category?.icon}
              color={category?.color}
              size="md"
            />
          )}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-text truncate leading-snug">
            {title}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-text-muted truncate mt-0.5">
            {showDate && (
              <>
                <span>{transaction.occurredOn}</span>
                {subtitleParts.length > 0 && <span>•</span>}
              </>
            )}
            <span className="truncate">{subtitleParts.join(' • ')}</span>
          </div>
        </div>
      </div>

      <div className="text-right shrink-0">
        <Amount
          minor={transaction.amountMinor}
          currency={account?.currency}
          tone={tone}
          showSign={true}
          className="text-sm font-bold block"
        />
      </div>
    </div>
  )
}
