import { Suspense } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'

export function AuthShell() {
  return (
    <div className="min-h-dvh flex flex-col justify-between bg-surface p-4 sm:p-6 transition-colors duration-200">
      {/* Top Header */}
      <header className="w-full max-w-lg mx-auto flex items-center justify-between py-2 px-1">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-105 transition-transform">
            <span className="text-xl">💰</span>
          </div>
          <span className="font-bold text-xl text-text tracking-tight group-hover:text-primary transition-colors">
            Sanchay
          </span>
        </Link>
        <LanguageSwitcher variant="pill" />
      </header>

      {/* Main Form Content */}
      <main className="w-full max-w-md mx-auto my-auto py-6">
        <Suspense
          fallback={
            <div className="p-12 flex items-center justify-center">
              <LoadingSpinner size="lg" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      {/* Subtle Footer */}
      <footer className="w-full max-w-lg mx-auto py-3 text-center text-xs text-text-muted">
        <span>© {new Date().getFullYear()} Sanchay • 100% Offline-First Personal Finance</span>
      </footer>
    </div>
  )
}
