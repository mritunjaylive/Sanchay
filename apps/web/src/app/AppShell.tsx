import React, { Suspense, useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useMatches, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Home,
  List,
  Plus,
  PiggyBank,
  MoreHorizontal,
  Wallet,
  Receipt,
  Landmark,
  Target,
  BarChart2,
  PieChart,
  TrendingUp,
  Scale,
  SlidersHorizontal,
  CalendarDays,
  ArrowDownToLine,
  HelpCircle,
  Settings,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { SyncStatusBadge } from '../features/sync/components/SyncStatusBadge'
import { NotificationCenter } from '../features/notifications/components/NotificationCenter'
import { UserProfileMenu } from '../features/auth'
import { MoreBottomSheet } from '../features/navigation/components/MoreBottomSheet'
import { CommandPalette } from '../ui/CommandPalette'
import { Logo, BrandName } from '../ui'
import { CardSkeleton } from '../ui/Skeleton'
import { useSettingsStore } from '../features/settings/stores/settingsStore'
import { cn } from '../lib/cn'

export function AppShell() {
  const { t } = useTranslation()
  const location = useLocation()
  const matches = useMatches()
  const navigate = useNavigate()
  const { sidebarCollapsed, setSidebarCollapsed } = useSettingsStore()

  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [isCmdOpen, setIsCmdOpen] = useState(false)

  // Scroll to top and focus main on route change
  useEffect(() => {
    const main = document.getElementById('main-content')
    if (main) {
      main.scrollTo(0, 0)
    }
  }, [location.pathname])

  // Global ⌘K / Ctrl+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsCmdOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Resolve current page title from route handle or fallback
  const currentMatch = matches[matches.length - 1]
  const titleKey = (currentMatch?.handle as { titleKey?: string } | undefined)?.titleKey
  const pageTitle = titleKey ? t(titleKey) : ''

  return (
    <div className="flex h-dvh overflow-hidden bg-surface">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-border bg-surface-elevated shrink-0 transition-all duration-200 z-20',
          sidebarCollapsed ? 'w-20' : 'w-64',
        )}
      >
        <SidebarContent
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header - Sticky with Blur */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-border/80 bg-surface/85 backdrop-blur shrink-0 md:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile: App Logo & Name */}
            <div className="flex items-center gap-2.5 md:hidden">
              <Logo size={26} className="shadow-xs rounded-lg" />
              <BrandName gradientText className="text-lg" />
            </div>

            {/* Desktop: Active Page Title */}
            <div className="hidden md:flex items-center gap-2">
              <span className="text-base font-bold text-text truncate">
                {pageTitle || t('app.name', 'Sanchay')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Desktop Command Palette Search Bar */}
            <button
              type="button"
              onClick={() => setIsCmdOpen(true)}
              className={cn(
                'hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border/70',
                'bg-surface-elevated hover:bg-surface-overlay text-text-muted hover:text-text',
                'transition-colors text-xs font-normal shadow-xs',
              )}
            >
              <Search size={14} />
              <span>{t('common.search', 'Search...')}</span>
              <kbd className="ml-2 px-1.5 py-0.2 text-[10px] font-mono bg-surface-overlay border border-border rounded">
                ⌘K
              </kbd>
            </button>

            <SyncStatusBadge />
            <NotificationCenter />
            <UserProfileMenu />
          </div>
        </header>

        {/* Scrollable Content */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom))] md:pb-0 outline-none"
        >
          <Suspense
            fallback={
              <div className="p-6 max-w-5xl mx-auto space-y-4">
                <CardSkeleton />
                <CardSkeleton />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>

        {/* Mobile Bottom Tab Bar */}
        <nav
          aria-label="Main navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/80 bg-surface-elevated/90 backdrop-blur"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="relative flex items-center justify-around h-16 px-2">
            <TabBarItem to="/" icon={<Home size={20} />} label={t('nav.home', 'Home')} end />
            <TabBarItem
              to="/transactions"
              icon={<List size={20} />}
              label={t('nav.transactions', 'Transactions')}
            />

            {/* Elevated Center Quick Add FAB */}
            <div className="relative -top-5 flex flex-col items-center">
              <button
                type="button"
                onClick={() => navigate('/transactions/new')}
                aria-label={t('transactions.addTransaction', 'Add Transaction')}
                className={cn(
                  'w-14 h-14 rounded-full flex items-center justify-center',
                  'bg-primary text-primary-foreground hover:brightness-105',
                  'shadow-lg ring-4 ring-surface active:scale-95 transition-all duration-150',
                )}
              >
                <Plus size={26} strokeWidth={2.5} />
              </button>
            </div>

            <TabBarItem to="/budgets" icon={<PiggyBank size={20} />} label={t('nav.budgets', 'Budgets')} />
            <button
              type="button"
              onClick={() => setIsMoreOpen(true)}
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg touch-target text-text-muted hover:text-text transition-colors"
            >
              <MoreHorizontal size={20} />
              <span className="text-[11px] font-medium leading-tight">{t('nav.more', 'More')}</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile More Features Bottom Sheet */}
      <MoreBottomSheet isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />

      {/* Global Command Palette */}
      <CommandPalette isOpen={isCmdOpen} onClose={() => setIsCmdOpen(false)} />
    </div>
  )
}

interface SidebarContentProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

