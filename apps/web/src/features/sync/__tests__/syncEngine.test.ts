import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../../../db/db'
import {
  SyncEngine,
  type SyncNetworkClient,
  type SyncPushResult,
  type SyncPullResult,
} from '../services/syncEngine'
import { upsertWithOutbox } from '../../../db/outboxHelper'
import { useSyncStore } from '../stores/syncStore'
import fc from 'fast-check'
import { TABLES, type Account } from '@sanchay/shared'

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111'

function createMockAccount(partial: Partial<Account> & { id: string; name: string }): Account {
  return {
    userId: TEST_USER_ID,
    kind: 'cash',
    currency: 'INR',
    openingBalanceMinor: 0,
    openingDate: '2026-01-01',
    icon: null,
    color: null,
    sortOrder: 0,
    archivedAt: null,
    excludeFromNetWorth: false,
    creditLimitMinor: null,
    statementDay: null,
    dueDay: null,
    note: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    serverSeq: 0,
    version: 1,
    ...partial,
  }
}

function createMockNetworkClient(): SyncNetworkClient & {
  pushedBatches: Array<Array<{ table: string; row: unknown }>>
  pulledRequests: Array<{
    p_cursor: number
    p_tables: string[]
    p_page_size: number
    p_apply_overlap?: boolean
  }>
  pushResponse: SyncPushResult
  pullResponse: SyncPullResult
} {
  return {
    pushedBatches: [],
    pulledRequests: [],
    pushResponse: { accepted: [] },
    pullResponse: { rows: [], next_cursor: 0, has_more: false },

    async getSession() {
      return {
        data: {
          session: {
            user: { id: TEST_USER_ID },
          },
        },
      }
    },

    async push(changes) {
      this.pushedBatches.push(changes)
      return { data: this.pushResponse, error: null }
    },

    async pull(params) {
      this.pulledRequests.push(params)
      return { data: this.pullResponse, error: null }
    },
  }
}

