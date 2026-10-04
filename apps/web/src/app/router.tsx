import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
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
const HelpPage = lazy(() => import('../features/help/screens/HelpScreen'))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!session) return <Navigate to="/auth/sign-in" replace />
  return <>{children}</>
}

function RequireOnboarded({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session)
  const profile = useAuthStore((s) => s.profile)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!session) return <Navigate to="/auth/sign-in" replace />
  if (!profile?.onboardedAt) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

const fallback = (
  <div className="min-h-screen flex items-center justify-center bg-surface">
    <LoadingSpinner size="lg" />
  </div>
)

const router = createBrowserRouter([
  // Auth routes (no shell)
  {
    path: '/auth',
    element: <AuthShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: 'sign-in', element: <SignInPage /> },
      { path: 'sign-up', element: <SignUpPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'magic-link', element: <MagicLinkPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
    ],
  },
  // Onboarding
  {
    path: '/onboarding',
    errorElement: <RouteErrorBoundary />,
    element: (
      <RequireAuth>
        <Suspense fallback={fallback}>
          <OnboardingPage />
        </Suspense>
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
      { index: true, element: <HomePage /> },
      { path: 'transactions', element: <TransactionsPage /> },
      { path: 'transactions/new', element: <TransactionEditorPage /> },
      { path: 'transactions/:id', element: <TransactionEditorPage /> },
      { path: 'accounts', element: <AccountsPage /> },
      { path: 'accounts/:id', element: <AccountDetailPage /> },
      { path: 'budgets', element: <BudgetsPage /> },
      { path: 'bills', element: <BillsPage /> },
      { path: 'loans', element: <LoansPage /> },
      { path: 'goals', element: <GoalsPage /> },
      { path: 'reports/summary', element: <ReportSummaryPage /> },
      { path: 'reports/categories', element: <ReportCategoriesPage /> },
      { path: 'reports/trends', element: <ReportTrendsPage /> },
      { path: 'reports/net-worth', element: <ReportNetWorthPage /> },
      { path: 'reports/budget', element: <ReportBudgetPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'import', element: <ImportPage /> },
      { path: 'settings/*', element: <SettingsPage /> },
      { path: 'help', element: <HelpPage /> },
    ],
  },
  // Catch-all
  { path: '*', element: <Navigate to="/" replace /> },
])

export function AppRouter() {
  return (
    <Suspense fallback={fallback}>
      <RouterProvider router={router} />
    </Suspense>
  )
}
