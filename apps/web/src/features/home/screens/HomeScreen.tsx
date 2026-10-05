import React, { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { useAuthStore } from '../../auth/stores/authStore'
import { periodFor, addOneMonth } from '../../../domain/dates'
import { accountBalance, balanceOn, netWorth } from '../../../domain/balance'
import { calculatePeriodSummary } from '../../../domain/reports'
import { calculateGoalProgress } from '../../../domain/goals'
import { occurrences } from '../../../domain/recurrence'
import { formatDayLabel } from '../../../lib/formatDayLabel'
import { formatMoney } from '../../../lib/money'
import { useFxRatesMap } from '../../fx/hooks/useFxRatesMap'
import {
  Page,
  Card,
  CardTitle,
  Button,
  Badge,
  Amount,
  AnimatedNumber,
  Sparkline,
  ProgressRing,
  SkeletonCard,
} from '../../../ui'
import { TransactionRow } from '../../transactions'
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Eye,
  EyeOff,
  Plus,
  Minus,
  ArrowLeftRight,
  Target,
  Receipt,
  Wallet,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react'
import type { RecurringRule, Account, Category } from '@sanchay/shared'

export default function HomeScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hideBalances, setHideBalances, baseCurrency, locale } = useSettingsStore()
  const profile = useAuthStore((s) => s.profile)
  const monthStartDay = profile?.monthStartDay ?? 1

  const todayStr = useMemo(() => new Date().toISOString().substring(0, 10), [])
  const next30DaysStr = useMemo(() => addOneMonth(todayStr), [todayStr])
  const { start: monthStart, end: monthEnd } = useMemo(
    () => periodFor(todayStr, monthStartDay),
    [todayStr, monthStartDay],
  )

  // Reactive Dexie queries
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).sortBy('sortOrder'), [])
  const transactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])
  const budgets = useLiveQuery(() => db.budgets.filter((b) => !b.deletedAt).toArray(), [])
  const categories = useLiveQuery(() => db.categories.filter((c) => !c.deletedAt).toArray(), [])
  const goals = useLiveQuery(() => db.goals.filter((g) => !g.deletedAt).toArray(), [])
  const goalContributions = useLiveQuery(
    () => db.goalContributions.filter((c) => !c.deletedAt).toArray(),
    [],
  )
  const recurringRules = useLiveQuery(
    () => db.recurringRules.filter((r) => !r.deletedAt).toArray(),
    [],
  )
  const recurringOverrides = useLiveQuery(
    () => db.recurringOverrides.filter((o) => !o.deletedAt).toArray(),
    [],
  )

  const isLoading = accounts === undefined || transactions === undefined

  // Category and Account lookup maps
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    categories?.forEach((c) => map.set(c.id, c))
    return map
  }, [categories])

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>()
    accounts?.forEach((a) => map.set(a.id, a))
    return map
  }, [accounts])

  // Multi-currency FX conversion for Net Worth
  const { convertToSync, hasRates } = useFxRatesMap()

  const getBaseAmount = (minor: number, currency: string) => {
    return convertToSync(minor, currency, baseCurrency)
  }

  // Net worth calculation
  const nw = useMemo(() => {
    if (!accounts || !transactions) return { assets: 0, liabilities: 0, netWorth: 0 }
    return netWorth(accounts, transactions, getBaseAmount)
  }, [accounts, transactions, convertToSync, baseCurrency])

  // 30-day Net worth history for Sparkline
  const last30Days = useMemo(() => {
    const dates: string[] = []
    const d = new Date()
    for (let i = 29; i >= 0; i--) {
      const cur = new Date(d)
      cur.setDate(d.getDate() - i)
      dates.push(cur.toISOString().substring(0, 10))
    }
    return dates
  }, [])

  const sparklineData = useMemo(() => {
    if (!accounts || !transactions) return []
    return last30Days.map((date) => {
      let total = 0
      for (const acc of accounts) {
        if (acc.archivedAt || acc.excludeFromNetWorth) continue
        const bal = balanceOn(acc, transactions, date)
        const baseBal = convertToSync(bal, acc.currency, baseCurrency)
        if (['credit_card', 'loan', 'other_liability'].includes(acc.kind)) {
          total -= Math.abs(baseBal)
        } else {
          total += baseBal
        }
      }
      return total
    })
  }, [accounts, transactions, last30Days, convertToSync, baseCurrency])

  // Net worth delta (this month's net savings or 30-day delta)
  const nwDeltaMinor = useMemo(() => {
    if (sparklineData.length < 2) return 0
    const startVal = sparklineData[0] !== undefined ? sparklineData[0] : nw.netWorth
    return nw.netWorth - startVal
  }, [sparklineData, nw.netWorth])

  // This month's summary
  const summary = useMemo(() => {
    if (!transactions)
      return {
        incomeMinor: 0,
        expenseMinor: 0,
        netSavingsMinor: 0,
        savingsRatePercent: 0,
        transactionCount: 0,
      }
    return calculatePeriodSummary(transactions, monthStart, monthEnd)
  }, [transactions, monthStart, monthEnd])

  // Safe to spend calculation
  const safeToSpend = useMemo(() => {
    if (!budgets || budgets.length === 0 || !transactions) return null

    const totalBudgetMinor = budgets.reduce((sum, b) => sum + b.amountMinor, 0)
    const budgetCategoryIds = new Set(budgets.map((b) => b.categoryId))

    // Total expenses in budgeted categories during this period
    const spentMinor = transactions
      .filter(
        (tx) =>
          tx.type === 'expense' &&
          tx.occurredOn >= monthStart &&
          tx.occurredOn <= monthEnd &&
          tx.categoryId &&
          budgetCategoryIds.has(tx.categoryId),
      )
      .reduce((sum, tx) => sum + tx.amountMinor, 0)

    const remainingBudgetMinor = Math.max(0, totalBudgetMinor - spentMinor)

    // Calculate days left in current period
    const today = new Date(todayStr)
    const end = new Date(monthEnd)
    const diffTime = end.getTime() - today.getTime()
    const daysLeft = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1)

    const dailyMinor = Math.round(remainingBudgetMinor / daysLeft)

    return {
      dailyMinor,
      remainingBudgetMinor,
      totalBudgetMinor,
      daysLeft,
      percentRemaining:
        totalBudgetMinor > 0 ? Math.round((remainingBudgetMinor / totalBudgetMinor) * 100) : 0,
    }
  }, [budgets, transactions, todayStr, monthStart, monthEnd])

  // Upcoming bills in next 30 days
  const upcomingBills = useMemo(() => {
    if (!recurringRules || !recurringOverrides || !transactions) return []

    const items: Array<{
      rule: RecurringRule
      occurrenceDate: string
      isOverdue: boolean
      amountMinor: number
    }> = []

    for (const rule of recurringRules) {
      const ruleOverrides = recurringOverrides.filter((o) => o.ruleId === rule.id)
      const dates = occurrences(rule, rule.startDate, next30DaysStr, ruleOverrides)

      for (const d of dates) {
        const override = ruleOverrides.find((o) => o.occurrenceDate === d)
        if (override?.action === 'skip') continue

        const isPaid = transactions.some(
          (tx) => tx.recurringRuleId === rule.id && tx.recurringOccurrenceDate === d,
        )
        if (isPaid) continue

        const amountMinor =
          override?.action === 'amount_changed' && override.newAmountMinor
            ? override.newAmountMinor
            : rule.amountMinor

        items.push({
          rule,
          occurrenceDate: d,
          isOverdue: d < todayStr,
          amountMinor,
        })
      }
    }

    return items.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate)).slice(0, 5)
  }, [recurringRules, recurringOverrides, transactions, next30DaysStr, todayStr])

  // Recent transactions (last 6)
  const recentTransactions = useMemo(() => {
    if (!transactions) return []
    return [...transactions]
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6)
  }, [transactions])

  // Greeting logic
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    let timeKey = 'goodMorning'
    if (hour >= 12 && hour < 17) timeKey = 'goodAfternoon'
    else if (hour >= 17) timeKey = 'goodEvening'

    const greetingText = t(`home.${timeKey}`, 'Good day')
    const firstName = profile?.displayName ? profile.displayName.split(' ')[0] : ''
    return firstName ? `${greetingText}, ${firstName}` : greetingText
  }, [t, profile?.displayName])

  const formattedDate = useMemo(() => {
    try {
      const now = new Date()
      return new Intl.DateTimeFormat(locale || 'en-IN', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }).format(now)
    } catch {
      return todayStr
    }
  }, [locale, todayStr])

  if (isLoading) {
    return (
      <Page width="wide" className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-surface-elevated animate-pulse rounded-lg" />
            <div className="h-4 w-32 bg-surface-elevated animate-pulse rounded-md" />
          </div>
          <div className="h-10 w-10 bg-surface-elevated animate-pulse rounded-xl" />
        </div>
        <SkeletonCard className="h-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SkeletonCard className="h-28" />
          <SkeletonCard className="h-28" />
          <SkeletonCard className="h-28" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-4">
            <SkeletonCard className="h-72" />
          </div>
          <div className="lg:col-span-4 space-y-4">
            <SkeletonCard className="h-44" />
            <SkeletonCard className="h-44" />
          </div>
        </div>
      </Page>
    )
  }

  return (
    <Page width="wide" className="space-y-6">
      {/* 1. Header: Greeting, Date & Hide-Balances Toggle */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text">
            {greeting}
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-0.5">{formattedDate}</p>
        </div>

        <button
          type="button"
          onClick={() => setHideBalances(!hideBalances)}
          aria-label={hideBalances ? t('settings.hideBalances') : t('settings.hideBalances')}
          title={hideBalances ? 'Show balances' : 'Hide balances'}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-text-muted hover:text-text bg-surface-elevated/70 hover:bg-surface-elevated border border-border/40 transition-colors text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {hideBalances ? (
            <>
              <EyeOff size={16} />
              <span className="hidden sm:inline">Hidden</span>
            </>
          ) : (
            <>
              <Eye size={16} />
              <span className="hidden sm:inline">Visible</span>
            </>
          )}
        </button>
      </div>

      {/* 2. Main 12-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): Hero Card, Quick Actions, This Month Stats, Recent Transactions */}
        <div className="lg:col-span-8 space-y-6">
          {/* Hero Card */}
          <Card
            variant="hero"
            className="relative overflow-hidden p-6 sm:p-7 rounded-3xl"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted block">
                  {t('home.totalNetWorth', 'Total Net Worth')}
                </span>
                <div className="mt-1 flex items-baseline gap-3">
                  {hideBalances ? (
                    <span className="text-display text-text">••••••</span>
                  ) : (
                    <AnimatedNumber
                      value={nw.netWorth}
                      formatFn={(val) => formatMoney(val, baseCurrency, locale)}
                      className="text-display font-extrabold text-text tracking-tight"
                    />
                  )}

                  {nwDeltaMinor !== 0 && !hideBalances && (
                    <Badge
                      variant={nwDeltaMinor >= 0 ? 'success' : 'danger'}
                      className="text-xs font-semibold px-2 py-0.5"
                    >
                      {nwDeltaMinor >= 0 ? '▲ +' : '▼ '}
                      <Amount
                        minor={Math.abs(nwDeltaMinor)}
                        currency={baseCurrency}
                        showSign={false}
                        className="font-bold inline"
                      />{' '}
                      {t('home.thisMonth', 'this month')}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Sparkline chart */}
              {sparklineData.length > 1 && !hideBalances && (
                <div className="w-full sm:w-44 pt-2">
                  <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
                    <span>30-day trend</span>
                  </div>
                  <Sparkline
                    data={sparklineData}
                    height={44}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            {/* Assets & Liabilities split */}
            <div className="grid grid-cols-2 gap-4 mt-6 pt-5 border-t border-border/40 text-sm">
              <div>
                <span className="text-text-muted text-xs font-medium block">
                  {t('accounts.totalAssets', 'Assets')}
                </span>
                <Amount
                  minor={nw.assets}
                  currency={baseCurrency}
                  tone="income"
                  className="text-base sm:text-lg font-bold block mt-0.5"
                />
              </div>
              <div>
                <span className="text-text-muted text-xs font-medium block">
                  {t('accounts.totalLiabilities', 'Liabilities')}
                </span>
                <Amount
                  minor={nw.liabilities}
                  currency={baseCurrency}
                  tone="danger"
                  className="text-base sm:text-lg font-bold block mt-0.5"
                />
              </div>
            </div>
          </Card>

          {/* Quick Action Chips */}
          <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => navigate('/transactions/new?type=expense')}
              className="flex-1 min-w-[110px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-elevated hover:bg-surface-elevated/90 border border-border/60 hover:border-danger/40 text-text font-semibold text-xs transition-all duration-150 active:scale-95 shadow-xs"
            >
              <div className="w-5 h-5 rounded-full bg-danger/10 text-danger flex items-center justify-center">
                <Minus size={13} className="stroke-[3]" />
              </div>
              <span>{t('home.addExpense', 'Expense')}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/transactions/new?type=income')}
              className="flex-1 min-w-[110px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-elevated hover:bg-surface-elevated/90 border border-border/60 hover:border-success/40 text-text font-semibold text-xs transition-all duration-150 active:scale-95 shadow-xs"
            >
              <div className="w-5 h-5 rounded-full bg-success/10 text-success flex items-center justify-center">
                <Plus size={13} className="stroke-[3]" />
              </div>
              <span>{t('home.addIncome', 'Income')}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/transactions/new?type=transfer')}
              className="flex-1 min-w-[110px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-elevated hover:bg-surface-elevated/90 border border-border/60 hover:border-primary/40 text-text font-semibold text-xs transition-all duration-150 active:scale-95 shadow-xs"
            >
              <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <ArrowLeftRight size={13} className="stroke-[2.5]" />
              </div>
              <span>{t('home.addTransfer', 'Transfer')}</span>
            </button>
          </div>

          {/* This Month's Summary (Snap-scroll on mobile, 3-col on sm+) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between text-text-muted mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {t('reports.income', 'Income')}
                </span>
                <div className="w-7 h-7 rounded-lg bg-success/10 text-success flex items-center justify-center">
                  <TrendingUp size={15} />
                </div>
              </div>
              <Amount
                minor={summary.incomeMinor}
                currency={baseCurrency}
                tone="income"
                showSign={false}
                className="text-lg sm:text-xl font-bold block mt-1"
              />
              <p className="text-xs text-text-muted mt-1">{t('reports.thisMonth', 'This month')}</p>
            </Card>

            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between text-text-muted mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {t('reports.expenses', 'Expenses')}
                </span>
                <div className="w-7 h-7 rounded-lg bg-danger/10 text-danger flex items-center justify-center">
                  <TrendingDown size={15} />
                </div>
              </div>
              <Amount
                minor={summary.expenseMinor}
                currency={baseCurrency}
                tone="neutral"
                showSign={false}
                className="text-lg sm:text-xl font-bold block mt-1"
              />
              <p className="text-xs text-text-muted mt-1">{t('reports.thisMonth', 'This month')}</p>
            </Card>

            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between text-text-muted mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {t('reports.netSavings', 'Net Savings')}
                </span>
                <Badge
                  variant={summary.netSavingsMinor >= 0 ? 'success' : 'danger'}
                  className="text-[11px] px-1.5 py-0.2"
                >
                  {summary.savingsRatePercent}%
                </Badge>
              </div>
              <Amount
                minor={summary.netSavingsMinor}
                currency={baseCurrency}
                tone={summary.netSavingsMinor >= 0 ? 'income' : 'danger'}
                showSign={true}
                className="text-lg sm:text-xl font-bold block mt-1"
              />
              <p className="text-xs text-text-muted mt-1">{t('reports.savingsRate', 'Savings rate')}</p>
            </Card>
          </div>

          {/* Recent Transactions Card */}
          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/40">
              <CardTitle className="text-base font-bold text-text">
                {t('home.recentTransactions', 'Recent Transactions')}
              </CardTitle>
              <Link
                to="/transactions"
                className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-1 transition-colors"
              >
                <span>{t('common.viewAll', 'View All')}</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-xs">
                {t('transactions.noTransactions', 'No transactions recorded yet.')}
              </div>
            ) : (
              <div className="divide-y divide-border/30 -mx-1">
                {recentTransactions.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    category={tx.categoryId ? categoryMap.get(tx.categoryId) : undefined}
                    account={accountMap.get(tx.accountId)}
                    toAccount={tx.toAccountId ? accountMap.get(tx.toAccountId) : undefined}
                    showDate={true}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Rail (4 cols): Safe to Spend, Upcoming Bills, Goals, Accounts */}
        <div className="lg:col-span-4 space-y-6">
          {/* Safe to Spend Card */}
          {safeToSpend ? (
            <Card className="p-5 border-primary/20 bg-gradient-to-br from-primary/5 via-surface-elevated to-surface-elevated">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <ShieldCheck size={16} />
                  <span>{t('home.safeToSpend', 'Safe to Spend')}</span>
                </span>
                <span className="text-[11px] font-medium text-text-muted">
                  {safeToSpend.daysLeft}d left
                </span>
              </div>

              <div className="mt-2">
                <Amount
                  minor={safeToSpend.dailyMinor}
                  currency={baseCurrency}
                  showSign={false}
                  className="text-2xl font-extrabold text-text block"
                />
                <span className="text-xs text-text-muted block mt-0.5">
                  {t('home.safeToSpendPerDay', 'per day')} ·{' '}
                  <Amount
                    minor={safeToSpend.remainingBudgetMinor}
                    currency={baseCurrency}
                    showSign={false}
                    className="font-medium inline text-xs text-text-muted"
                  />{' '}
                  remaining
                </span>
              </div>

              <div className="w-full h-1.5 bg-surface-overlay rounded-full overflow-hidden mt-3">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, safeToSpend.percentRemaining)}%` }}
                />
              </div>
            </Card>
          ) : (
            <Card className="p-5 text-center bg-surface-elevated">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2">
                <ShieldCheck size={20} />
              </div>
              <h4 className="text-xs font-bold text-text">
                {t('home.safeToSpend', 'Safe to Spend')}
              </h4>
              <p className="text-[11px] text-text-muted mt-1">
                {t('home.noBudgetsSet', 'Set a monthly budget to see daily safe spending')}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full text-xs"
                onClick={() => navigate('/budgets')}
              >
                {t('budgets.title', 'Set Budget')}
              </Button>
            </Card>
          )}

          {/* Upcoming Bills Strip */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3 pb-1 border-b border-border/30">
              <CardTitle className="text-sm font-bold text-text flex items-center gap-1.5">
                <Receipt size={16} className="text-primary" />
                <span>{t('home.upcomingBills', 'Upcoming Bills')}</span>
              </CardTitle>
              <Link
                to="/bills"
                className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-0.5"
              >
                <span>{t('common.viewAll', 'View All')}</span>
                <ChevronRight size={13} />
              </Link>
            </div>

            {upcomingBills.length === 0 ? (
              <p className="text-center py-4 text-xs text-text-muted">
                {t('home.noUpcomingBills', 'No bills due in the next 30 days')}
              </p>
            ) : (
              <div className="space-y-2.5">
                {upcomingBills.map((bill, idx) => (
                  <div
                    key={`${bill.rule.id}-${bill.occurrenceDate}-${idx}`}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-surface-overlay/40 hover:bg-surface-overlay/80 transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-semibold text-text truncate">
                        {bill.rule.title}
                      </p>
                      <span
                        className={`text-[10px] font-medium block mt-0.5 ${
                          bill.isOverdue ? 'text-danger font-bold' : 'text-text-muted'
                        }`}
                      >
                        {formatDayLabel(bill.occurrenceDate, todayStr)}
                        {bill.isOverdue ? ' · Overdue' : ''}
                      </span>
                    </div>
                    <Amount
                      minor={bill.amountMinor}
                      currency={baseCurrency}
                      tone={bill.isOverdue ? 'danger' : 'neutral'}
                      showSign={false}
                      className="text-xs font-bold shrink-0"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Savings Goals (ProgressRing Tiles, max 3) */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3 pb-1 border-b border-border/30">
              <CardTitle className="text-sm font-bold text-text flex items-center gap-1.5">
                <Target size={16} className="text-gold" />
                <span>{t('home.savingsGoals', 'Savings Goals')}</span>
              </CardTitle>
              <Link
                to="/goals"
                className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-0.5"
              >
                <span>{t('common.viewAll', 'View All')}</span>
                <ChevronRight size={13} />
              </Link>
            </div>

            {!goals || goals.length === 0 ? (
              <div className="text-center py-4 text-xs text-text-muted">
                <p>{t('home.noGoals', 'No active savings goals')}</p>
                <Link
                  to="/goals"
                  className="text-primary hover:underline font-semibold inline-block mt-1"
                >
                  {t('home.setGoal', 'Set a goal')}
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {goals.slice(0, 3).map((goal) => {
                  // Bug 9.2 Fix: Compute goal progress with linked account balance or actual contributions
                  const linkedAccount = goal.linkedAccountId
                    ? accountMap.get(goal.linkedAccountId)
                    : undefined
                  const linkedBal =
                    linkedAccount && transactions
                      ? accountBalance(linkedAccount, transactions)
                      : undefined
                  const progress = calculateGoalProgress(
                    goal,
                    goalContributions ?? [],
                    linkedBal,
                    todayStr,
                  )

                  return (
                    <div
                      key={goal.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-surface-overlay/40 hover:bg-surface-overlay/80 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-text truncate">{goal.name}</p>
                        <div className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1">
                          <Amount
                            minor={progress.progressMinor}
                            currency={goal.currency}
                            showSign={false}
                            className="font-medium inline text-[10px]"
                          />
                          <span>/</span>
                          <Amount
                            minor={progress.targetMinor}
                            currency={goal.currency}
                            showSign={false}
                            className="font-medium inline text-[10px]"
                          />
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <ProgressRing
                          value={progress.percentComplete}
                          size={40}
                          tone="gold"
                        >
                          <span className="text-[10px] font-bold text-text">
                            {Math.round(progress.percentComplete)}%
                          </span>
                        </ProgressRing>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Accounts Summary (Bug 9.1 Fix: Use accountBalance) */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3 pb-1 border-b border-border/30">
              <CardTitle className="text-sm font-bold text-text flex items-center gap-1.5">
                <Wallet size={16} className="text-primary" />
                <span>{t('home.accounts', 'Accounts')}</span>
              </CardTitle>
              <Link
                to="/accounts"
                className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-0.5"
              >
                <span>{t('common.viewAll', 'View All')}</span>
                <ChevronRight size={13} />
              </Link>
            </div>

            {!accounts || accounts.length === 0 ? (
              <p className="text-center py-4 text-xs text-text-muted">
                {t('home.noAccounts', 'No accounts yet')}
              </p>
            ) : (
              <div className="space-y-2">
                {accounts.slice(0, 4).map((acc) => {
                  // Bug 9.1 Fix: compute current balance using accountBalance(acc, transactions)
                  const currentBalanceMinor = transactions
                    ? accountBalance(acc, transactions)
                    : acc.openingBalanceMinor

                  return (
                    <button
                      type="button"
                      key={acc.id}
                      onClick={() => navigate(`/accounts/${acc.id}`)}
                      className="w-full text-left flex items-center justify-between p-2 rounded-xl hover:bg-surface-overlay/60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-surface-overlay flex items-center justify-center text-text text-xs font-bold shrink-0">
                          {acc.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-text truncate">{acc.name}</p>
                          <span className="text-[10px] text-text-muted uppercase tracking-wider block">
                            {acc.kind.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      <Amount
                        minor={currentBalanceMinor}
                        currency={acc.currency}
                        showSign={false}
                        className="text-xs font-bold text-text shrink-0"
                      />
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </Page>
  )
}