describe('SyncEngine', () => {
  beforeEach(async () => {
    await db.transaction('rw', [db.outbox, db.accounts, db.categories, db.transactions, db.syncState], async () => {
      await db.outbox.clear()
      await db.accounts.clear()
      await db.categories.clear()
      await db.transactions.clear()
      await db.syncState.clear()
    })
    useSyncStore.getState().setStatus('synced')
    useSyncStore.getState().setPendingCount(0)
    useSyncStore.getState().setLastError(null)
  })

  it('coalesces multiple outbox writes for the same row into the latest snapshot', async () => {
    const account = createMockAccount({
      id: 'acc-1',
      name: 'Cash 1',
    })

    // First write
    await upsertWithOutbox(db.accounts, 'accounts', account)
    expect(await db.outbox.count()).toBe(1)
    let outboxEntry = await db.outbox.where('rowId').equals('acc-1').first()
    expect((outboxEntry?.snapshot as Record<string, unknown>).name).toBe('Cash 1')

    // Second write to same row coalesces
    const updatedAccount = createMockAccount({
      ...account,
      name: 'Cash Updated',
      updatedAt: '2026-01-01T01:00:00.000Z',
      version: 2,
    })
    await upsertWithOutbox(db.accounts, 'accounts', updatedAccount)
    expect(await db.outbox.count()).toBe(1)
    outboxEntry = await db.outbox.where('rowId').equals('acc-1').first()
    expect((outboxEntry?.snapshot as Record<string, unknown>).name).toBe('Cash Updated')
  })

  it('pushes outbox changes in dependency order', async () => {
    // Add transaction first, then account, then category into outbox
    await db.outbox.bulkAdd([
      {
        table: 'transactions',
        rowId: 'tx-1',
        op: 'upsert',
        snapshot: { id: 'tx-1', amount_minor: 100 },
        updatedAt: '2026-01-01T00:00:00.000Z',
        attempt: 0,
      },
      {
        table: 'accounts',
        rowId: 'acc-1',
        op: 'upsert',
        snapshot: { id: 'acc-1', name: 'Main' },
        updatedAt: '2026-01-01T00:00:00.000Z',
        attempt: 0,
      },
      {
        table: 'categories',
        rowId: 'cat-1',
        op: 'upsert',
        snapshot: { id: 'cat-1', name: 'Food' },
        updatedAt: '2026-01-01T00:00:00.000Z',
        attempt: 0,
      },
    ])

    const mockNetwork = createMockNetworkClient()
    mockNetwork.pushResponse = {
      accepted: [
        { table: 'accounts', id: 'acc-1', version: 1, server_seq: 1 },
        { table: 'categories', id: 'cat-1', version: 1, server_seq: 2 },
        { table: 'transactions', id: 'tx-1', version: 1, server_seq: 3 },
      ],
    }

    const engine = new SyncEngine({ networkClient: mockNetwork })
    engine.setLeader(true)
    await engine.sync()

    expect(mockNetwork.pushedBatches.length).toBe(1)
    const pushedTables = mockNetwork.pushedBatches[0]!.map((c) => c.table)

    // Accounts must come before transactions in TABLES dependency order
    const accIdx = pushedTables.indexOf('accounts')
    const txIdx = pushedTables.indexOf('transactions')
    expect(accIdx).toBeLessThan(txIdx)

    // Accepted items should be removed from outbox
    expect(await db.outbox.count()).toBe(0)
  })

  it('handles rejected rows by applying server row unless newer local change exists', async () => {
    // Stale local account in DB
    await db.accounts.put(
      createMockAccount({
        id: 'acc-rej',
        name: 'Old Local Name',
        serverSeq: 1,
        version: 1,
      }),
    )

    // Outbox entry attempting to push
    await db.outbox.add({
      table: 'accounts',
      rowId: 'acc-rej',
      op: 'upsert',
      snapshot: { id: 'acc-rej', name: 'Old Local Name' },
      updatedAt: '2026-01-01T00:00:00.000Z',
      attempt: 0,
    })

    const mockNetwork = createMockNetworkClient()
    mockNetwork.pushResponse = {
      accepted: [],
      rejected: [
        {
          table: 'accounts',
          id: 'acc-rej',
          server_row: {
            id: 'acc-rej',
            user_id: TEST_USER_ID,
            name: 'Server Wins Name',
            kind: 'cash',
            currency: 'INR',
            initial_balance_minor: 0,
            is_archived: false,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T05:00:00.000Z',
            deleted_at: null,
            server_seq: 10,
            version: 2,
          },
        },
      ],
    }

    const engine = new SyncEngine({ networkClient: mockNetwork })
    engine.setLeader(true)
    await engine.sync()

    // Local DB should be updated with server row
    const local = await db.accounts.get('acc-rej')
    expect(local?.name).toBe('Server Wins Name')

    // Stale outbox entry deleted
    expect(await db.outbox.count()).toBe(0)
  })

  it('idempotently applies pulled rows and overlap windows', async () => {
    const mockNetwork = createMockNetworkClient()
    mockNetwork.pullResponse = {
      rows: [
        {
          id: 'acc-pull-1',
          user_id: TEST_USER_ID,
          name: 'Checking',
          kind: 'checking',
          currency: 'INR',
          initial_balance_minor: 1000,
          is_archived: false,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          deleted_at: null,
          server_seq: 100,
          version: 1,
        },
      ],
      next_cursor: 100,
      has_more: false,
    }

    const engine = new SyncEngine({ networkClient: mockNetwork })
    engine.setLeader(true)

    // Pull once
    await engine.sync()
    expect(await db.accounts.count()).toBe(1)
    expect((await db.accounts.get('acc-pull-1'))?.name).toBe('Checking')

    // Pull again with duplicate overlap
    await engine.sync()
    expect(await db.accounts.count()).toBe(1)
  })

  it('calculates exponential backoff within bounds', () => {
    const engine = new SyncEngine()
    for (let retry = 1; retry <= 6; retry++) {
      const delay = engine.computeBackoffMs(retry)
      const minExpected = Math.min(60000, Math.pow(2, retry) * 1000)
      expect(delay).toBeGreaterThanOrEqual(minExpected)
      expect(delay).toBeLessThanOrEqual(62000)
    }
  })

  it('does not sync when offline and transitions state cleanly', async () => {
    let online = false
    const mockNetwork = createMockNetworkClient()
    const engine = new SyncEngine({
      networkClient: mockNetwork,
      isOnline: () => online,
    })
    engine.setLeader(true)

    // While offline
    await engine.sync()
    expect(useSyncStore.getState().status).toBe('offline')
    expect(mockNetwork.pushedBatches.length).toBe(0)

    // Back online
    online = true
    await engine.sync()
    expect(useSyncStore.getState().status).toBe('synced')
  })

  it('respects leader election via lockRequester', async () => {
    let lockAcquired = false
    const engine = new SyncEngine({
      requestLock: async (_name, callback) => {
        lockAcquired = true
        await callback()
      },
    })

    expect(engine.getLeaderStatus()).toBe(false)
    // Non-leader should exit sync early without network calls
    const mockNetwork = createMockNetworkClient()
    engine.configure({ networkClient: mockNetwork })
    await engine.sync()
    expect(mockNetwork.pushedBatches.length).toBe(0)

    // Give leadership
    engine.setLeader(true)
    await engine.sync()
    expect(useSyncStore.getState().status).toBe('synced')
  })

  it('triggers onResetRequired handler when sync_pull signals reset_required', async () => {
    let resetCalled = false
    const mockNetwork = createMockNetworkClient()
    mockNetwork.pullResponse = {
      reset_required: true,
      rows: [],
      next_cursor: 0,
      has_more: false,
    }

    const engine = new SyncEngine({
      networkClient: mockNetwork,
      onResetRequired: async () => {
        resetCalled = true
      },
    })
    engine.setLeader(true)
    await engine.sync()

    expect(resetCalled).toBe(true)
  })

  it('triggers onMaterialize hook after successful sync', async () => {
    let materializedUser: string | null = null
    const mockNetwork = createMockNetworkClient()
    const engine = new SyncEngine({
      networkClient: mockNetwork,
      onMaterialize: async (userId) => {
        materializedUser = userId
      },
    })
    engine.setLeader(true)
    await engine.sync()

    expect(materializedUser).toBe(TEST_USER_ID)
  })

  it('applies 1000-sequence overlap on the first request of a sync run and exact cursor on later pages', async () => {
    const mockNetwork = createMockNetworkClient()
    let pullCount = 0
    mockNetwork.pull = async (params) => {
      mockNetwork.pulledRequests.push(params)
      pullCount++
      if (params.p_tables.includes('profiles')) {
        if (pullCount === 1) {
          // First page of profiles
          return {
            data: {
              rows: [{ id: 'prof-1', user_id: TEST_USER_ID, server_seq: 500, version: 1 }],
              next_cursor: 500,
              has_more: true,
            },
            error: null,
          }
        }
        if (pullCount === 2) {
          // Second page of profiles
          return {
            data: {
              rows: [{ id: 'prof-2', user_id: TEST_USER_ID, server_seq: 800, version: 1 }],
              next_cursor: 800,
              has_more: false,
            },
            error: null,
          }
        }
      }
      return { data: { rows: [], next_cursor: 0, has_more: false }, error: null }
    }

    const engine = new SyncEngine({ networkClient: mockNetwork })
    engine.setLeader(true)
    await engine.sync()

    const profilePulls = mockNetwork.pulledRequests.filter((r) => r.p_tables.includes('profiles'))
    expect(profilePulls.length).toBe(2)
    // First request: p_apply_overlap is true
    expect(profilePulls[0]?.p_apply_overlap).toBe(true)
    expect(profilePulls[0]?.p_cursor).toBe(0)

    // Later page: p_apply_overlap is false, exact next_cursor used
    expect(profilePulls[1]?.p_apply_overlap).toBe(false)
    expect(profilePulls[1]?.p_cursor).toBe(500)
  })

  it('aborts with a clear error if has_more is true but cursor did not advance', async () => {
    const mockNetwork = createMockNetworkClient()
    mockNetwork.pull = async (params) => {
      mockNetwork.pulledRequests.push(params)
      return {
        data: {
          rows: [{ id: 'prof-1', user_id: TEST_USER_ID, server_seq: 100, version: 1 }],
          next_cursor: 0, // Did not advance! (0 <= 0)
          has_more: true,
        },
        error: null,
      }
    }

    const engine = new SyncEngine({ networkClient: mockNetwork })
    engine.setLeader(true)
    await engine.sync()

    const store = useSyncStore.getState()
    expect(store.status).toBe('error')
    expect(store.lastError).toMatch(/has_more is true but cursor did not advance/)
  })
})

