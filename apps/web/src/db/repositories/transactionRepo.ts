/**
 * db/repositories/transactionRepo.ts — Transaction repository with tags & attachments.
 *
 * All writes go through this repository and record an outbox entry.
 *
 * @see Sanchay_spec.md section 7.2, 7.3, 7.5
 */

import { db } from '../db'
import { upsertWithOutbox, softDeleteWithOutbox } from '../outboxHelper'
import { uuidv7 } from '../../lib/ids'
import type { Transaction, TransactionTag, Attachment } from '@sanchay/shared'

export interface CreateTransactionParams
  extends Omit<
    Transaction,
    'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'serverSeq' | 'version' | 'occurredTime' | 'source'
  > {
  id?: string // Optional custom id, e.g. UUIDv5 for recurring occurrences
  occurredTime?: string | null
  source?: 'manual' | 'recurring' | 'import' | 'loan_schedule'
  tagIds?: string[]
}

export const transactionRepo = {
  async getById(id: string): Promise<Transaction | undefined> {
    return db.transactions.get(id)
  },

  async getTagsForTransaction(transactionId: string): Promise<string[]> {
    const rows = await db.transactionTags
      .where('transactionId')
      .equals(transactionId)
      .and((r) => !r.deletedAt)
      .toArray()
    return rows.map((r) => r.tagId)
  },

  async getAttachmentsForTransaction(transactionId: string): Promise<Attachment[]> {
    return db.attachments
      .where('transactionId')
      .equals(transactionId)
      .and((a) => !a.deletedAt)
      .toArray()
  },

  async create(params: CreateTransactionParams): Promise<Transaction> {
    const { tagIds, id: customId, ...txData } = params
    const now = new Date().toISOString()
    const id = customId ?? uuidv7()

    const transaction: Transaction = {
      ...txData,
      id,
      occurredTime: txData.occurredTime ?? null,
      source: txData.source ?? 'manual',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      serverSeq: null,
      version: 1,
    }

    await upsertWithOutbox(db.transactions, 'transactions', transaction)

    // Handle tags
    if (tagIds && tagIds.length > 0) {
      for (const tagId of tagIds) {
        const tagRow: TransactionTag = {
          id: uuidv7(),
          userId: transaction.userId,
          transactionId: id,
          tagId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          serverSeq: null,
          version: 1,
        }
        await upsertWithOutbox(db.transactionTags, 'transaction_tags', tagRow)
      }
    }

    return transaction
  },

  async update(
    id: string,
    patch: Partial<Omit<Transaction, 'id' | 'userId' | 'createdAt' | 'serverSeq'>>,
    tagIds?: string[],
  ): Promise<Transaction> {
    const existing = await db.transactions.get(id)
    if (!existing) throw new Error(`Transaction not found: ${id}`)

    const now = new Date().toISOString()
    const updated: Transaction = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: (existing.version ?? 1) + 1,
    }

    await upsertWithOutbox(db.transactions, 'transactions', updated)

    if (tagIds !== undefined) {
      // Reconcile tags
      const currentTags = await db.transactionTags
        .where('transactionId')
        .equals(id)
        .and((r) => !r.deletedAt)
        .toArray()

      const currentTagIds = new Set(currentTags.map((t) => t.tagId))
      const targetTagIds = new Set(tagIds)

      // Remove deleted
      for (const t of currentTags) {
        if (!targetTagIds.has(t.tagId)) {
          await softDeleteWithOutbox(db.transactionTags, 'transaction_tags', t.id)
        }
      }

      // Add new
      for (const tid of tagIds) {
        if (!currentTagIds.has(tid)) {
          const newTagRow: TransactionTag = {
            id: uuidv7(),
            userId: existing.userId,
            transactionId: id,
            tagId: tid,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            serverSeq: null,
            version: 1,
          }
          await upsertWithOutbox(db.transactionTags, 'transaction_tags', newTagRow)
        }
      }
    }

    return updated
  },

  async delete(id: string): Promise<void> {
    await softDeleteWithOutbox(db.transactions, 'transactions', id)
  },

  async restore(id: string): Promise<void> {
    const existing = await db.transactions.get(id)
    if (!existing) return

    const now = new Date().toISOString()
    const restored: Transaction = {
      ...existing,
      deletedAt: null,
      updatedAt: now,
      version: (existing.version ?? 1) + 1,
    }

    await upsertWithOutbox(db.transactions, 'transactions', restored)
  },

  async duplicate(id: string): Promise<Transaction> {
    const original = await db.transactions.get(id)
    if (!original) throw new Error(`Transaction not found: ${id}`)

    const tagIds = await this.getTagsForTransaction(id)
    const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, serverSeq: _s, version: _v, ...rest } = original

    return this.create({
      ...rest,
      tagIds,
    })
  },

  async bulkDelete(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.delete(id)
    }
  },

  async bulkUpdate(
    ids: string[],
    patch: {
      categoryId?: string | null
      accountId?: string
      tagIdsToAdd?: string[]
      tagIdsToRemove?: string[]
    },
  ): Promise<void> {
    for (const id of ids) {
      const tx = await db.transactions.get(id)
      if (!tx || tx.deletedAt) continue

      const txPatch: Partial<Transaction> = {}
      if (patch.categoryId !== undefined) txPatch.categoryId = patch.categoryId
      if (patch.accountId !== undefined) txPatch.accountId = patch.accountId

      if (Object.keys(txPatch).length > 0) {
        await this.update(id, txPatch)
      }

      if (patch.tagIdsToAdd?.length || patch.tagIdsToRemove?.length) {
        const current = await this.getTagsForTransaction(id)
        let nextTags = [...current]
        if (patch.tagIdsToAdd) {
          nextTags = Array.from(new Set([...nextTags, ...patch.tagIdsToAdd]))
        }
        if (patch.tagIdsToRemove) {
          const toRemove = new Set(patch.tagIdsToRemove)
          nextTags = nextTags.filter((t) => !toRemove.has(t))
        }
        await this.update(id, {}, nextTags)
      }
    }
  },
}
