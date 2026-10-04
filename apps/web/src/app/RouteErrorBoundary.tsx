import { useRouteError, useNavigate } from 'react-router-dom'
import { AlertTriangle, RefreshCw, Home, ArrowLeft } from 'lucide-react'
import { Button } from '../ui'

export function RouteErrorBoundary() {
  const error = useRouteError() as Error | null
  const navigate = useNavigate()

  const errorMessage = error?.message || 'An unexpected error occurred while loading this page.'
  const isChunkError =
    errorMessage.includes('Failed to fetch dynamically imported module') ||
    errorMessage.includes('error loading dynamically imported module') ||
    errorMessage.includes('Importing a module script failed')

  const handleReload = () => {
    window.location.reload()
  }

  const handleGoHome = () => {
    navigate('/', { replace: true })
  }

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md p-6 bg-surface-elevated border border-border rounded-2xl shadow-xl text-center">
        <div className="w-14 h-14 bg-danger/10 text-danger rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} />
        </div>

        <h1 className="text-xl font-bold text-text mb-2">
          {isChunkError ? 'Module Update Available' : 'Something went wrong'}
        </h1>

        <p className="text-sm text-text-muted mb-6">
          {isChunkError
            ? 'The application was updated or the development server restarted. Please reload to fetch the latest version.'
            : errorMessage}
        </p>

        <div className="space-y-3">
          <Button
            variant="primary"
            className="w-full justify-center gap-2"
            onClick={handleReload}
          >
            <RefreshCw size={16} />
            <span>Reload Page</span>
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 justify-center gap-2"
              onClick={handleGoBack}
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </Button>
            <Button
              variant="secondary"
              className="flex-1 justify-center gap-2"
              onClick={handleGoHome}
            >
              <Home size={16} />
              <span>Home</span>
            </Button>
          </div>
        </div>

        {error && (
          <details className="mt-6 text-left border-t border-border pt-4">
            <summary className="text-xs text-text-muted cursor-pointer hover:text-text font-mono">
              Technical Details
            </summary>
            <pre className="mt-2 p-3 bg-surface rounded-lg text-[11px] font-mono text-danger overflow-x-auto whitespace-pre-wrap">
              {error.stack || error.message}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