function SidebarContent({ collapsed, onToggleCollapse }: SidebarContentProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Brand Header */}
      <div
        className={cn(
          'h-14 flex items-center border-b border-border/80 px-4 transition-all',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Logo size={28} className="shadow-xs rounded-lg shrink-0" />
          {!collapsed && <BrandName gradientText className="text-xl truncate" />}
        </div>
      </div>

      {/* Nav Links with Section Headers */}
      <nav
        aria-label="Sidebar navigation"
        className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4 no-scrollbar"
      >
        {/* Overview */}
        <div className="space-y-1">
          {!collapsed && (
            <span className="px-3 text-[10px] font-bold text-text-subtle uppercase tracking-wider block mb-1">
              {t('nav.overview', 'Overview')}
            </span>
          )}
          <SidebarLink
            to="/"
            icon={<Home size={18} />}
            label={t('nav.home', 'Home')}
            collapsed={collapsed}
            end
          />
        </div>

        {/* Money Section */}
        <div className="space-y-1">
          {!collapsed && (
            <span className="px-3 text-[10px] font-bold text-text-subtle uppercase tracking-wider block mb-1">
              {t('nav.money', 'Money')}
            </span>
          )}
          <SidebarLink
            to="/transactions"
            icon={<List size={18} />}
            label={t('nav.transactions', 'Transactions')}
            collapsed={collapsed}
          />
          <SidebarLink
            to="/accounts"
            icon={<Wallet size={18} />}
            label={t('nav.accounts', 'Accounts')}
            collapsed={collapsed}
          />
        </div>

        {/* Planning Section */}
        <div className="space-y-1">
          {!collapsed && (
            <span className="px-3 text-[10px] font-bold text-text-subtle uppercase tracking-wider block mb-1">
              {t('nav.plan', 'Plan')}
            </span>
          )}
          <SidebarLink
            to="/budgets"
            icon={<PiggyBank size={18} />}
            label={t('nav.budgets', 'Budgets')}
            collapsed={collapsed}
          />
          <SidebarLink
            to="/bills"
            icon={<Receipt size={18} />}
            label={t('nav.bills', 'Bills')}
            collapsed={collapsed}
          />
          <SidebarLink
            to="/loans"
            icon={<Landmark size={18} />}
            label={t('nav.loans', 'Loans')}
            collapsed={collapsed}
          />
          <SidebarLink
            to="/goals"
            icon={<Target size={18} />}
            label={t('nav.goals', 'Goals')}
            collapsed={collapsed}
          />
        </div>

        {/* Insights / Reports Section */}
        <div className="space-y-1">
          {!collapsed && (
            <span className="px-3 text-[10px] font-bold text-text-subtle uppercase tracking-wider block mb-1">
              {t('nav.insights', 'Insights')}
            </span>
          )}
          <SidebarLink
            to="/reports/summary"
            icon={<BarChart2 size={18} />}
            label={t('nav.reportsSummary', 'Summary')}
            collapsed={collapsed}
          />
          <SidebarLink
            to="/reports/categories"
            icon={<PieChart size={18} />}
            label={t('nav.reportsCategories', 'Categories')}
            collapsed={collapsed}
          />
          <SidebarLink
            to="/reports/trends"
            icon={<TrendingUp size={18} />}
            label={t('reports.trends', 'Trends')}
            collapsed={collapsed}
          />
          <SidebarLink
            to="/reports/net-worth"
            icon={<Scale size={18} />}
            label={t('reports.netWorth', 'Net Worth')}
            collapsed={collapsed}
          />
          <SidebarLink
            to="/reports/budget"
            icon={<SlidersHorizontal size={18} />}
            label={t('reports.budgetVsActual', 'Budget vs Actual')}
            collapsed={collapsed}
          />
          <SidebarLink
            to="/calendar"
            icon={<CalendarDays size={18} />}
            label={t('nav.calendar', 'Calendar')}
            collapsed={collapsed}
          />
        </div>
      </nav>

      {/* Pinned Bottom Navigation */}
      <div className="p-2.5 border-t border-border/80 space-y-1 bg-surface/40">
        <SidebarLink
          to="/import"
          icon={<ArrowDownToLine size={18} />}
          label={t('nav.import', 'Import & Export')}
          collapsed={collapsed}
        />
        <SidebarLink
          to="/help"
          icon={<HelpCircle size={18} />}
          label={t('nav.help', 'Help')}
          collapsed={collapsed}
        />
        <SidebarLink
          to="/settings"
          icon={<Settings size={18} />}
          label={t('nav.settings', 'Settings')}
          collapsed={collapsed}
        />

        {/* Sidebar Collapse Toggle Button */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-text-muted hover:text-text hover:bg-surface-overlay transition-colors',
            collapsed && 'justify-center px-0',
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span>{t('common.collapse', 'Collapse')}</span>}
        </button>
      </div>
    </>
  )
}

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
  end?: boolean
  collapsed?: boolean
}

function TabBarItem({ to, icon, label, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={Boolean(end)}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl touch-target text-text-muted transition-all duration-150',
          isActive && 'text-primary font-semibold',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            {icon}
            {isActive && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-primary rounded-full" />
            )}
          </span>
          <span className="text-[11px] leading-tight">{label}</span>
        </>
      )}
    </NavLink>
  )
}

function SidebarLink({ to, icon, label, end, collapsed }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={Boolean(end)}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 group',
          collapsed && 'justify-center px-0 h-10 w-full',
          isActive
            ? 'bg-primary/10 text-primary font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-primary'
            : 'text-text-muted hover:bg-surface-overlay hover:text-text',
        )
      }
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
}
