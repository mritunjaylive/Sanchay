import { z } from 'zod'

/**
 * Common sync columns present on every synced table row.
 * @see Sanchay_spec.md section 7.1
 */
export const syncRowSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
  serverSeq: z.number().int().nullable(),
  version: z.number().int().min(1),
})

export type SyncRow = z.infer<typeof syncRowSchema>

/** Outbox entry written atomically alongside every local DB write. */
export const outboxEntrySchema = z.object({
  id: z.number().int().optional(), // auto-increment local key
  table: z.string(),
  rowId: z.string().uuid(),
  op: z.enum(['upsert', 'delete']),
  snapshot: z.record(z.unknown()), // the full row at time of write
  updatedAt: z.string().datetime(),
  attempt: z.number().int().default(0),
})
export type OutboxEntry = z.infer<typeof outboxEntrySchema>

/** Sync state cursor stored locally. */
export const syncStateSchema = z.object({
  table: z.string(),
  cursor: z.number().int().default(0), // last applied server_seq
  lastSyncAt: z.string().datetime().nullable(),
})
export type SyncState = z.infer<typeof syncStateSchema>

/** Result from sync_push RPC. */
export const syncPushResultSchema = z.object({
  accepted: z.array(
    z.object({
      table: z.string(),
      id: z.string().uuid(),
      version: z.number().int(),
      serverSeq: z.number().int(),
    }),
  ),
  rejected: z.array(
    z.object({
      table: z.string(),
      row: z.record(z.unknown()),
    }),
  ),
})
export type SyncPushResult = z.infer<typeof syncPushResultSchema>

/** Result from sync_pull RPC. */
export const syncPullResultSchema = z.union([
  z.object({
    resetRequired: z.literal(true),
  }),
  z.object({
    rows: z.array(z.record(z.unknown())),
    nextCursor: z.number().int(),
    hasMore: z.boolean(),
  }),
])
export type SyncPullResult = z.infer<typeof syncPullResultSchema>
