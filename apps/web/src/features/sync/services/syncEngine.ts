/**
 * features/sync/services/syncEngine.ts — Background sync engine.
 *
 * Implements:
 * - Single-tab leader election via Web Locks API (`navigator.locks`)
 * - Cross-tab communication via `BroadcastChannel`
 * - Push phase: batches outbox changes in dependency order via `sync_push` RPC
 * - Outbox quarantine: isolated poison/failed rows with status: pending | failed | blocked
 * - Isolated pull failures: table-by-table pull with individual try/catch
 * - Pull phase: pulls changes since cursor via `sync_pull` RPC with overlap
 * - Idempotent apply with LWW conflict resolution
 * - Exponential backoff with jitter on network/server errors
 * - Materialization of due recurring occurrences post-sync
 * - Reset-required automatic recovery
 *
 * @see Sanchay_spec.md section 9
 */

import { db } from '../../../db/db'
import { fromServer } from '../../../db/mapper'
import { TABLES, type TableName, type OutboxEntry } from '@sanchay/shared'
import { useSyncStore, type SyncErrorDetail } from '../stores/syncStore'
import { recurringRepo } from '../../../db/repositories/recurringRepo'
import type { Table } from 'dexie'

const BROADCAST_CHANNEL_NAME = 'sanchay_sync_channel'
const LOCK_NAME = 'sanchay_sync_leader_lock'
export const PUSH_BATCH_SIZE = 50
export const PULL_BATCH_SIZE = 500
const MAX_PUSH_BATCHES = 10

export interface SyncPushResult {
  accepted?: Array<{ table: string; id: string; version: number; server_seq: number }>
  rejected?: Array<{
    table: string
    /** Row id (older servers only send `row`; see `rejectedRowId`). */
    id?: string
    row?: { id?: string } & Record<string, unknown>
    server_row?: Record<string, unknown>
    error?: string
  }>
}

/** Parses an ISO timestamp (any offset / precision) to epoch ms. Returns NaN when invalid. */
export function tsMs(value: string | null | undefined): number {
  if (!value) return Number.NaN
  return Date.parse(value)
}

/** True when `a` is strictly later than `b`. Falls back to string compare when unparsable. */
export function isLater(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = tsMs(a)
  const y = tsMs(b)
  if (Number.isNaN(x) || Number.isNaN(y)) return (a ?? '') > (b ?? '')
  return x > y
}

/** Extracts the row id from a rejected push item regardless of server version. */
export function rejectedRowId(item: NonNullable<SyncPushResult['rejected']>[number]): string | undefined {
  return item.id ?? (item.row && typeof item.row.id === 'string' ? item.row.id : undefined)
}

const MAX_AUTH_RETRIES = 2

/**
 * Returns true when `child` (an outbox entry) holds a foreign key pointing at the failed parent row.
 * Snapshot keys are snake_case (see mapper.toServer).
 */
