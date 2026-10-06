/**
 * Regression tests for the sync bug-fix patch:
 *  - rejected rows are attributed via `row.id` when the server sends no `id`
 *  - edits made while a push is in flight are not discarded on acknowledgement
 *  - reset_required re-pulls from 0 and removes rows the server purged
 *  - follower tabs forward writes to the leader
 *  - timestamp comparison is numeric, not lexical
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../../../db/db'
import { SyncEngine, isLater, rejectedRowId, type SyncNetworkClient } from '../services/syncEngine'
import { upsertWithOutbox } from '../../../db/outboxHelper'
import type { Account } from '@sanchay/shared'

const USER = '11111111-1111-1111-1111-111111111111'

const account = (p: Partial<Account> & { id: string; name: string }): Account => ({
  userId: USER,
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
  ...p,
})

function client(overrides: Partial<SyncNetworkClient> = {}): SyncNetworkClient {
  return {
    getSession: async () => ({ data: { session: { user: { id: USER } } } }),
    push: async () => ({ data: { accepted: [], rejected: [] }, error: null }),
    pull: async () => ({ data: { rows: [], next_cursor: 0, has_more: false }, error: null }),
    ...overrides,
  }
}

describe('sync bug fixes', () => {
  beforeEach(async () => {
    await db.outbox.clear()
    await db.accounts.clear()
    await db.syncState.clear()
  })

  it('timestamp helpers compare instants, not strings', () => {
    // Same instant with different formats is not "later"
    expect(isLater('2026-01-01T00:00:00.000+00:00', '2026-01-01T00:00:00.000Z')).toBe(false)
    // 5:30 offset is earlier than the Z timestamp it is lexically greater than
    expect(isLater('2026-01-01T10:00:00+05:30', '2026-01-01T06:00:00Z')).toBe(false)
    expect(isLater('2026-01-01T00:00:00.001Z', '2026-01-01T00:00:00.000Z')).toBe(true)
  })

  it('rejectedRowId falls back to row.id', () => {
    expect(rejectedRowId({ table: 'accounts', row: { id: 'x' }, error: 'e' })).toBe('x')
    expect(rejectedRowId({ table: 'accounts', id: 'y' })).toBe('y')
  })

  it('quarantines a permanently failing row reported only via row.id', async () => {
    await upsertWithOutbox(db.accounts, 'accounts', account({ id: 'bad', name: 'Bad' }))
    const engine = new SyncEngine({
      networkClient: client({
        push: async () => ({
          data: {
            accepted: [],
            rejected: [{ table: 'accounts', row: { id: 'bad' }, error: 'violates check constraint "x"' }],
          },
          error: null,
        }),
      }),
    })
    engine.setLeader(true)
    await engine.sync()

    const entry = await db.outbox.where('rowId').equals('bad').first()
    expect(entry?.status).toBe('failed')
    expect(entry?.attempts).toBe(1)
  })

  it('keeps an edit made while the push was in flight', async () => {
    await upsertWithOutbox(db.accounts, 'accounts', account({ id: 'acc', name: 'v1' }))
    const engine = new SyncEngine({
      networkClient: client({
        push: async () => {
          // user edits the row while the request is "on the wire"
          await upsertWithOutbox(
            db.accounts,
            'accounts',
            account({ id: 'acc', name: 'v2', updatedAt: '2026-01-01T00:00:05.000Z', version: 2 }),
          )
          return { data: { accepted: [{ table: 'accounts', id: 'acc', version: 1, server_seq: 1 }] }, error: null }
        },
      }),
    })
    engine.setLeader(true)
    await engine.sync()

    const entry = await db.outbox.where('rowId').equals('acc').first()
    expect(entry).toBeDefined()
    expect((entry!.snapshot as Record<string, unknown>).name).toBe('v2')
  })

  it('removes the outbox entry when the pushed snapshot was accepted unchanged', async () => {
    await upsertWithOutbox(db.accounts, 'accounts', account({ id: 'acc', name: 'v1' }))
    const engine = new SyncEngine({
      networkClient: client({
        push: async () => ({
          data: { accepted: [{ table: 'accounts', id: 'acc', version: 1, server_seq: 1 }] },
          error: null,
        }),
      }),
    })
    engine.setLeader(true)
    await engine.sync()
    expect(await db.outbox.count()).toBe(0)
  })

  it('adopts the server row after an LWW rejection and clears the outbox entry', async () => {
    await upsertWithOutbox(db.accounts, 'accounts', account({ id: 'acc', name: 'local' }))
    const engine = new SyncEngine({
      networkClient: client({
        push: async () => ({
          data: {
            accepted: [],
            rejected: [
              {
                table: 'accounts',
                id: 'acc',
                server_row: {
                  id: 'acc',
                  user_id: USER,
                  name: 'server',
                  kind: 'cash',
                  currency: 'INR',
                  opening_balance_minor: 0,
                  opening_date: '2026-01-01',
                  sort_order: 0,
                  exclude_from_net_worth: false,
                  created_at: '2026-01-01T00:00:00.000Z',
                  updated_at: '2026-01-02T00:00:00.000Z',
                  deleted_at: null,
                  server_seq: 5,
                  version: 3,
                },
              },
            ],
          },
          error: null,
        }),
      }),
    })
    engine.setLeader(true)
    await engine.sync()

    expect((await db.accounts.get('acc'))?.name).toBe('server')
    expect(await db.outbox.count()).toBe(0)
  })

  it('reset_required re-pulls from 0 and deletes local rows the server no longer has', async () => {
    await db.accounts.bulkPut([account({ id: 'stale', name: 'Stale' }), account({ id: 'kept', name: 'Kept' })])
    await db.syncState.put({ table: 'accounts', cursor: 3, lastSyncAt: null })

    const cursors: number[] = []
    const engine = new SyncEngine({
      networkClient: client({
        pull: async (params) => {
          if (params.p_tables[0] !== 'accounts') return { data: { rows: [], next_cursor: 0, has_more: false }, error: null }
          cursors.push(params.p_cursor)
          if (params.p_cursor > 0) return { data: { reset_required: true, rows: [], next_cursor: params.p_cursor, has_more: false }, error: null }
          return {
            data: {
              rows: [
                {
                  id: 'kept',
                  user_id: USER,
                  name: 'Kept',
                  kind: 'cash',
                  currency: 'INR',
                  opening_balance_minor: 0,
                  opening_date: '2026-01-01',
                  sort_order: 0,
                  exclude_from_net_worth: false,
                  created_at: '2026-01-01T00:00:00.000Z',
                  updated_at: '2026-01-01T00:00:00.000Z',
                  deleted_at: null,
                  server_seq: 7,
                  version: 1,
                },
              ],
              next_cursor: 7,
              has_more: false,
            },
            error: null,
          }
        },
      }),
    })
    engine.setLeader(true)
    await engine.sync()

    expect(cursors).toEqual([3, 0])
    expect(await db.accounts.get('stale')).toBeUndefined()
    expect(await db.accounts.get('kept')).toBeDefined()
    expect((await db.syncState.get('accounts'))?.cursor).toBe(7)
  })

  it('does not drop an unsynced local row during reset reconciliation', async () => {
    await upsertWithOutbox(db.accounts, 'accounts', account({ id: 'unsynced', name: 'Unsynced' }))
    await db.syncState.put({ table: 'accounts', cursor: 3, lastSyncAt: null })
    const engine = new SyncEngine({
      networkClient: client({
        pull: async (params) =>
          params.p_tables[0] === 'accounts' && params.p_cursor > 0
            ? { data: { reset_required: true }, error: null }
            : { data: { rows: [], next_cursor: 0, has_more: false }, error: null },
      }),
    })
    engine.setLeader(true)
    await engine.sync()
    expect(await db.accounts.get('unsynced')).toBeDefined()
  })

  it('pushes tables in dependency order across batches (parents before children)', async () => {
    // 600 transactions queued BEFORE their account: the account must still go first.
    const rows = Array.from({ length: 600 }, (_, i) => ({
      table: 'transactions',
      rowId: `tx-${i}`,
      op: 'upsert' as const,
      snapshot: { id: `tx-${i}` },
      updatedAt: '2026-01-01T00:00:00.000Z',
      attempt: 0,
      attempts: 0,
      status: 'pending' as const,
    }))
    await db.outbox.bulkAdd(rows)
    await db.outbox.add({
      table: 'accounts',
      rowId: 'acc',
      op: 'upsert',
      snapshot: { id: 'acc' },
      updatedAt: '2026-01-01T00:00:00.000Z',
      attempt: 0,
      attempts: 0,
      status: 'pending',
    })

    const firstBatchTables: string[] = []
    let first = true
    const engine = new SyncEngine({
      networkClient: client({
        push: async (changes) => {
          if (first) {
            first = false
            changes.forEach((c) => firstBatchTables.push(c.table))
          }
          return { data: { accepted: changes.map((c) => ({ table: c.table, id: (c.row as { id: string }).id, version: 1, server_seq: 1 })) }, error: null }
        },
      }),
    })
    engine.setLeader(true)
    await engine.sync()
    expect(firstBatchTables[0]).toBe('accounts')
  })

  it('a follower tab asks the leader to sync instead of silently doing nothing', async () => {
    const engine = new SyncEngine({ networkClient: client() })
    const sent: unknown[] = []
    ;(engine as unknown as { channel: { postMessage: (m: unknown) => void } }).channel = {
      postMessage: (m) => sent.push(m),
    }
    engine.setLeader(false)
    engine.triggerSync(true)
    expect(sent).toContainEqual({ type: 'SYNC_REQUEST' })
  })
})
