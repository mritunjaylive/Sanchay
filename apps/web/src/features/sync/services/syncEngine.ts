/**
 * features/sync/services/syncEngine.ts — Background sync engine.
 *
 * Implements:
 * - Single-tab leader election via Web Locks API (`navigator.locks`)
 * - Cross-tab communication via `BroadcastChannel`
 * - Push phase: batches outbox changes in dependency order via `sync_push` RPC
 * - Pull phase: pulls changes since cursor via `sync_pull` RPC with overlap
 * - Idempotent apply with LWW conflict resolution
 * - Exponential backoff with jitter on network/server errors
 * - Materialization of due recurring occurrences post-sync
 *
 * @see Sanchay_spec.md section 9
 */

import { db } from '../../../db/db'
import { fromServer } from '../../../db/mapper'
import { TABLES, type TableName } from '@sanchay/shared'
import { useSyncStore } from '../stores/syncStore'
import { recurringRepo } from '../../../db/repositories/recurringRepo'
import type { Table } from 'dexie'

const BROADCAST_CHANNEL_NAME = 'sanchay_sync_channel'
const LOCK_NAME = 'sanchay_sync_leader_lock'
export const PUSH_BATCH_SIZE = 500
export const PULL_BATCH_SIZE = 500

export interface SyncPushResult {
  accepted?: Array<{ table: string; id: string; version: number; server_seq: number }>
  rejected?: Array<{ table: string; id: string; server_row?: Record<string, unknown>; error?: string }>
}

export interface SyncPullResult {
  rows?: Array<Record<string, unknown>>
  next_cursor?: number
  has_more?: boolean
  reset_required?: boolean
}

export interface SyncNetworkClient {
  getSession: () => Promise<{ data: { session: { user: { id: string } } | null } }>
  push: (changes: Array<{ table: string; row: unknown }>) => Promise<{
    data?: SyncPushResult | null
    error?: Error | null
  }>
  pull: (params: {
    p_cursor: number
    p_tables: TableName[]
    p_page_size: number
    p_apply_overlap?: boolean
  }) => Promise<{
    data?: SyncPullResult | null
    error?: Error | null
  }>
}

export interface SyncEngineOptions {
  networkClient?: SyncNetworkClient
  clock?: () => Date
  isOnline?: () => boolean
  requestLock?: (name: string, callback: () => Promise<void>) => Promise<void>
  onResetRequired?: () => Promise<void>
  onMaterialize?: (userId: string) => Promise<void>
}

export class SyncEngine {
  private channel: BroadcastChannel | null = null
  private isLeader = false
  private isSyncing = false
  private syncTimer: number | null = null
  private debounceTimer: number | null = null
  private retryCount = 0

  private networkClient: SyncNetworkClient
  private clock: () => Date
  private isOnline: () => boolean
  private requestLock: (name: string, callback: () => Promise<void>) => Promise<void>
  private onResetRequired?: (() => Promise<void>) | undefined
  private onMaterialize?: ((userId: string) => Promise<void>) | undefined

