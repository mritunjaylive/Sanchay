import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { Dexie } from 'dexie'
export interface TransactionServerRow {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  kind: string
  amount: number
  occurred_on: string
  note: string | null
  transfer_peer_id: string | null
  loan_charge_type: string | null
  credit_card_charge_type: string | null
  source: string
  import_batch_id: string | null
  currency: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  server_seq: number
  version: number
}

// Simulates client database and local sync state
interface SimulatedClientDb {
  name: string
  transactions: Map<string, TransactionServerRow>
  outbox: Array<{ table: string; id: string; row: Record<string, unknown> }>
  cursor: number
}

function createSimulatedClient(name: string): SimulatedClientDb {
  return {
    name,
    transactions: new Map(),
    outbox: [],
    cursor: 0,
  }
}

// Simulates the server-side state and RPCs (matching migration 20260101000003_fix_sync_push.sql)
class SimulatedServer {
  private rows: Map<string, TransactionServerRow> = new Map()
  private serverSeq = 0

  syncPush(
    userId: string,
    changes: Array<{ table: string; row: Partial<TransactionServerRow> & { id: string } }>,
  ) {
    const accepted: Array<{ table: string; id: string; version: number; server_seq: number }> = []
    const rejected: Array<{ table: string; row?: TransactionServerRow; error?: string }> = []

    for (const change of changes) {
      if (change.table !== 'transactions') {
        rejected.push({ table: change.table, error: 'Table not allowed for sync' })
        continue
      }

      const incoming = change.row
      const existing = this.rows.get(incoming.id)
      const now = new Date().toISOString()

      if (!existing) {
        // Insert
        this.serverSeq++
        const newRow: TransactionServerRow = {
          id: incoming.id,
          user_id: userId,
          account_id: incoming.account_id || 'acc-1',
          category_id: incoming.category_id || null,
          kind: incoming.kind || 'expense',
          amount: incoming.amount ?? 1000,
          occurred_on: incoming.occurred_on || '2026-10-04',
          note: incoming.note || null,
          transfer_peer_id: incoming.transfer_peer_id || null,
          loan_charge_type: incoming.loan_charge_type || null,
          credit_card_charge_type: incoming.credit_card_charge_type || null,
          source: incoming.source || 'manual',
          import_batch_id: incoming.import_batch_id || null,
          currency: incoming.currency || 'INR',
          created_at: incoming.created_at || now,
          updated_at: incoming.updated_at || now,
          deleted_at: incoming.deleted_at || null,
          server_seq: this.serverSeq,
          version: 1,
        }
        this.rows.set(incoming.id, newRow)
        accepted.push({
          table: 'transactions',
          id: incoming.id,
          version: 1,
          server_seq: this.serverSeq,
        })
      } else {
        // LWW check
        const incomingTime = new Date(incoming.updated_at || now).getTime()
        const existingTime = new Date(existing.updated_at).getTime()
        const incomingVersion = incoming.version ?? existing.version + 1

        if (
          incomingTime > existingTime ||
          (incomingTime === existingTime && incomingVersion > existing.version)
        ) {
          this.serverSeq++
          const updatedRow: TransactionServerRow = {
            ...existing,
            ...incoming,
            id: existing.id,
            user_id: existing.user_id,
            created_at: existing.created_at,
            deleted_at: incoming.deleted_at !== undefined ? incoming.deleted_at : existing.deleted_at,
            server_seq: this.serverSeq,
            version: existing.version + 1,
          }
          this.rows.set(incoming.id, updatedRow)
          accepted.push({
            table: 'transactions',
            id: incoming.id,
            version: updatedRow.version,
            server_seq: this.serverSeq,
          })
        } else {
          // Stale write rejected
          rejected.push({
            table: 'transactions',
            row: existing,
          })
        }
      }
    }

    return { accepted, rejected }
  }

  syncPull(cursor: number) {
    const pulledRows: TransactionServerRow[] = []
    let maxSeq = cursor

    for (const row of this.rows.values()) {
      if (row.server_seq > cursor) {
        pulledRows.push({ ...row })
        if (row.server_seq > maxSeq) {
          maxSeq = row.server_seq
        }
      }
    }

    return {
      changes: {
        transactions: pulledRows,
      },
      next_cursor: maxSeq,
      has_more: false,
    }
  }
}

