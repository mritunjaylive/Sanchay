import { Suspense } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Home, List, Plus, BarChart2, MoreHorizontal,
  Wallet, PiggyBank, Calendar, Target, Settings,
  CreditCard, Landmark,
} from 'lucide-react'
import { SyncStatusBadge } from '../features/sync/components/SyncStatusBadge'
import { NotificationCenter } from '../features/notifications/components/NotificationCenter'
import { UserProfileMenu } from '../features/auth'
import { QuickAddFAB } from '../features/transactions/components/QuickAddFAB'
import { LoadingSpinner, Logo, BrandName } from '../ui'
import { cn } from '../lib/cn'

export function AppShell() {
  const { t } = useTranslation()

  return (
    <div className="flex h-dvh overflow-hidden bg-surface">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-border bg-surface-elevated shrink-0">
        <SidebarContent />
      </aside>

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 h-14 border-b border-border bg-surface-elevated shrink-0 md:px-6">
          <div className="flex items-center gap-2.5">
            {/* Mobile: app name */}
            <Logo size={24} className="md:hidden" />
            <BrandName gradientText className="text-lg md:hidden" />
            {/* Desktop: page title comes from route */}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <SyncStatusBadge />
            <NotificationCenter />
            <UserProfileMenu />
          </div>
        </header>

        {/* Scrollable content */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-[1200px] mx-auto w-full">
            <Suspense
              fallback={
                <div className="min-h-[50vh] flex items-center justify-center">
                  <LoadingSpinner size="lg" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>

        {/* Mobile bottom tab bar */}
        <nav
          aria-label="Main navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface-elevated"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center justify-around h-16">
            <TabBarItem to="/" icon={<Home size={20} />} label={t('nav.home')} />
            <TabBarItem to="/transactions" icon={<List size={20} />} label={t('nav.transactions')} />

            {/* Center FAB */}
            <QuickAddFAB />

            <TabBarItem to="/reports/summary" icon={<BarChart2 size={20} />} label={t('nav.reports')} />
            <TabBarItem to="/settings" icon={<MoreHorizontal size={20} />} label={t('nav.more')} />
          </div>
        </nav>
      </div>
    </div>
  )
}

function SidebarContent() {
  const { t } = useTranslation()

  return (
    <>
      {/* Logo */}
      <div className="px-6 h-14 flex items-center gap-3 border-b border-border">
        <Logo size={28} className="shadow-sm rounded-lg" />
        <BrandName gradientText className="text-xl" />
      </div>

      {/* Nav links */}
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <SidebarLink to="/" icon={<Home size={18} />} label={t('nav.home')} end />
        <SidebarLink to="/transactions" icon={<List size={18} />} label={t('nav.transactions')} />
        <SidebarLink to="/accounts" icon={<Wallet size={18} />} label={t('nav.accounts')} />
        <SidebarLink to="/budgets" icon={<PiggyBank size={18} />} label={t('nav.budgets')} />
        <SidebarLink to="/bills" icon={<Calendar size={18} />} label={t('nav.bills')} />
        <SidebarLink to="/loans" icon={<Landmark size={18} />} label={t('nav.loans')} />
        <SidebarLink to="/goals" icon={<Target size={18} />} label={t('nav.goals')} />

        <div className="pt-2 pb-1">
          <span className="px-3 text-xs font-semibold text-text-subtle uppercase tracking-wider">
            {t('nav.reports', 'Reports')}
          </span>
        </div>
        <SidebarLink to="/reports/summary" icon={<BarChart2 size={18} />} label={t('nav.reportsSummary', 'Summary')} />
        <SidebarLink to="/reports/categories" icon={<CreditCard size={18} />} label={t('nav.reportsCategories', 'Categories')} />
        <SidebarLink to="/calendar" icon={<Calendar size={18} />} label={t('nav.calendar', 'Calendar')} />

        <div className="pt-2">
          <SidebarLink to="/settings" icon={<Settings size={18} />} label={t('nav.settings', 'Settings')} />
        </div>
      </nav>
    </>
  )
}

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
  end?: boolean
}

function TabBarItem({ to, icon, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg touch-target text-text-muted transition-colors',
          isActive && 'text-primary',
        )
      }
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  )
}

function SidebarLink({ to, icon, label, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={Boolean(end)}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-text-muted transition-colors hover:bg-surface-overlay hover:text-text',
          isActive && 'bg-primary/10 text-primary hover:bg-primary/15',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
