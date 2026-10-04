import { Suspense } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { LoadingSpinner, LanguageSwitcher, Logo } from '../ui'

export function AuthShell() {
  return (
    <div className="min-h-dvh flex flex-col justify-between bg-surface p-4 sm:p-6 transition-colors duration-200">
      {/* Top Header */}
      <header className="w-full max-w-lg mx-auto flex items-center justify-between py-2 px-1">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="group-hover:scale-105 transition-transform">
            <Logo size={36} className="shadow-sm rounded-xl" />
          </div>
          <span className="font-cinzel font-bold text-xl text-text tracking-wider group-hover:text-primary transition-colors">
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
