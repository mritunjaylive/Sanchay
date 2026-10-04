/**
 * db/repositories/budgetRepo.ts — Budget repository.
 *
 * All writes go through this repository and record an outbox entry.
 *
 * @see Sanchay_spec.md section 7.2, 7.5, 10.4
 */

import { db } from '../db'
import { upsertWithOutbox, softDeleteWithOutbox } from '../outboxHelper'
import { uuidv7 } from '../../lib/ids'
import type { Budget } from '@sanchay/shared'

export const budgetRepo = {
  async getById(id: string): Promise<Budget | undefined> {
    return db.budgets.get(id)
  },

  async getAll(): Promise<Budget[]> {
    return db.budgets.filter((b) => !b.deletedAt).toArray()
  },

  async create(data: Omit<Budget, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'serverSeq' | 'version'>): Promise<Budget> {
    const now = new Date().toISOString()
    const id = uuidv7()
    const budget: Budget = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      serverSeq: null,
      version: 1,
    }

    await upsertWithOutbox(db.budgets, 'budgets', budget)
    return budget
  },

  async update(id: string, patch: Partial<Omit<Budget, 'id' | 'userId' | 'createdAt' | 'serverSeq'>>): Promise<Budget> {
    const existing = await db.budgets.get(id)
    if (!existing) throw new Error(`Budget not found: ${id}`)

    const now = new Date().toISOString()
    const updated: Budget = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: (existing.version ?? 1) + 1,
    }

    await upsertWithOutbox(db.budgets, 'budgets', updated)
    return updated
  },

  async delete(id: string): Promise<void> {
    await softDeleteWithOutbox(db.budgets, 'budgets', id)
  },
}
