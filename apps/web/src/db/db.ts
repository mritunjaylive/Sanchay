import Dexie, { type Table } from 'dexie'
import type {
  Profile, Account, LoanTerms, Category, Tag, Transaction,
  TransactionTag, Attachment, Budget, RecurringRule, RecurringOverride,
  Goal, GoalContribution, SavedFilter, Notification,
} from '@sanchay/shared'
import type { OutboxEntry, SyncState } from '@sanchay/shared'

/**
 * Local-only types (not in shared package)
 */
export interface PendingUpload {
  id?: number
  attachmentId: string
  blob: Blob
  storagePath: string
  mimeType: string
  attempt: number
  createdAt: string
}

export interface KVEntry {
  key: string
  value: unknown
}

/**
 * Sanchay local database.
 * All synced tables mirror the server schema in camelCase.
 * Sync-specific tables (outbox, syncState, pendingUploads, kv) are local-only.
 *
 * @see Sanchay_spec.md section 7.5
 */
class SanchayDB extends Dexie {
  profiles!: Table<Profile>
  accounts!: Table<Account>
  loanTerms!: Table<LoanTerms>
  categories!: Table<Category>
  tags!: Table<Tag>
  transactions!: Table<Transaction>
  transactionTags!: Table<TransactionTag>
  attachments!: Table<Attachment>
  budgets!: Table<Budget>
  recurringRules!: Table<RecurringRule>
  recurringOverrides!: Table<RecurringOverride>
  goals!: Table<Goal>
  goalContributions!: Table<GoalContribution>
  savedFilters!: Table<SavedFilter>
  notifications!: Table<Notification>
  fxRates!: Table<{ date: string; quote: string; ratePerUsd: number }>

  // Local-only tables
  outbox!: Table<OutboxEntry>
  syncState!: Table<SyncState>
  pendingUploads!: Table<PendingUpload>
  kv!: Table<KVEntry>

  constructor() {
    super('sanchay')

    /**
     * Version 1: initial schema
     * Format: "primaryKey, [compound], *multiEntry"
     * @see Sanchay_spec.md section 7.5
     */
    this.version(1).stores({
      // Synced tables
      profiles: 'id, userId, updatedAt',
      accounts: 'id, userId, kind, updatedAt, archivedAt, sortOrder',
      loanTerms: 'id, accountId, userId, updatedAt',
      categories: 'id, userId, kind, parentId, updatedAt, archivedAt, sortOrder',
      tags: 'id, userId, updatedAt',
      transactions: [
        'id',
        'userId',
        'occurredOn',
        'updatedAt',
        '[accountId+occurredOn]',
        '[categoryId+occurredOn]',
        '[type+occurredOn]',
        'payee',
        'recurringRuleId',
        'deletedAt',
      ].join(', '),
      transactionTags: 'id, transactionId, tagId, updatedAt',
      attachments: 'id, transactionId, uploadState, updatedAt',
      budgets: 'id, categoryId, effectiveFrom, userId, updatedAt',
      recurringRules: 'id, userId, mode, updatedAt',
      recurringOverrides: 'id, ruleId, occurrenceDate, updatedAt',
      goals: 'id, userId, updatedAt, completedAt',
      goalContributions: 'id, goalId, occurredOn, updatedAt',
      savedFilters: 'id, userId, updatedAt',
      notifications: 'id, userId, readAt, dedupeKey, updatedAt',
      fxRates: '[date+quote], date, quote',

      // Local-only tables
      outbox: '++id, table, rowId, updatedAt, attempt',
      syncState: 'table',
      pendingUploads: '++id, attachmentId, attempt',
      kv: 'key',
    })

    // Future migrations use:
    // this.version(2).stores({...}).upgrade(tx => { ... })
  }

  /** Wipe all local IndexedDB tables cleanly. */
  async wipeAll(): Promise<void> {
    await this.transaction('rw', this.tables, async () => {
      for (const table of this.tables) {
        await table.clear()
      }
    })
  }
}

export const db = new SanchayDB()

/** Ensure IndexedDB storage is persisted (prevents eviction). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Get storage usage estimate. */
export async function getStorageEstimate(): Promise<{ usageBytes: number; quotaBytes: number }> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return { usageBytes: 0, quotaBytes: 0 }
    const estimate = await navigator.storage.estimate()
    return {
      usageBytes: estimate.usage ?? 0,
      quotaBytes: estimate.quota ?? 0,
    }
  } catch {
    return { usageBytes: 0, quotaBytes: 0 }
  }
}