describe('Sync Push & Pull Multi-Client Convergence', () => {
  let server: SimulatedServer
  let clientA: SimulatedClientDb
  let clientB: SimulatedClientDb
  const testUserId = 'user-uuid-1'
  const txId = 'tx-test-convergence-1'

  beforeEach(() => {
    server = new SimulatedServer()
    clientA = createSimulatedClient('Client-A')
    clientB = createSimulatedClient('Client-B')
  })

  it('proves insert, edit, and soft-delete converge across two clients', () => {
    // 1. Client A creates a transaction locally and pushes to server
    const initialTx: TransactionServerRow = {
      id: txId,
      user_id: testUserId,
      account_id: 'acc-1',
      category_id: 'cat-groceries',
      kind: 'expense',
      amount: 15000,
      occurred_on: '2026-10-04',
      note: 'Fresh apples & milk',
      transfer_peer_id: null,
      loan_charge_type: null,
      credit_card_charge_type: null,
      source: 'manual',
      import_batch_id: null,
      currency: 'INR',
      created_at: '2026-10-04T10:00:00.000Z',
      updated_at: '2026-10-04T10:00:00.000Z',
      deleted_at: null,
      server_seq: 0,
      version: 1,
    }
    clientA.transactions.set(txId, initialTx)

    // Push from Client A
    const push1 = server.syncPush(testUserId, [{ table: 'transactions', row: initialTx }])
    expect(push1.accepted).toHaveLength(1)
    expect(push1.accepted[0]?.server_seq).toBe(1)
    expect(push1.accepted[0]?.version).toBe(1)

    // 2. Client B pulls from server
    const pull1 = server.syncPull(clientB.cursor)
    expect(pull1.changes.transactions).toHaveLength(1)
    for (const row of pull1.changes.transactions) {
      clientB.transactions.set(row.id, row)
    }
    clientB.cursor = pull1.next_cursor
    expect(clientB.transactions.get(txId)?.amount).toBe(15000)
    expect(clientB.transactions.get(txId)?.note).toBe('Fresh apples & milk')

    // 3. Client A edits the transaction (amount, category, note)
    const editedTx: TransactionServerRow = {
      ...initialTx,
      amount: 22000,
      category_id: 'cat-supermarket',
      note: 'Weekly family groceries',
      updated_at: '2026-10-04T10:05:00.000Z',
      version: 2,
    }
    clientA.transactions.set(txId, editedTx)

    const push2 = server.syncPush(testUserId, [{ table: 'transactions', row: editedTx }])
    expect(push2.accepted).toHaveLength(1)
    expect(push2.accepted[0]?.server_seq).toBe(2)
    expect(push2.accepted[0]?.version).toBe(2)

    // 4. Client B pulls and converges to the edited state
    const pull2 = server.syncPull(clientB.cursor)
    expect(pull2.changes.transactions).toHaveLength(1)
    for (const row of pull2.changes.transactions) {
      clientB.transactions.set(row.id, row)
    }
    clientB.cursor = pull2.next_cursor

    expect(clientB.transactions.get(txId)?.amount).toBe(22000)
    expect(clientB.transactions.get(txId)?.category_id).toBe('cat-supermarket')
    expect(clientB.transactions.get(txId)?.note).toBe('Weekly family groceries')
    expect(clientB.transactions.get(txId)?.version).toBe(2)

    // 5. Client B soft-deletes the transaction (deleted_at)
    const deletedTx: TransactionServerRow = {
      ...clientB.transactions.get(txId)!,
      deleted_at: '2026-10-04T10:10:00.000Z',
      updated_at: '2026-10-04T10:10:00.000Z',
      version: 3,
    }
    clientB.transactions.set(txId, deletedTx)

    const push3 = server.syncPush(testUserId, [{ table: 'transactions', row: deletedTx }])
    expect(push3.accepted).toHaveLength(1)
    expect(push3.accepted[0]?.server_seq).toBe(3)

    // 6. Client A pulls and converges to the soft-deleted state
    const pull3 = server.syncPull(clientA.cursor)
    expect(pull3.changes.transactions).toHaveLength(1)
    for (const row of pull3.changes.transactions) {
      clientA.transactions.set(row.id, row)
    }
    clientA.cursor = pull3.next_cursor

    // Verification: both clients have identical converged state
    const finalA = clientA.transactions.get(txId)
    const finalB = clientB.transactions.get(txId)
    expect(finalA).toBeDefined()
    expect(finalB).toBeDefined()
    expect(finalA?.deleted_at).toBe('2026-10-04T10:10:00.000Z')
    expect(finalB?.deleted_at).toBe('2026-10-04T10:10:00.000Z')
    expect(finalA?.amount).toBe(finalB?.amount)
    expect(finalA?.note).toBe(finalB?.note)
    expect(finalA?.version).toBe(finalB?.version)
  })

  it('rejects stale writes from a lagged client and preserves newer server state', () => {
    // Insert initial state
    const initialTx: TransactionServerRow = {
      id: txId,
      user_id: testUserId,
      account_id: 'acc-1',
      category_id: null,
      kind: 'expense',
      amount: 10000,
      occurred_on: '2026-10-04',
      note: 'Original note',
      transfer_peer_id: null,
      loan_charge_type: null,
      credit_card_charge_type: null,
      source: 'manual',
      import_batch_id: null,
      currency: 'INR',
      created_at: '2026-10-04T08:00:00.000Z',
      updated_at: '2026-10-04T09:00:00.000Z',
      deleted_at: null,
      server_seq: 1,
      version: 1,
    }
    server.syncPush(testUserId, [{ table: 'transactions', row: initialTx }])

    // Client A updates to 15000 at 09:30
    const modernTx: TransactionServerRow = {
      ...initialTx,
      amount: 15000,
      updated_at: '2026-10-04T09:30:00.000Z',
      version: 2,
    }
    server.syncPush(testUserId, [{ table: 'transactions', row: modernTx }])

    // Client B attempts to push a stale edit with updated_at from 09:15
    const staleTx: TransactionServerRow = {
      ...initialTx,
      amount: 8000,
      updated_at: '2026-10-04T09:15:00.000Z',
      version: 1,
    }
    const result = server.syncPush(testUserId, [{ table: 'transactions', row: staleTx }])

    expect(result.accepted).toHaveLength(0)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0]?.row?.amount).toBe(15000) // Returns current server row
  })
})
