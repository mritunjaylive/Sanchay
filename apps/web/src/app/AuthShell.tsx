import { Suspense } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { LoadingSpinner, Logo, BrandName } from '../ui'
import { ShieldCheck, WifiOff, RefreshCw } from 'lucide-react'

export function AuthShell() {
  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-surface text-text transition-colors duration-200">
      {/* Left Brand Panel (Desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 xl:p-16 relative overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-amber-500/10 border-r border-border/50">
        {/* Subtle decorative glow */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <Logo size={42} className="shadow-md rounded-2xl group-hover:scale-105 transition-transform" />
            <BrandName className="text-2xl text-text" />
          </Link>
        </div>

        {/* Value Proposition & Trust Points */}
        <div className="relative z-10 space-y-8 my-auto py-12 max-w-md">
          <div className="space-y-3">
            <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight text-text leading-tight">
              Save. Grow. <span className="text-primary">Prosper.</span>
            </h1>
            <p className="text-sm xl:text-base text-text-muted leading-relaxed">
              The modern, privacy-first personal finance platform engineered to keep you in complete control of your financial freedom.
            </p>
          </div>

          {/* 3 Trust Points */}
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <WifiOff size={18} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-text">100% Offline-First</h4>
                <p className="text-xs text-text-muted mt-0.5">Instant speed. Every screen works without internet connectivity.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-text">Private & Encrypted</h4>
                <p className="text-xs text-text-muted mt-0.5">Your financial data stays securely on your device with optional PIN lock.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <RefreshCw size={18} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-text">Sync Across Devices</h4>
                <p className="text-xs text-text-muted mt-0.5">Seamless cloud backup with Supabase whenever you are connected.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-text-muted">
          <span>© {new Date().getFullYear()} <BrandName className="text-xs font-semibold" /> • All rights reserved</span>
        </div>
      </div>

      {/* Right Form Panel (Full bleed on mobile, centered on desktop) */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-4 sm:p-8 lg:p-12 min-h-dvh lg:min-h-0 overflow-y-auto">
        {/* Mobile top logo */}
        <header className="lg:hidden flex items-center justify-between py-3 px-1">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo size={36} className="shadow-xs rounded-xl" />
            <BrandName className="text-xl text-text" />
          </Link>
        </header>

        {/* Main form outlet */}
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

        {/* Mobile footer */}
        <footer className="lg:hidden py-3 text-center text-xs text-text-muted">
          <span>© {new Date().getFullYear()} <BrandName className="text-xs font-semibold" /></span>
        </footer>
      </div>
    </div>
  )
}
