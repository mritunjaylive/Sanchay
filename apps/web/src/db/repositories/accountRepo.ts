/**
 * db/repositories/accountRepo.ts — Account and LoanTerms repository.
 *
 * All writes go through this repository and record an outbox entry.
 *
 * @see Sanchay_spec.md section 7.2, 7.5
 */

import { db } from '../db'
import { upsertWithOutbox, softDeleteWithOutbox } from '../outboxHelper'
import { uuidv7 } from '../../lib/ids'
import type { Account, LoanTerms } from '@sanchay/shared'

export const accountRepo = {
  async getById(id: string): Promise<Account | undefined> {
    return db.accounts.get(id)
  },

  async getAll(): Promise<Account[]> {
    return db.accounts.filter((a) => !a.deletedAt).sortBy('sortOrder')
  },

  async create(data: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'serverSeq' | 'version'>): Promise<Account> {
    const now = new Date().toISOString()
    const id = uuidv7()
    const account: Account = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      serverSeq: null,
      version: 1,
    }

    await upsertWithOutbox(db.accounts, 'accounts', account)
    return account
  },

  async update(id: string, patch: Partial<Omit<Account, 'id' | 'userId' | 'createdAt' | 'serverSeq'>>): Promise<Account> {
    const existing = await db.accounts.get(id)
    if (!existing) throw new Error(`Account not found: ${id}`)

    const now = new Date().toISOString()
    const updated: Account = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: (existing.version ?? 1) + 1,
    }

    await upsertWithOutbox(db.accounts, 'accounts', updated)
    return updated
  },

  async archive(id: string, archive = true): Promise<void> {
    await this.update(id, {
      archivedAt: archive ? new Date().toISOString() : null,
    })
  },

  async delete(id: string): Promise<void> {
    await softDeleteWithOutbox(db.accounts, 'accounts', id)
  },

  async reorder(orderedIds: string[]): Promise<void> {
    const now = new Date().toISOString()
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i]!
      const acc = await db.accounts.get(id)
      if (acc && acc.sortOrder !== i) {
        await upsertWithOutbox(db.accounts, 'accounts', {
          ...acc,
          sortOrder: i,
          updatedAt: now,
          version: (acc.version ?? 1) + 1,
        })
      }
    }
  },

  // Loan terms sub-entity
  async getLoanTerms(accountId: string): Promise<LoanTerms | undefined> {
    return db.loanTerms.where('accountId').equals(accountId).and((l) => !l.deletedAt).first()
  },

  async saveLoanTerms(data: Omit<LoanTerms, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'serverSeq' | 'version'>): Promise<LoanTerms> {
    const existing = await this.getLoanTerms(data.accountId)
    const now = new Date().toISOString()

    const loanTerms: LoanTerms = {
      ...data,
      id: existing ? existing.id : uuidv7(),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      deletedAt: null,
      serverSeq: existing ? existing.serverSeq : null,
      version: existing ? (existing.version ?? 1) + 1 : 1,
    }

    await upsertWithOutbox(db.loanTerms, 'loan_terms', loanTerms)
    return loanTerms
  },
}
