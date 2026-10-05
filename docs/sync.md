# Client Sync Engine & Outbox Quarantine

This document details the client-side synchronization engine, outbox quarantine system, error classification, and diagnostic tooling in Sanchay.

---

## 1. Sync Architecture Overview

Sanchay is an **offline-first** application. All user interface operations read and write exclusively to local IndexedDB via **Dexie**. Network operations are fully decoupled and handled by `syncEngine` (`features/sync/services/syncEngine.ts`).

Every mutation atomically writes both the data record and an entry into the local `outbox` table in the same Dexie transaction:

```
[UI Action] ──> [Repository] ──> (Atomic Dexie Tx) ──> [Data Table]
                                                   ──> [Outbox Table]
                                                            │
                                                     [syncEngine.push]
                                                            │
                                                            ▼
                                                   [Supabase sync_push RPC]
```

---

## 2. Outbox Entry Lifecycle & Quarantine States

To prevent poison pill rows from permanently blocking the sync queue, each outbox entry maintains status and retry tracking:

```ts
export interface OutboxEntry {
  id: string
  table: string
  rowId: string
  op: 'upsert' | 'delete'
  snapshot: Record<string, unknown>
  createdAt: string
  attempts: number
  lastError: string | null
  lastAttemptAt: string | null
  status: 'pending' | 'failed' | 'blocked'
}
```

### Outbox States

| State | Description | Push Behavior |
| :--- | :--- | :--- |
| `pending` | Newly created or retried mutation. | Sent in upcoming push batches. |
| `failed` | Quarantined item after permanent rejection (FK failure, check constraint, duplicate key, or 3 attempts). | **Excluded** from normal push batches. Does not block other changes. |
| `blocked` | Child record dependent on a `failed` parent (e.g., transaction for a failed account). | Held in outbox without sending until the parent is fixed, retried, or discarded. |

### Quarantine & Recovery Workflow
1. When the server's `sync_push` rejects a row with an error (e.g. FK constraint violation), the engine increments `attempts` and records `lastError`.
2. If classified as a permanent data error (or after 3 unsuccessful attempts), the entry is marked `status = 'failed'`.
3. Outbox rows of child tables referencing that row ID are marked `status = 'blocked'`.
4. In the UI, the user is notified via the sync badge that an item needs attention.
5. If the user chooses **Discard**, the item is deleted from the outbox and the local DB rolls back or deletes the invalid record. Its children are unblocked.
6. If the user chooses **Retry**, `attempts` is reset to 0, `status` returns to `pending`, and the engine re-attempts upload.

---

## 3. Push and Pull Execution

### Multi-Batch Push Loop
- The push phase processes outbox rows in strict dependency order (`TABLE_DEPENDENCIES`).
- Pushes up to 10 batches of 500 rows sequentially in a single cycle so large backlogs drain rapidly without waiting for the 60-second periodic timer.

### Isolated Table Pull Failures
- The pull phase pulls each table independently.
- Each table pull is wrapped in its own `try/catch`. If an individual table encounters a network or schema error, other tables continue pulling successfully.
- Overall sync status reports `status = 'error'` only if one or more tables failed, preserving detailed table-by-table failure summaries in `syncStore.lastErrorDetail`.

### `reset_required` Auto-Recovery
- If the server has purged tombstones beyond the client's cursor, it flags `reset_required: true`.
- The client automatically recovers by resetting that table's cursor to 0 and performing a full pull with Last-Write-Wins (LWW) conflict resolution, while strictly preserving any local unpushed outbox rows.

---

## 4. Error Classification & Network Handling

Errors encountered during sync are classified before deciding next actions:

| Error Category | Indicators | Engine Action |
| :--- | :--- | :--- |
| `offline` | `!navigator.onLine` or fetch `TypeError` | Sets status `offline`. No alert toast. Resumes on `window.online`. |
| `auth` | 401 Unauthorized, expired JWT | Calls `supabase.auth.refreshSession()`. If refresh fails, sets status `auth_required`. Never wipes local data. |
| `server` | 5xx HTTP codes, 429 Too Many Requests | Backoff with jitter; clears any pending timer before rescheduling. |
| `data` | SQL constraint violations, invalid types | Quarantines failing row into `failed` state; continues sync. |

---

## 5. User-Facing Diagnostics (`SyncDiagnosticsModal`)

Tapping `SyncStatusBadge` opens the diagnostics modal:
- **Status Overview:** Displays connection state (`idle`, `syncing`, `offline`, `auth_required`, `error`), last successful sync time, and pending change count.
- **Problem Items List:** Detailed list of any quarantined (`failed`) rows with human-readable error reasons and action buttons:
  - **Retry:** Re-queues the row for upload.
  - **Discard:** Discards the local change after confirmation.
- **Technical Details Toggle:** Shows raw error code, HTTP status, and affected table names.
- **Copy Diagnostics:** Generates a sanitized JSON export of engine states, table cursors, pending counts, and error codes. **Contains zero personal information, financial amounts, or tokens.**
