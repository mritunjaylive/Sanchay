import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../features/auth/stores/authStore'
import { AppShell } from './AppShell'
import { AuthShell } from './AuthShell'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { RouteErrorBoundary } from './RouteErrorBoundary'

// Lazy-loaded routes
const HomePage = lazy(() => import('../features/home/screens/HomeScreen'))
const TransactionsPage = lazy(() => import('../features/transactions/screens/TransactionListScreen'))
const TransactionEditorPage = lazy(() => import('../features/transactions/screens/TransactionEditorScreen'))
const AccountsPage = lazy(() => import('../features/accounts/screens/AccountsScreen'))
const AccountDetailPage = lazy(() => import('../features/accounts/screens/AccountDetailScreen'))
const BudgetsPage = lazy(() => import('../features/budgets/screens/BudgetsScreen'))
const BillsPage = lazy(() => import('../features/bills/screens/BillsScreen'))
const LoansPage = lazy(() => import('../features/loans/screens/LoansScreen'))
const GoalsPage = lazy(() => import('../features/goals/screens/GoalsScreen'))
const ReportSummaryPage = lazy(() => import('../features/reports/screens/SummaryScreen'))
const ReportCategoriesPage = lazy(() => import('../features/reports/screens/CategoriesScreen'))
const ReportTrendsPage = lazy(() => import('../features/reports/screens/TrendsScreen'))
const ReportNetWorthPage = lazy(() => import('../features/reports/screens/NetWorthScreen'))
const ReportBudgetPage = lazy(() => import('../features/reports/screens/BudgetReportScreen'))
const CalendarPage = lazy(() => import('../features/reports/screens/CalendarScreen'))
const ImportPage = lazy(() => import('../features/import/screens/ImportScreen'))
const SettingsPage = lazy(() => import('../features/settings/screens/SettingsScreen'))
const OnboardingPage = lazy(() => import('../features/onboarding/screens/OnboardingScreen'))
const SignInPage = lazy(() => import('../features/auth/screens/SignInScreen'))
const SignUpPage = lazy(() => import('../features/auth/screens/SignUpScreen'))
const ResetPasswordPage = lazy(() => import('../features/auth/screens/ResetPasswordScreen'))
const MagicLinkPage = lazy(() => import('../features/auth/screens/MagicLinkScreen'))
const VerifyEmailPage = lazy(() => import('../features/auth/screens/VerifyEmailScreen'))
const AuthCallbackPage = lazy(() => import('../features/auth/screens/AuthCallbackScreen'))
const HelpPage = lazy(() => import('../features/help/screens/HelpScreen'))

const fallback = (
  <div className="min-h-dvh flex items-center justify-center bg-surface">
    <LoadingSpinner size="lg" />
  </div>
)

/** Guard: redirect signed-in users away from auth pages */
function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session)
  const isLoading = useAuthStore((s) => s.isLoading)
  const hydrationStatus = useAuthStore((s) => s.hydrationStatus)
  const profile = useAuthStore((s) => s.profile)

  if (isLoading || hydrationStatus === 'loading') return fallback
  if (!session) return <>{children}</>
  // Signed in — go to onboarding if not onboarded, else home
  if (session && (!profile?.onboardedAt)) return <Navigate to="/onboarding" replace />
  return <Navigate to="/" replace />
}

/** Guard: require authentication */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session)
  const isLoading = useAuthStore((s) => s.isLoading)
  const hydrationStatus = useAuthStore((s) => s.hydrationStatus)
  const location = useLocation()

  if (isLoading || hydrationStatus === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!session) {
    // Preserve the intended destination
    return <Navigate to="/auth/sign-in" state={{ from: location }} replace />
  }
  return <>{children}</>
}

/** Guard: require onboarding to be completed */
function RequireOnboarded({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session)
  const profile = useAuthStore((s) => s.profile)
  const isLoading = useAuthStore((s) => s.isLoading)
  const hydrationStatus = useAuthStore((s) => s.hydrationStatus)

  if (isLoading || hydrationStatus === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface">
        <div className="text-center space-y-3">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-text-muted">Restoring your data…</p>
        </div>
      </div>
    )
  }

  if (!session) return <Navigate to="/auth/sign-in" replace />

  // Check the per-user localStorage hint for fast offline relaunch
  const userId = session.user.id
  const onboardedHint = localStorage.getItem(`sanchay_onboarded_${userId}`)

  if (!profile?.onboardedAt && !onboardedHint) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}