function isDependentOf(
  child: { table: string; snapshot?: unknown },
  parentTable: string,
  parentRowId: string,
): boolean {
  const snap = child.snapshot as Record<string, unknown> | undefined
  if (!snap) return false
  switch (parentTable) {
    case 'accounts':
      return (
        (child.table === 'transactions' &&
          (snap.account_id === parentRowId || snap.to_account_id === parentRowId)) ||
        (child.table === 'recurring_rules' &&
          (snap.account_id === parentRowId || snap.to_account_id === parentRowId)) ||
        (child.table === 'loan_terms' && snap.account_id === parentRowId) ||
        (child.table === 'goals' && snap.linked_account_id === parentRowId)
      )
    case 'categories':
      return (
        (child.table === 'transactions' && snap.category_id === parentRowId) ||
        (child.table === 'budgets' && snap.category_id === parentRowId) ||
        (child.table === 'recurring_rules' && snap.category_id === parentRowId) ||
        (child.table === 'loan_terms' && snap.interest_category_id === parentRowId) ||
        (child.table === 'categories' && snap.parent_id === parentRowId)
      )
    case 'recurring_rules':
      return (
        (child.table === 'recurring_overrides' && snap.rule_id === parentRowId) ||
        (child.table === 'transactions' && snap.recurring_rule_id === parentRowId)
      )
    case 'goals':
      return child.table === 'goal_contributions' && snap.goal_id === parentRowId
    case 'transactions':
      return (
        (child.table === 'transaction_tags' && snap.transaction_id === parentRowId) ||
        (child.table === 'attachments' && snap.transaction_id === parentRowId)
      )
    case 'tags':
      return child.table === 'transaction_tags' && snap.tag_id === parentRowId
    default:
      return false
  }
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

// Module-level guard to ensure init() is idempotent across StrictMode & HMR
let _initialized = false

export class SyncEngine {
  private channel: BroadcastChannel | null = null
  private isLeader = false
  private isSyncing = false
  private syncTimer: number | null = null
  private debounceTimer: number | null = null
  private retryTimer: number | null = null
  private retryCount = 0
  private authRetryCount = 0
  private releaseLock: (() => void) | null = null

  private networkClient: SyncNetworkClient
  private clock: () => Date
  private isOnline: () => boolean
  private requestLock: (name: string, callback: () => Promise<void>) => Promise<void>
  private onResetRequired?: (() => Promise<void>) | undefined
  private onMaterialize?: ((userId: string) => Promise<void>) | undefined

  private onOnlineListener: (() => void) | null = null
  private onOfflineListener: (() => void) | null = null
  private onVisibilityListener: (() => void) | null = null

  constructor(options: SyncEngineOptions = {}) {
    this.networkClient = options.networkClient ?? {
      getSession: async () => {
        const { supabase } = await import('../../../lib/supabase')
        return supabase.auth.getSession()
      },
      push: async (changes) => {
        const { supabase } = await import('../../../lib/supabase')
        const { data, error } = await supabase.rpc('sync_push', { changes })
        return { data, error: error ? Object.assign(new Error(error.message), { code: error.code }) : null }
      },
      pull: async (params) => {
        const { supabase } = await import('../../../lib/supabase')
        const { data, error } = await supabase.rpc('sync_pull', params)
        return { data, error: error ? Object.assign(new Error(error.message), { code: error.code }) : null }
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
    if (_initialized) return
    _initialized = true

    // Setup cross-tab broadcast
    try {
      this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
      this.channel.onmessage = (event) => {
        const { type, payload } = event.data || {}
        if (type === 'SYNC_REQUEST') {
          // A follower tab wrote data; the leader must push it even if this tab is hidden.
          if (this.isLeader) this.triggerSync(true)
          return
        }
        if (type === 'SYNC_STATE_CHANGED' && payload) {
          const store = useSyncStore.getState()
          if (payload.status) store.setStatus(payload.status)
          if (payload.pendingCount !== undefined) store.setPendingCount(payload.pendingCount)
          if (payload.lastSyncAt !== undefined) store.setLastSyncAt(payload.lastSyncAt)
          if (payload.lastError !== undefined) store.setLastError(payload.lastError)
          if (payload.lastErrorDetail !== undefined) store.setLastErrorDetail(payload.lastErrorDetail)
        }
      }
    } catch (e) {
      console.warn('BroadcastChannel not supported in this environment', e)
    }

    // Register event listeners
    this.onOnlineListener = () => this.triggerSync(true)
    this.onOfflineListener = () => {
      useSyncStore.getState().setStatus('offline')
      this.broadcastState({ status: 'offline' })
    }
    this.onVisibilityListener = () => {
      if (document.visibilityState === 'visible') {
        this.triggerSync()
      }
    }

    window.addEventListener('online', this.onOnlineListener)
    window.addEventListener('offline', this.onOfflineListener)
    document.addEventListener('visibilitychange', this.onVisibilityListener)

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
      new Promise<void>((resolve) => {
        // Keep the lock until destroy() so a re-init (StrictMode / HMR) can re-acquire it.
        this.releaseLock = resolve
        this.isLeader = true
        this.startLeaderLoop()
      }),
    ).catch(() => {
      this.isLeader = false
    })
  }

  private startLeaderLoop(): void {
    if (typeof window === 'undefined') return

    if (this.syncTimer) window.clearInterval(this.syncTimer)
    this.syncTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !this.isSyncing) {
        this.sync()
      }
    }, 60000)

    this.triggerSync()
  }

  destroy(): void {
    _initialized = false
    if (this.syncTimer) clearInterval(this.syncTimer)
    this.syncTimer = null
    if (this.releaseLock) {
      this.releaseLock()
      this.releaseLock = null
    }
    this.isLeader = false
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    if (this.retryTimer) clearTimeout(this.retryTimer)

    if (this.onOnlineListener && typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnlineListener)
    }
    if (this.onOfflineListener && typeof window !== 'undefined') {
      window.removeEventListener('offline', this.onOfflineListener)
    }
    if (this.onVisibilityListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityListener)
    }

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
      const count = await db.outbox
        .filter((e) => !e.status || e.status === 'pending')
        .count()
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

    if (!this.isLeader) {
      // Only the leader tab talks to the server; ask it to sync on our behalf.
      this.broadcastRaw({ type: 'SYNC_REQUEST' })
      return
    }

    if (immediate) {
      this.sync()
    } else {
      setTimeout(() => this.sync(), 100)
    }
  }

  private broadcastRaw(message: Record<string, unknown>): void {
    try {
      this.channel?.postMessage(message)
    } catch {
      // Ignore broadcast errors
    }
  }

  /** Run a single pull phase directly, e.g. during profile hydration */
  async pullOnce(): Promise<void> {
    if (!this.isOnline()) return
    await this.pullPhase()
  }

  /**
   * Best-effort final push, e.g. before signing out. Works from any tab (not only the leader),
   * waits for an in-flight sync, and resolves with the number of outbox rows still unsynced.
   */
  async flush(timeoutMs = 8000): Promise<number> {
    const deadline = Date.now() + timeoutMs
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

    try {
      if (this.isOnline()) {
        while (this.isSyncing && Date.now() < deadline) await sleep(100)
        await Promise.race([this.sync(true), sleep(Math.max(0, deadline - Date.now()))])
      }
    } catch {
      // Fall through: report whatever is still pending.
    }
    return db.outbox.count()
  }

  async sync(force = false): Promise<void> {
    if ((!this.isLeader && !force) || this.isSyncing) return
    if (!this.isOnline()) {
      useSyncStore.getState().setStatus('offline')
      return
    }

    let session = null
    try {
      const res = await this.networkClient.getSession()
      session = res.data.session
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('fetch') || msg.includes('network') || !this.isOnline()) {
        useSyncStore.getState().setStatus('offline')
        this.broadcastState({ status: 'offline' })
        return
      }
      useSyncStore.getState().setStatus('auth_required')
      this.broadcastState({ status: 'auth_required' })
      return
    }

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
      // 1. Push Phase — loop until outbox is empty or MAX_PUSH_BATCHES reached
      let batchesPushed = 0
      while (batchesPushed < MAX_PUSH_BATCHES) {
        const hasMore = await this.pushPhase()
        if (!hasMore) break
        batchesPushed++
      }

      // 2. Pull Phase — table by table with isolated failure isolation
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
      this.authRetryCount = 0
      const now = this.clock().toISOString()
      const pendingCount = await this.updatePendingCount()
      const failedCount = await db.outbox.where('status').equals('failed').count()

      const newStatus = failedCount > 0 ? 'error' : pendingCount > 0 ? 'pending' : 'synced'

      store.setStatus(newStatus)
      store.setLastSyncAt(now)
      store.setLastError(null)
      store.setLastErrorDetail(null)
      this.broadcastState({
        status: newStatus,
        lastSyncAt: now,
        lastError: null,
        lastErrorDetail: null,
        pendingCount,
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const errLower = errorMessage.toLowerCase()
      const errCode = String((err as { code?: unknown } | null)?.code ?? '')

      // Classify error:
      if (
        !this.isOnline() ||
        errLower.includes('failed to fetch') ||
        errLower.includes('network') ||
        errLower.includes('networkerror')
      ) {
        store.setStatus('offline')
        store.setLastError(null)
        this.broadcastState({ status: 'offline', lastError: null })
        return
      }

      if (
        errLower.includes('jwt') ||
        errCode === 'PGRST301' ||
        errCode === '401' ||
        /\bhttp 401\b|\bstatus 401\b/.test(errLower) ||
        errLower.includes('unauthorized') ||
        errLower.includes('token expired')
      ) {
        if (this.authRetryCount < MAX_AUTH_RETRIES) {
          this.authRetryCount++
          try {
            const { supabase } = await import('../../../lib/supabase')
            const { error: refreshErr } = await supabase.auth.refreshSession()
            if (!refreshErr) {
              setTimeout(() => this.sync(), 500)
              return
            }
          } catch {
            // refresh failed
          }
        }
        store.setStatus('auth_required')
        store.setLastError('Sign in required')
        this.broadcastState({ status: 'auth_required', lastError: 'Sign in required' })
        return
      }

      console.error('Sync failed:', errorMessage)
      this.retryCount++

      const errorDetail: SyncErrorDetail = {
        userMessage: 'Synchronization encountered an error',
        detail: errorMessage,
      }

      store.setStatus('error')
      store.setLastError(errorMessage)
      store.setLastErrorDetail(errorDetail)
      this.broadcastState({ status: 'error', lastError: errorMessage, lastErrorDetail: errorDetail })

      // Clear existing retry timer before setting a new one
      if (this.retryTimer && typeof window !== 'undefined') {
        window.clearTimeout(this.retryTimer)
      }

      // Exponential backoff with jitter
      const backoffMs = this.computeBackoffMs(this.retryCount)
      if (typeof window !== 'undefined') {
        this.retryTimer = window.setTimeout(() => {
          if (this.isOnline()) this.sync()
        }, backoffMs)
      }
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * Pushes one batch of pending changes. Returns true if there are more pending entries.
   */
  private async pushPhase(): Promise<boolean> {
    // Select pending entries in FK-dependency (table) order across batches, so a child row is
    // never pushed in an earlier batch than its parent. Failed / blocked entries are quarantined.
    const outboxEntries: OutboxEntry[] = []
    for (const tbl of TABLES) {
      const remaining = PUSH_BATCH_SIZE - outboxEntries.length
      if (remaining <= 0) break
      const rows = await db.outbox
        .where('table')
        .equals(tbl)
        .filter((e) => !e.status || e.status === 'pending')
        .limit(remaining)
        .toArray()
      outboxEntries.push(...rows)
    }

    if (outboxEntries.length === 0) return false

    // Remember exactly what was sent, so that edits made while the request is in flight are
    // never discarded when the server acknowledges the older snapshot.
    const sent = new Map<string, OutboxEntry>()
    for (const e of outboxEntries) sent.set(`${e.table}:${e.rowId}`, e)

    const changes = outboxEntries.map((e) => ({
      table: e.table,
      row: e.snapshot,
    }))

    const { data, error } = await this.networkClient.push(changes)
    if (error) throw error

    const acceptedList = data?.accepted ?? []
    const rejectedList = data?.rejected ?? []

    /** True when the outbox entry was modified after it was sent. */
    const changedSinceSent = (current: OutboxEntry, original: OutboxEntry | undefined): boolean => {
      if (!original) return false
      const curVersion = (current.snapshot as Record<string, unknown> | undefined)?.version
      const oldVersion = (original.snapshot as Record<string, unknown> | undefined)?.version
      return current.updatedAt !== original.updatedAt || curVersion !== oldVersion
    }

    // Remove accepted changes from outbox (only when they were not edited again meanwhile)
    await db.transaction('rw', db.outbox, async () => {
      for (const item of acceptedList) {
        const matching = await db.outbox
          .where('table')
          .equals(item.table)
          .and((e) => e.rowId === item.id)
          .first()
        if (!matching?.id) continue
        if (changedSinceSent(matching, sent.get(`${item.table}:${item.id}`))) continue
        await db.outbox.delete(matching.id)
      }
    })

    // Handle rejected changes
    for (const item of rejectedList) {
      const rowId = rejectedRowId(item)
      if (!rowId) continue
      const original = sent.get(`${item.table}:${rowId}`)

      if (item.server_row) {
        // LWW resolution: the server already holds a newer (or equal) version of this row.
        const tableName = item.table as TableName
        const tbl = this.getTableInstance(tableName)
        if (!tbl) continue
        const serverRow = fromServer(item.server_row) as Record<string, unknown> & {
          id: string
          updatedAt?: string
        }
        await db.transaction('rw', [tbl, db.outbox], async () => {
          const pendingOutbox = await db.outbox
            .where('table')
            .equals(tableName)
            .and((e) => e.rowId === rowId)
            .first()

          // If the user edited the row again after we sent it, keep that newer local edit
          // (and its outbox entry) so it is pushed on the next sync.
          if (pendingOutbox && changedSinceSent(pendingOutbox, original)) return

          await (tbl as Table<unknown, string>).put(serverRow)
          if (pendingOutbox?.id) await db.outbox.delete(pendingOutbox.id)
        })
      } else if (item.error) {
        // Error-only rejection (e.g. FK, constraint, check violation)
        // Increment attempts, store error, and quarantine if permanent
        const matching = await db.outbox
          .where('table')
          .equals(item.table)
          .and((e) => e.rowId === rowId)
          .first()

        if (matching?.id) {
          const attempts = (matching.attempts ?? matching.attempt ?? 0) + 1
          const lastError = item.error
          const lastAttemptAt = this.clock().toISOString()
          const errLower = lastError.toLowerCase()

          const isPermanent =
            errLower.includes('foreign key') ||
            errLower.includes('violates foreign key') ||
            errLower.includes('violates check') ||
            errLower.includes('violates not-null') ||
            errLower.includes('violates unique') ||
            errLower.includes('duplicate key') ||
            errLower.includes('not allowed') ||
            errLower.includes('permission denied') ||
            attempts >= 3

          const status = isPermanent ? 'failed' : 'pending'

          await db.outbox.update(matching.id, {
            attempts,
            attempt: attempts,
            lastError,
            lastAttemptAt,
            status,
          })

          if (status === 'failed') {
            await this.blockDependentOutboxRows(item.table as TableName, rowId)
          }
        }
      }
    }

    return outboxEntries.length === PUSH_BATCH_SIZE
  }

  /**
   * Mark dependent child outbox rows as 'blocked' so they don't produce cascading errors.
   */
  private async blockDependentOutboxRows(parentTable: TableName, parentRowId: string): Promise<void> {
    const childPending = await db.outbox
      .filter((e) => !e.status || e.status === 'pending')
      .toArray()

    for (const child of childPending) {
      if (child.id && isDependentOf(child, parentTable, parentRowId)) {
        await db.outbox.update(child.id, { status: 'blocked' })
      }
    }
  }

  /**
   * Unblock dependent child outbox rows when a parent is retried or discarded.
   */
  private async unblockDependentOutboxRows(parentTable: TableName, parentRowId: string): Promise<void> {
    const blockedRows = await db.outbox.where('status').equals('blocked').toArray()

    for (const child of blockedRows) {
      if (child.id && isDependentOf(child, parentTable, parentRowId)) {
        await db.outbox.update(child.id, { status: 'pending' })
      }
    }
  }

  /**
   * Pulls all tables, wrapping each table in its own try/catch to isolate failures.
   */
  private async pullPhase(): Promise<void> {
    const tableErrors: Array<{ table: TableName; message: string }> = []

    for (const table of TABLES) {
      try {
        await this.pullTable(table)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn(`Pull failed for table ${table}:`, message)
        tableErrors.push({ table, message })
      }
    }

    if (tableErrors.length > 0 && tableErrors.length === TABLES.length) {
      throw new Error(`Pull failed for all tables: ${tableErrors.map((e) => `${e.table}: ${e.message}`).join(', ')}`)
    }
  }

  private async pullTable(table: TableName): Promise<void> {
    let hasMore = true
    let isFirstPage = true
    const state = await db.syncState.get(table)
    let currentCursor = state?.cursor ?? 0
    // Set after a server `reset_required`: ids seen during the full re-pull.
    let resetSeenIds: Set<string> | null = null
    let completed = false

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
        if (resetSeenIds) {
          throw new Error(`Sync pull aborted: server requested reset again for table ${table}`)
        }
        console.warn(`[Sync] reset_required received for table ${table}; re-pulling from cursor 0`)
        resetSeenIds = new Set<string>()
        currentCursor = 0
        isFirstPage = false
        await db.syncState.put({ table, cursor: 0, lastSyncAt: null })
        if (this.onResetRequired) await this.onResetRequired()
        continue
      }

      const rows: Array<Record<string, unknown>> = data.rows ?? []
      const nextCursor: number = data.next_cursor ?? currentCursor
      hasMore = Boolean(data.has_more)

      if (hasMore && nextCursor <= currentCursor) {
        throw new Error(
          `Sync pull aborted: has_more is true but cursor did not advance for table ${table} (current: ${currentCursor}, next: ${nextCursor})`,
        )
      }

      if (rows.length > 0) {
        await this.applyPulledRows(table, rows)
        if (resetSeenIds) for (const r of rows) resetSeenIds.add(String(r.id))
      }

      // The cursor must never move backwards (the overlap window can return older rows only).
      currentCursor = Math.max(currentCursor, nextCursor)
      isFirstPage = false

      await db.syncState.put({
        table,
        cursor: currentCursor,
        lastSyncAt: this.clock().toISOString(),
      })
      if (!hasMore) completed = true
    }

    // After a full re-pull, drop local rows the server no longer has (purged tombstones),
    // except rows with unsynced local changes.
    if (resetSeenIds && completed) {
      await this.reconcileAfterReset(table, resetSeenIds)
    }
  }

  private async reconcileAfterReset(table: TableName, seenIds: Set<string>): Promise<void> {
    const tableInstance = this.getTableInstance(table)
    if (!tableInstance) return
    await db.transaction('rw', [tableInstance, db.outbox], async () => {
      const pending = new Set(
        (await db.outbox.where('table').equals(table).toArray()).map((e) => e.rowId),
      )
      await (tableInstance as Table<{ id: string }, string>)
        .filter((r) => !seenIds.has(r.id) && !pending.has(r.id))
        .delete()
    })
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

        if (pendingOutbox && localRow.updatedAt && !isLater(localRow.updatedAt, pendingOutbox.updatedAt)) {
          // Local change is newer (or equal); keep local
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

  // Diagnostics & quarantine helpers for UI
  async retryFailedItem(outboxId: number): Promise<void> {
    const item = await db.outbox.get(outboxId)
    if (!item) return
    await db.outbox.update(outboxId, {
      status: 'pending',
      attempts: 0,
      lastError: null,
    })
    await this.unblockDependentOutboxRows(item.table as TableName, item.rowId)
    this.triggerSync(true)
  }

  async discardFailedItem(outboxId: number): Promise<void> {
    const item = await db.outbox.get(outboxId)
    if (!item) return
    await db.outbox.delete(outboxId)
    await this.unblockDependentOutboxRows(item.table as TableName, item.rowId)
    await this.updatePendingCount()
  }

  async retryAllFailed(): Promise<void> {
    const failed = await db.outbox.where('status').equals('failed').toArray()
    for (const item of failed) {
      if (item.id) {
        await db.outbox.update(item.id, {
          status: 'pending',
          attempts: 0,
          lastError: null,
        })
        await this.unblockDependentOutboxRows(item.table as TableName, item.rowId)
      }
    }
    const blocked = await db.outbox.where('status').equals('blocked').toArray()
    for (const b of blocked) {
      if (b.id) {
        await db.outbox.update(b.id, { status: 'pending' })
      }
    }
    this.triggerSync(true)
  }
}

export const syncEngine = new SyncEngine()