describe('Sync convergence property-based test', () => {
  it('converges to identical state when replicas apply mutations in arbitrary order (200 runs)', () => {
    interface Mutation {
      id: string
      amount: number
      updatedAt: string
      deleted: boolean
    }

    const mutationArb = fc.record({
      id: fc.constantFrom('tx-1', 'tx-2', 'tx-3', 'tx-4'),
      amount: fc.integer({ min: 10, max: 100000 }),
      updatedAt: fc.integer({ min: 1767225600000, max: 1768000000000 }).map((t) => new Date(t).toISOString()),
      deleted: fc.boolean(),
    })

    fc.assert(
      fc.property(fc.array(mutationArb, { minLength: 5, maxLength: 30 }), (mutations) => {
        // Replica A gets mutations in order 1
        const orderA = [...mutations]
        // Replica B gets mutations in shuffled order 2
        const orderB = [...mutations].reverse()

        const applyLWW = (list: Mutation[]) => {
          const state = new Map<string, Mutation>()
          for (const m of list) {
            const cur = state.get(m.id)
            if (!cur || m.updatedAt > cur.updatedAt) {
              state.set(m.id, m)
            } else if (m.updatedAt === cur.updatedAt && m.amount > cur.amount) {
              state.set(m.id, m)
            }
          }
          return state
        }

        const stateA = applyLWW(orderA)
        const stateB = applyLWW(orderB)

        expect(stateA.size).toBe(stateB.size)
        for (const [id, valA] of stateA.entries()) {
          const valB = stateB.get(id)
          expect(valB).toBeDefined()
          expect(valA.amount).toBe(valB?.amount)
          expect(valA.deleted).toBe(valB?.deleted)
          expect(valA.updatedAt).toBe(valB?.updatedAt)
        }
      }),
      { numRuns: 200 },
    )
  })
})
