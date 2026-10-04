import { useTranslation } from 'react-i18next'
import { useSyncStore } from '../stores/syncStore'
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { SyncStatus } from '@sanchay/shared'

const statusConfig: Record<SyncStatus, {
  icon: React.ElementType
  labelKey: string
  colorClass: string
}> = {
  synced: { icon: CheckCircle2, labelKey: 'sync.synced', colorClass: 'text-success' },
  syncing: { icon: RefreshCw, labelKey: 'sync.syncing', colorClass: 'text-primary' },
  pending: { icon: Clock, labelKey: 'sync.pending', colorClass: 'text-warning' },
  offline: { icon: WifiOff, labelKey: 'sync.offline', colorClass: 'text-text-muted' },
  error: { icon: AlertCircle, labelKey: 'sync.error', colorClass: 'text-danger' },
  auth_required: { icon: Wifi, labelKey: 'sync.authRequired', colorClass: 'text-danger' },
}

export function SyncStatusBadge() {
  const { t } = useTranslation()
  const { status, pendingCount } = useSyncStore()
  const config = statusConfig[status]
  const Icon = config.icon

  const label =
    status === 'pending' && pendingCount > 0
      ? t('sync.pending', { count: pendingCount })
      : t(config.labelKey)

  return (
    <button
      type="button"
      aria-label={`Sync status: ${label}`}
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md hover:bg-surface-overlay transition-colors',
        config.colorClass,
      )}
    >
      <Icon
        size={12}
        className={cn(status === 'syncing' && 'animate-spin')}
      />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
