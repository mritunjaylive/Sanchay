/**
 * db/outboxHelper.ts — Atomic write helper for Dexie and outbox.
 *
 * Rule: Every write goes through a repository that updates the table
 * and the outbox in ONE Dexie transaction.
 * Multiple writes to the same (table, rowId) coalesce into the latest snapshot.
 *
 * @see Sanchay_spec.md section 9.2
 */

import { db } from './db'
import { toServer } from './mapper'
import type { TableName } from '@sanchay/shared'
import type { Table } from 'dexie'

export interface SyncableEntity {
  id: string
  userId: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  serverSeq: number | null
  version: number
}

/**
 * Atomically writes (upserts) a record into a Dexie table and records/coalesces
 * an outbox entry in the same transaction.
 */
export async function upsertWithOutbox<T extends SyncableEntity>(
  table: Table<T>,
  serverTableName: TableName,
  item: T,
): Promise<void> {
  const snapshot = toServer(item as unknown as Record<string, unknown>)
  const updatedAt = item.updatedAt || new Date().toISOString()

  await db.transaction('rw', [table, db.outbox], async () => {
    await table.put(item)

    // Coalesce: find existing outbox entry for this table + rowId
    const existing = await db.outbox
      .where('table')
      .equals(serverTableName)
      .and((entry) => entry.rowId === item.id)
      .first()

    if (existing?.id) {
      await db.outbox.update(existing.id, {
        op: item.deletedAt ? 'delete' : 'upsert',
        snapshot,
        updatedAt,
        attempt: 0,
        attempts: 0,
        lastError: null,
        status: 'pending',
      })
    } else {
      await db.outbox.add({
        table: serverTableName,
        rowId: item.id,
        op: item.deletedAt ? 'delete' : 'upsert',
        snapshot,
        updatedAt,
        attempt: 0,
        attempts: 0,
        lastError: null,
        lastAttemptAt: null,
        status: 'pending',
      })
    }
  })
}

/**
 * Atomically soft-deletes a record: sets deletedAt = now(), increments version,
 * updates updatedAt, and records an outbox entry.
 */
export async function softDeleteWithOutbox<T extends SyncableEntity>(
  table: Table<T>,
  serverTableName: TableName,
  id: string,
): Promise<void> {
  const existing = await table.get(id as unknown as string)
  if (!existing) return

  const now = new Date().toISOString()
  const updated: T = {
    ...existing,
    deletedAt: now,
    updatedAt: now,
    version: (existing.version ?? 1) + 1,
  }

  await upsertWithOutbox(table, serverTableName, updated)
}
