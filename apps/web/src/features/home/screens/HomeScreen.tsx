import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { useAuthStore } from '../../auth/stores/authStore'
import { formatMoney } from '../../../lib/money'
import { periodFor } from '../../../domain/dates'
import { netWorth } from '../../../domain/balance'
import { calculatePeriodSummary } from '../../../domain/reports'
import { calculateGoalProgress } from '../../../domain/goals'
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '../../../ui'
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Eye,
  EyeOff,
  Plus,
  Target,
  Calendar,
  CreditCard,
  Wallet,
} from 'lucide-react'

export default function HomeScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hideBalances, setHideBalances, baseCurrency, locale } = useSettingsStore()
  const profile = useAuthStore((s) => s.profile)
  const monthStartDay = profile?.monthStartDay ?? 1

  const todayStr = new Date().toISOString().substring(0, 10)
  const { start: monthStart, end: monthEnd } = periodFor(todayStr, monthStartDay)

  // Reactive Dexie queries
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).toArray(), [])
  const transactions = useLiveQuery(
    () => db.transactions.filter((tx) => !tx.deletedAt).toArray(),
    [],
  )
  const budgets = useLiveQuery(() => db.budgets.filter((b) => !b.deletedAt).toArray(), [])
  const categories = useLiveQuery(() => db.categories.filter((c) => !c.deletedAt).toArray(), [])
  const goals = useLiveQuery(() => db.goals.filter((g) => !g.deletedAt).toArray(), [])
  const recurringRules = useLiveQuery(
    () => db.recurringRules.filter((r) => !r.deletedAt).toArray(),
    [],
  )

  // Category lookup
  const categoryMap = React.useMemo(() => {
    const map = new Map<string, string>()
    categories?.forEach((c) => map.set(c.id, c.name))
    return map
  }, [categories])

  const accountCurrencyMap = React.useMemo(() => {
    const map = new Map<string, string>()
    accounts?.forEach((a) => map.set(a.id, a.currency))
    return map
  }, [accounts])

  // Simple FX rate converter (1:1 fallback for now)
  const getBaseAmount = (minor: number) => minor

  // Net worth calculation
  const nw = React.useMemo(() => {
    if (!accounts || !transactions) return { assets: 0, liabilities: 0, netWorth: 0 }
    return netWorth(accounts, transactions, getBaseAmount)
  }, [accounts, transactions])

  // This month's summary
  const summary = React.useMemo(() => {
    if (!transactions)
      return { incomeMinor: 0, expenseMinor: 0, netSavingsMinor: 0, savingsRatePercent: 0, transactionCount: 0 }
    return calculatePeriodSummary(transactions, monthStart, monthEnd)
  }, [transactions, monthStart, monthEnd])

  // Recent transactions (last 5)
  const recentTransactions = React.useMemo(() => {
    if (!transactions) return []
    return [...transactions]
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
  }, [transactions])

  const renderAmount = (minor: number, currency = baseCurrency) => {
    if (hideBalances) return '••••••'
    return formatMoney(minor, currency, locale)
  }

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-6xl mx-auto">
      {/* Top Banner: Net Worth & Quick Add */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Net Worth Card */}
        <Card className="md:col-span-2 bg-gradient-to-br from-primary/10 via-surface-elevated to-surface-elevated border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {t('home.totalNetWorth', 'Total Net Worth')}
            </span>
            <button
              type="button"
              onClick={() => setHideBalances(!hideBalances)}
              aria-label={hideBalances ? 'Show balances' : 'Hide balances'}
              className="text-text-muted hover:text-text p-1 rounded-md"
            >
              {hideBalances ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="text-3xl font-extrabold text-text tracking-tight mb-4">
            {renderAmount(nw.netWorth)}
          </div>
          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border/50 text-sm">
            <div>
              <span className="text-text-muted text-xs block">{t('accounts.totalAssets', 'Assets')}</span>
              <span className="font-semibold text-success">{renderAmount(nw.assets)}</span>
            </div>
            <div>
              <span className="text-text-muted text-xs block">{t('accounts.totalLiabilities', 'Liabilities')}</span>
              <span className="font-semibold text-danger">{renderAmount(nw.liabilities)}</span>
            </div>
          </div>
        </Card>

        {/* Quick Action Card */}
        <Card className="flex flex-col justify-between items-center text-center p-6 bg-surface-elevated">
          <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-md mb-2">
            <Plus size={24} />
          </div>
          <div>
            <h3 className="font-bold text-text text-base">{t('transactions.recordNew', 'Record Transaction')}</h3>
            <p className="text-xs text-text-muted mt-1">
              {t('transactions.recordHint', 'Log an expense, income, or transfer in seconds')}
            </p>
          </div>
          <Button
            variant="primary"
            className="w-full mt-4"
            onClick={() => navigate('/transactions/new')}
          >
            {t('transactions.addTransaction', 'Add Transaction')}
          </Button>
        </Card>
      </div>

      {/* Month Income & Expense Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center justify-between text-text-muted mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">{t('reports.income', 'Income')}</span>
            <div className="w-8 h-8 rounded-full bg-success/10 text-success flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-xl font-bold text-text mt-1">{renderAmount(summary.incomeMinor)}</div>
          <p className="text-xs text-text-muted mt-1">{t('reports.thisMonth', 'This month')}</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between text-text-muted mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">{t('reports.expenses', 'Expenses')}</span>
            <div className="w-8 h-8 rounded-full bg-danger/10 text-danger flex items-center justify-center">
              <TrendingDown size={16} />
            </div>
          </div>
          <div className="text-xl font-bold text-text mt-1">{renderAmount(summary.expenseMinor)}</div>
          <p className="text-xs text-text-muted mt-1">{t('reports.thisMonth', 'This month')}</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between text-text-muted mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">{t('reports.netSavings', 'Net Savings')}</span>
            <Badge variant={summary.netSavingsMinor >= 0 ? 'success' : 'danger'}>
              {summary.savingsRatePercent}%
            </Badge>
          </div>
          <div
            className={`text-xl font-bold mt-1 ${
              summary.netSavingsMinor >= 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {renderAmount(summary.netSavingsMinor)}
          </div>
          <p className="text-xs text-text-muted mt-1">{t('reports.savingsRate', 'Savings rate')}</p>
        </Card>
      </div>

      {/* Two Column Section: Recent Transactions & Goals/Bills */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left (2 cols): Recent Transactions */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('home.recentTransactions', 'Recent Transactions')}</CardTitle>
              <Link
                to="/transactions"
                className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
              >
                <span>{t('common.viewAll', 'View All')}</span>
                <ArrowRight size={14} />
              </Link>
            </CardHeader>
            <CardContent>
              {recentTransactions.length === 0 ? (
                <div className="text-center py-8 text-text-muted text-sm">
                  {t('transactions.noTransactions', 'No transactions recorded yet.')}
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recentTransactions.map((tx) => {
                    const isIncome = tx.type === 'income'
                    const isTransfer = tx.type === 'transfer'

                    return (
                      <button
                        type="button"
                        key={tx.id}
                        onClick={() => navigate(`/transactions/${tx.id}`)}
                        className="w-full text-left py-3 flex items-center justify-between hover:bg-surface-overlay/50 px-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isIncome
                                ? 'bg-success/10 text-success'
                                : isTransfer
                                ? 'bg-primary/10 text-primary'
                                : 'bg-surface-overlay text-text'
                            }`}
                          >
                            {isTransfer ? (
                              <ArrowRight size={18} />
                            ) : isIncome ? (
                              <TrendingUp size={18} />
                            ) : (
                              <TrendingDown size={18} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-text truncate">
                              {tx.payee || categoryMap.get(tx.categoryId ?? '') || t('common.unspecified', 'Unspecified')}
                            </p>
                            <p className="text-xs text-text-muted">
                              {tx.occurredOn} {tx.note ? `• ${tx.note}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`text-sm font-bold ${
                              isIncome ? 'text-success' : isTransfer ? 'text-primary' : 'text-text'
                            }`}
                          >
                            {isIncome ? '+' : isTransfer ? '' : '-'}
                            {renderAmount(tx.amountMinor, accountCurrencyMap.get(tx.accountId) ?? baseCurrency)}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right (1 col): Goals & Upcoming Bills */}
        <div className="space-y-6">
          {/* Savings Goals Widget */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target size={18} className="text-primary" />
                <span>{t('goals.title', 'Savings Goals')}</span>
              </CardTitle>
              <Link to="/goals" className="text-xs text-primary hover:underline font-semibold">
                {t('common.viewAll', 'View All')}
              </Link>
            </CardHeader>
            <CardContent>
              {!goals || goals.length === 0 ? (
                <div className="text-center py-4 text-text-muted text-xs">
                  {t('goals.noGoals', 'No active goals.')}{' '}
                  <Link to="/goals" className="text-primary hover:underline">
                    {t('goals.createGoal', 'Set a goal')}
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {goals.slice(0, 3).map((goal) => {
                    const progress = calculateGoalProgress(goal, [], undefined, todayStr)
                    return (
                      <div key={goal.id} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-text font-semibold truncate">{goal.name}</span>
                          <span className="text-text-muted">{progress.percentComplete}%</span>
                        </div>
                        <div className="w-full h-2 bg-surface-overlay rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-300"
                            style={{ width: `${progress.percentComplete}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-text-muted">
                          <span>{renderAmount(progress.progressMinor, goal.currency)}</span>
                          <span>{renderAmount(progress.targetMinor, goal.currency)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Accounts Summary Widget */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet size={18} className="text-primary" />
                <span>{t('accounts.title', 'Accounts')}</span>
              </CardTitle>
              <Link to="/accounts" className="text-xs text-primary hover:underline font-semibold">
                {t('common.viewAll', 'View All')}
              </Link>
            </CardHeader>
            <CardContent>
              {!accounts || accounts.length === 0 ? (
                <div className="text-center py-4 text-text-muted text-xs">
                  {t('accounts.noAccounts', 'No accounts yet.')}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {accounts.slice(0, 4).map((acc) => (
                    <button
                      type="button"
                      key={acc.id}
                      onClick={() => navigate(`/accounts/${acc.id}`)}
                      className="w-full text-left flex items-center justify-between p-2 rounded-lg hover:bg-surface-overlay/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-surface-overlay flex items-center justify-center text-text text-xs font-bold">
                          {acc.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-text truncate">{acc.name}</p>
                          <span className="text-[10px] text-text-muted uppercase">{acc.kind}</span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-text">
                        {renderAmount(acc.openingBalanceMinor, acc.currency)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