  constructor(options: SyncEngineOptions = {}) {
    this.networkClient = options.networkClient ?? {
      getSession: async () => {
        const { supabase } = await import('../../../lib/supabase')
        return supabase.auth.getSession()
      },
      push: async (changes) => {
        const { supabase } = await import('../../../lib/supabase')
        const { data, error } = await supabase.rpc('sync_push', { changes })
        return { data, error: error ? new Error(error.message) : null }
      },
      pull: async (params) => {
        const { supabase } = await import('../../../lib/supabase')
        const { data, error } = await supabase.rpc('sync_pull', params)
        return { data, error: error ? new Error(error.message) : null }
      },
    }

    this.clock = options.clock ?? (() => new Date())
    this.isOnline = options.isOnline ?? (() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
    this.requestLock = options.requestLock ?? (async (name, callback) => {
      if (typeof navigator !== 'undefined' && navigator.locks) {
        await navigator.locks.request(name, { mode: 'exclusive' }, callback)
      } else {
        await callback()
      }
    })
    this.onResetRequired = options.onResetRequired
    this.onMaterialize = options.onMaterialize
  }

  configure(options: Partial<SyncEngineOptions>): void {
    if (options.networkClient) this.networkClient = options.networkClient
    if (options.clock) this.clock = options.clock
    if (options.isOnline) this.isOnline = options.isOnline
    if (options.requestLock) this.requestLock = options.requestLock
    if (options.onResetRequired !== undefined) this.onResetRequired = options.onResetRequired
    if (options.onMaterialize !== undefined) this.onMaterialize = options.onMaterialize
  }

  getLeaderStatus(): boolean {
    return this.isLeader
  }

  setLeader(leader: boolean): void {
    this.isLeader = leader
  }

  computeBackoffMs(retries: number): number {
    return Math.min(60000, Math.pow(2, retries) * 1000) + Math.random() * 2000
  }

  init(): void {
    if (typeof window === 'undefined') return

    // Setup cross-tab broadcast
    try {
      this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
      this.channel.onmessage = (event) => {
        const { type, payload } = event.data || {}
        if (type === 'SYNC_STATE_CHANGED' && payload) {
          const store = useSyncStore.getState()
          if (payload.status) store.setStatus(payload.status)
          if (payload.pendingCount !== undefined) store.setPendingCount(payload.pendingCount)
          if (payload.lastSyncAt !== undefined) store.setLastSyncAt(payload.lastSyncAt)
          if (payload.lastError !== undefined) store.setLastError(payload.lastError)
        }
      }
    } catch (e) {
      console.warn('BroadcastChannel not supported in this environment', e)
    }

    // Register event listeners
    window.addEventListener('online', () => this.triggerSync(true))
    window.addEventListener('offline', () => {
      useSyncStore.getState().setStatus('offline')
      this.broadcastState({ status: 'offline' })
    })

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.triggerSync()
      }
    })

    // Acquire lock to become leader
    this.acquireLeaderLock()
  }

  private broadcastState(payload: Record<string, unknown>): void {
    try {
      this.channel?.postMessage({ type: 'SYNC_STATE_CHANGED', payload })
    } catch {
      // Ignore broadcast errors
    }
  }

  private acquireLeaderLock(): void {
    this.requestLock(LOCK_NAME, () =>
      new Promise<void>(() => {
        this.isLeader = true
        this.startLeaderLoop()
      }),
    ).catch(() => {
      this.isLeader = false
    })
  }

  private startLeaderLoop(): void {
    if (typeof window === 'undefined') return

    this.syncTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !this.isSyncing) {
        this.sync()
      }
    }, 60000)

    this.triggerSync()
  }

  destroy(): void {
    if (this.syncTimer) clearInterval(this.syncTimer)
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    try {
      this.channel?.close()
    } catch {
      // ignore
    }
  }

  notifyWrite(): void {
    this.updatePendingCount()
    if (this.debounceTimer && typeof window !== 'undefined') window.clearTimeout(this.debounceTimer)
    if (typeof window !== 'undefined') {
      this.debounceTimer = window.setTimeout(() => {
        this.triggerSync()
      }, 2000)
    }
  }

  async updatePendingCount(): Promise<number> {
    try {
      const count = await db.outbox.count()
      useSyncStore.getState().setPendingCount(count)
      this.broadcastState({ pendingCount: count })
      return count
    } catch {
      return 0
    }
  }

  triggerSync(immediate = false): void {
    if (!this.isOnline()) {
      useSyncStore.getState().setStatus('offline')
      this.broadcastState({ status: 'offline' })
      return
    }

    if (immediate) {
      this.sync()
    } else {
      setTimeout(() => this.sync(), 100)
    }
  }

  async sync(): Promise<void> {
    if (!this.isLeader || this.isSyncing) return
    if (!this.isOnline()) {
      useSyncStore.getState().setStatus('offline')
      return
    }

    const {
      data: { session },
    } = await this.networkClient.getSession()

    if (!session) {
      useSyncStore.getState().setStatus('auth_required')
      this.broadcastState({ status: 'auth_required' })
      return
    }

    this.isSyncing = true
    const store = useSyncStore.getState()
    store.setStatus('syncing')
    this.broadcastState({ status: 'syncing' })

    try {
      // 1. Push Phase
      await this.pushPhase()

      // 2. Pull Phase
      await this.pullPhase()

      // 3. Post-sync maintenance: materialize due occurrences
      try {
        if (this.onMaterialize) {
          await this.onMaterialize(session.user.id)
        } else {
          await recurringRepo.materializeDueOccurrences(session.user.id)
        }
      } catch (e) {
        console.warn('Materialize occurrences error:', e)
      }

      // Success
      this.retryCount = 0
      const now = this.clock().toISOString()
      const pendingCount = await this.updatePendingCount()
      const newStatus = pendingCount > 0 ? 'pending' : 'synced'

      store.setStatus(newStatus)
      store.setLastSyncAt(now)
      store.setLastError(null)
      this.broadcastState({
        status: newStatus,
        lastSyncAt: now,
        lastError: null,
        pendingCount,
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('Sync failed:', errorMessage)

      this.retryCount++
      store.setStatus('error')
      store.setLastError(errorMessage)
      this.broadcastState({ status: 'error', lastError: errorMessage })

      // Exponential backoff with jitter
      const backoffMs = this.computeBackoffMs(this.retryCount)
      setTimeout(() => {
        if (this.isOnline()) this.sync()
      }, backoffMs)
    } finally {
      this.isSyncing = false
    }
  }

  private async pushPhase(): Promise<void> {
    const outboxEntries = await db.outbox.orderBy('id').limit(PUSH_BATCH_SIZE).toArray()
    if (outboxEntries.length === 0) return

    // Sort entries by dependency order
    const tableOrderMap = new Map<string, number>()
    TABLES.forEach((tbl, idx) => tableOrderMap.set(tbl, idx))

    const sortedEntries = [...outboxEntries].sort((a, b) => {
      const orderA = tableOrderMap.get(a.table) ?? 999
      const orderB = tableOrderMap.get(b.table) ?? 999
      return orderA - orderB
    })

    const changes = sortedEntries.map((e) => ({
      table: e.table,
      row: e.snapshot,
    }))

    const { data, error } = await this.networkClient.push(changes)
    if (error) throw error

    // Remove accepted changes from outbox
    const acceptedList = data?.accepted ?? []
    const rejectedList = data?.rejected ?? []

    await db.transaction('rw', db.outbox, async () => {
      for (const item of acceptedList) {
        const matching = await db.outbox
          .where('table')
          .equals(item.table)
          .and((e) => e.rowId === item.id)
          .first()
        if (matching?.id) {
          await db.outbox.delete(matching.id)
        }
      }
    })

    // Handle rejected changes (stale writes or server-overrides)
    if (rejectedList.length > 0) {
      for (const item of rejectedList) {
        if (item.server_row) {
          const tableName = item.table as TableName
          const tbl = this.getTableInstance(tableName)
          if (tbl) {
            const localRow = fromServer(item.server_row) as Record<string, unknown> & {
              id: string
              updatedAt?: string
            }
            await db.transaction('rw', [tbl, db.outbox], async () => {
              const pendingOutbox = await db.outbox
                .where('table')
                .equals(tableName)
                .and((e) => e.rowId === item.id)
                .first()

              // Apply server row unless local pending change is newer
              if (!pendingOutbox || !localRow.updatedAt || localRow.updatedAt > pendingOutbox.updatedAt) {
                await (tbl as Table<unknown, string>).put(localRow)
              }

              // Remove stale entry from outbox
              if (pendingOutbox?.id) {
                await db.outbox.delete(pendingOutbox.id)
              }
            })
          }
        }
      }
    }
  }

  private async pullPhase(): Promise<void> {
    for (const table of TABLES) {
      let hasMore = true
      let isFirstPage = true
      const state = await db.syncState.get(table)
      let currentCursor = state?.cursor ?? 0

      while (hasMore) {
        const { data, error } = await this.networkClient.pull({
          p_cursor: currentCursor,
          p_tables: [table],
          p_page_size: PULL_BATCH_SIZE,
          p_apply_overlap: isFirstPage,
        })

        if (error) throw error
        if (!data) break

        if (data.reset_required) {
          console.warn(`Sync reset required for table ${table}`)
          if (this.onResetRequired) {
            await this.onResetRequired()
          }
          break
        }

        const rows: Array<Record<string, unknown>> = data.rows ?? []
        const nextCursor: number = data.next_cursor ?? currentCursor
        hasMore = Boolean(data.has_more)

        // Guard against infinite loop: abort with clear error if has_more is true and cursor did not advance
        if (hasMore && nextCursor <= currentCursor) {
          throw new Error(
            `Sync pull aborted: has_more is true but cursor did not advance for table ${table} (current: ${currentCursor}, next: ${nextCursor})`,
          )
        }

        if (rows.length > 0) {
          await this.applyPulledRows(table, rows)
        }

        currentCursor = nextCursor
        isFirstPage = false

        await db.syncState.put({
          table,
          cursor: nextCursor,
          lastSyncAt: this.clock().toISOString(),
        })
      }
    }
  }

  private async applyPulledRows(
    tableName: TableName,
    rows: Array<Record<string, unknown>>,
  ): Promise<void> {
    const tableInstance = this.getTableInstance(tableName)
    if (!tableInstance) return

    await db.transaction('rw', [tableInstance, db.outbox], async () => {
      for (const serverRow of rows) {
        const localRow = fromServer(serverRow) as Record<string, unknown> & {
          id: string
          updatedAt?: string
          deletedAt?: string | null
        }
        const id = localRow.id

        // Check if there is an unsynced outbox change for this row with a newer updatedAt
        const pendingOutbox = await db.outbox
          .where('table')
          .equals(tableName)
          .and((e) => e.rowId === id)
          .first()

        if (pendingOutbox && localRow.updatedAt && pendingOutbox.updatedAt >= localRow.updatedAt) {
          // Local change is newer; keep local
          continue
        }

        await (tableInstance as Table<unknown, string>).put(localRow)
      }
    })
  }

  private getTableInstance(name: TableName) {
    switch (name) {
      case 'profiles': return db.profiles
      case 'accounts': return db.accounts
      case 'loan_terms': return db.loanTerms
      case 'categories': return db.categories
      case 'tags': return db.tags
      case 'transactions': return db.transactions
      case 'transaction_tags': return db.transactionTags
      case 'attachments': return db.attachments
      case 'budgets': return db.budgets
      case 'recurring_rules': return db.recurringRules
      case 'recurring_overrides': return db.recurringOverrides
      case 'goals': return db.goals
      case 'goal_contributions': return db.goalContributions
      case 'saved_filters': return db.savedFilters
      case 'notifications': return db.notifications
      default: return null
    }
  }
}

export const syncEngine = new SyncEngine()