/** Guard: redirect already-onboarded users away from onboarding */
function RequireNotOnboarded({ children }: { children: React.ReactNode }) {
  const profile = useAuthStore((s) => s.profile)
  const session = useAuthStore((s) => s.session)
  const isLoading = useAuthStore((s) => s.isLoading)
  const hydrationStatus = useAuthStore((s) => s.hydrationStatus)

  if (isLoading || hydrationStatus === 'loading') return fallback

  const userId = session?.user?.id
  const onboardedHint = userId ? localStorage.getItem(`sanchay_onboarded_${userId}`) : null

  if (profile?.onboardedAt || onboardedHint) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

const router = createBrowserRouter([
  // Auth routes (no shell)
  {
    path: '/auth',
    element: <AuthShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: 'sign-in',
        element: (
          <RedirectIfAuthed>
            <Suspense fallback={fallback}><SignInPage /></Suspense>
          </RedirectIfAuthed>
        ),
      },
      {
        path: 'sign-up',
        element: (
          <RedirectIfAuthed>
            <Suspense fallback={fallback}><SignUpPage /></Suspense>
          </RedirectIfAuthed>
        ),
      },
      {
        path: 'reset-password',
        element: <Suspense fallback={fallback}><ResetPasswordPage /></Suspense>,
      },
      {
        path: 'magic-link',
        element: (
          <RedirectIfAuthed>
            <Suspense fallback={fallback}><MagicLinkPage /></Suspense>
          </RedirectIfAuthed>
        ),
      },
      {
        path: 'verify-email',
        element: <Suspense fallback={fallback}><VerifyEmailPage /></Suspense>,
      },
      // P0-A: OAuth/magic-link/email-confirm callback handler
      {
        path: 'callback',
        element: <Suspense fallback={fallback}><AuthCallbackPage /></Suspense>,
      },
    ],
  },
  // Onboarding (P0-B: wrapped in RequireNotOnboarded to prevent re-visiting)
  {
    path: '/onboarding',
    errorElement: <RouteErrorBoundary />,
    element: (
      <RequireAuth>
        <RequireNotOnboarded>
          <Suspense fallback={fallback}>
            <OnboardingPage />
          </Suspense>
        </RequireNotOnboarded>
      </RequireAuth>
    ),
  },
  // App routes (with shell)
  {
    path: '/',
    errorElement: <RouteErrorBoundary />,
    element: (
      <RequireAuth>
        <RequireOnboarded>
          <AppShell />
        </RequireOnboarded>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage />, handle: { titleKey: 'nav.home' } },
      { path: 'transactions', element: <TransactionsPage />, handle: { titleKey: 'nav.transactions' } },
      // P1-J: Editor routes get hideTabBar so AppShell hides the mobile tab bar
      {
        path: 'transactions/new',
        element: <TransactionEditorPage />,
        handle: { titleKey: 'nav.newTransaction', hideTabBar: true },
      },
      {
        path: 'transactions/:id',
        element: <TransactionEditorPage />,
        handle: { titleKey: 'nav.editTransaction', hideTabBar: true },
      },
      { path: 'accounts', element: <AccountsPage />, handle: { titleKey: 'nav.accounts' } },
      { path: 'accounts/:id', element: <AccountDetailPage />, handle: { titleKey: 'nav.accountDetail' } },
      { path: 'budgets', element: <BudgetsPage />, handle: { titleKey: 'nav.budgets' } },
      { path: 'bills', element: <BillsPage />, handle: { titleKey: 'nav.bills' } },
      { path: 'loans', element: <LoansPage />, handle: { titleKey: 'nav.loans' } },
      { path: 'goals', element: <GoalsPage />, handle: { titleKey: 'nav.goals' } },
      { path: 'reports/summary', element: <ReportSummaryPage />, handle: { titleKey: 'nav.reportsSummary' } },
      { path: 'reports/categories', element: <ReportCategoriesPage />, handle: { titleKey: 'nav.reportsCategories' } },
      { path: 'reports/trends', element: <ReportTrendsPage />, handle: { titleKey: 'nav.reportsTrends' } },
      { path: 'reports/net-worth', element: <ReportNetWorthPage />, handle: { titleKey: 'nav.reportsNetWorth' } },
      { path: 'reports/budget', element: <ReportBudgetPage />, handle: { titleKey: 'nav.reportsBudget' } },
      { path: 'calendar', element: <CalendarPage />, handle: { titleKey: 'nav.calendar' } },
      { path: 'import', element: <ImportPage />, handle: { titleKey: 'nav.import' } },
      { path: 'settings/*', element: <SettingsPage />, handle: { titleKey: 'nav.settings' } },
      { path: 'help', element: <HelpPage />, handle: { titleKey: 'nav.help' } },
    ],
  },
  // Catch-all: use replace to avoid polluting history
  { path: '*', element: <Navigate to="/" replace /> },
])

export function AppRouter() {
  return (
    <Suspense fallback={fallback}>
      <RouterProvider router={router} />
    </Suspense>
  )
}
