import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../db/db'
import { useSyncStore } from '../stores/syncStore'
import { syncEngine } from '../services/syncEngine'
import { Modal, Button, Badge } from '../../../ui'
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  WifiOff,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react'
import type { OutboxEntry } from '@sanchay/shared'

interface SyncDiagnosticsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SyncDiagnosticsModal({ isOpen, onClose }: SyncDiagnosticsModalProps) {
  const { t } = useTranslation()
  const { status, pendingCount, lastSyncAt, lastError, lastErrorDetail } = useSyncStore()
  const [showTechDetails, setShowTechDetails] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDiscardId, setConfirmDiscardId] = useState<number | null>(null)

  const failedItems = useLiveQuery(
    () => db.outbox.where('status').equals('failed').toArray(),
    [],
    [] as OutboxEntry[],
  )

  const blockedItems = useLiveQuery(
    () => db.outbox.where('status').equals('blocked').toArray(),
    [],
    [] as OutboxEntry[],
  )

  const isSyncing = status === 'syncing'

  const handleRetryNow = () => {
    syncEngine.triggerSync(true)
  }

  const handleRetryItem = async (id?: number) => {
    if (id !== undefined) {
      await syncEngine.retryFailedItem(id)
    }
  }

  const handleDiscardItem = async (id?: number) => {
    if (id !== undefined) {
      await syncEngine.discardFailedItem(id)
      setConfirmDiscardId(null)
    }
  }

  const handleCopyDiagnostics = async () => {
    const payload = {
      timestamp: new Date().toISOString(),
      status,
      pendingCount,
      lastSyncAt,
      lastError,
      lastErrorDetail,
      failedCount: failedItems.length,
      blockedCount: blockedItems.length,
      failedItems: failedItems.map((f) => ({
        table: f.table,
        rowId: f.rowId,
        op: f.op,
        attempts: f.attempts ?? f.attempt,
        lastError: f.lastError,
        lastAttemptAt: f.lastAttemptAt,
      })),
      blockedItems: blockedItems.map((b) => ({
        table: b.table,
        rowId: b.rowId,
        op: b.op,
      })),
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard write failed
    }
  }

  function getItemName(item: OutboxEntry): string {
    const snap = item.snapshot as Record<string, unknown> | undefined
    if (!snap) return item.rowId
    return (
      (snap.name as string) ||
      (snap.display_name as string) ||
      (snap.payee as string) ||
      (snap.title as string) ||
      `${item.table} (${item.rowId.slice(0, 8)})`
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('sync.diagnostics.title', 'Sync Diagnostics')}
      size="md"
    >
      <div className="space-y-4">
        {/* Status card */}
        <div className="p-3 bg-surface-subtle rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            {status === 'synced' && <CheckCircle2 className="w-5 h-5 text-success" />}
            {status === 'syncing' && <RefreshCw className="w-5 h-5 text-primary animate-spin" />}
            {status === 'pending' && <Clock className="w-5 h-5 text-warning" />}
            {status === 'offline' && <WifiOff className="w-5 h-5 text-text-muted" />}
            {(status === 'error' || status === 'auth_required') && (
              <AlertTriangle className="w-5 h-5 text-danger" />
            )}
            <div>
              <p className="text-sm font-semibold capitalize">
                {t(`sync.${status}`, status)}
              </p>
              <p className="text-xs text-text-muted">
                {lastSyncAt
                  ? t('sync.diagnostics.lastSync', 'Last synced') + ': ' + new Date(lastSyncAt).toLocaleTimeString()
                  : t('settings.never', 'Never')}
              </p>
            </div>
          </div>
          <Badge variant={status === 'synced' ? 'success' : status === 'error' ? 'danger' : 'neutral'}>
            {pendingCount} {t('sync.diagnostics.pendingChanges', 'pending')}
          </Badge>
        </div>

        {/* Error notice if present */}
        {lastError && (
          <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-xs space-y-1">
            <p className="font-semibold">{t('sync.diagnostics.errorTitle', 'Sync Error')}</p>
            <p className="font-mono text-[11px] break-words">{lastError}</p>
          </div>
        )}

        {/* Actions row */}
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleRetryNow}
            disabled={isSyncing}
            className="flex-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {t('sync.diagnostics.retryNow', 'Retry now')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopyDiagnostics}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 mr-1 text-success" />
            ) : (
              <Copy className="w-3.5 h-3.5 mr-1" />
            )}
            {copied
              ? t('sync.diagnostics.copied', 'Copied')
              : t('sync.diagnostics.copyDiagnostics', 'Copy diagnostics')}
          </Button>
        </div>

        {/* Problem items list */}
        {failedItems.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              {t('sync.diagnostics.failedItems', 'Problem Items')} ({failedItems.length})
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {failedItems.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 bg-surface-subtle border border-danger/30 rounded-lg text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text">
                      {item.table}: {getItemName(item)}
                    </span>
                    <Badge variant="danger" size="sm">
                      {t('sync.diagnostics.failedBadge', 'Failed')} ({item.attempts ?? item.attempt})
                    </Badge>
                  </div>
                  {item.lastError && (
                    <p className="text-[11px] text-danger/90 font-mono break-words">
                      {item.lastError}
                    </p>
                  )}
                  {confirmDiscardId === item.id ? (
                    <div className="p-2 bg-danger/10 rounded flex flex-col gap-1.5">
                      <p className="text-[11px] text-danger font-medium">
                        {t('sync.diagnostics.discardConfirm', 'Discard local change? This cannot be undone.')}
                      </p>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDiscardId(null)}
                        >
                          {t('common.cancel', 'Cancel')}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDiscardItem(item.id)}
                        >
                          {t('sync.diagnostics.discardItem', 'Discard')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-1.5 pt-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRetryItem(item.id)}
                      >
                        {t('sync.diagnostics.retryItem', 'Retry')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger/10"
                        onClick={() => setConfirmDiscardId(item.id ?? null)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        {t('sync.diagnostics.discardItem', 'Discard')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Technical details toggle */}
        <div className="pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => setShowTechDetails(!showTechDetails)}
            className="flex items-center justify-between w-full text-xs text-text-muted hover:text-text transition-colors py-1"
          >
            <span>
              {showTechDetails
                ? t('sync.diagnostics.hideTechDetails', 'Hide technical details')
                : t('sync.diagnostics.showTechDetails', 'Show technical details')}
            </span>
            {showTechDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showTechDetails && (
            <div className="mt-2 p-2 bg-surface-subtle rounded-lg text-[11px] font-mono text-text-muted space-y-1">
              <p>Status: {status}</p>
              <p>Leader: {syncEngine.getLeaderStatus() ? 'Yes' : 'No'}</p>
              <p>Online: {typeof navigator !== 'undefined' ? (navigator.onLine ? 'Yes' : 'No') : 'Unknown'}</p>
              <p>Pending outbox: {pendingCount}</p>
              <p>Failed items: {failedItems.length}</p>
              <p>Blocked items: {blockedItems.length}</p>
              {lastErrorDetail && (
                <pre className="mt-1 p-1 bg-surface rounded text-[10px] whitespace-pre-wrap overflow-x-auto">
                  {JSON.stringify(lastErrorDetail, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
