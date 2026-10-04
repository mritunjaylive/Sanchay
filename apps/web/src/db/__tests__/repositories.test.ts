import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { accountRepo } from '../repositories/accountRepo'
import { transactionRepo } from '../repositories/transactionRepo'
import { categoryRepo } from '../repositories/categoryRepo'

describe('db/repositories — IndexedDB & Outbox Atomic Operations', () => {
  beforeEach(async () => {
    await db.accounts.clear()
    await db.transactions.clear()
    await db.transactionTags.clear()
    await db.categories.clear()
    await db.outbox.clear()
  })

  describe('accountRepo', () => {
    it('creates an account and writes an outbox entry atomically in the same transaction', async () => {
      const account = await accountRepo.create({
        userId: 'user-1',
        name: 'HDFC Savings',
        kind: 'bank',
        currency: 'INR',
        openingBalanceMinor: 500000,
        openingDate: '2026-01-01',
        creditLimitMinor: null,
        statementDay: null,
        dueDay: null,
        note: null,
        excludeFromNetWorth: false,
        icon: 'Landmark',
        color: '#3b82f6',
        sortOrder: 0,
        archivedAt: null,
      })

      // Check account table
      const storedAccount = await db.accounts.get(account.id)
      expect(storedAccount).toBeDefined()
      expect(storedAccount?.name).toBe('HDFC Savings')

      // Check outbox table
      const outboxEntries = await db.outbox.where('table').equals('accounts').toArray()
      expect(outboxEntries.length).toBe(1)
      expect(outboxEntries[0]?.rowId).toBe(account.id)
      expect(outboxEntries[0]?.op).toBe('upsert')
      expect(outboxEntries[0]?.snapshot['name']).toBe('HDFC Savings')
    })

    it('coalesces multiple updates to the same row into a single outbox entry', async () => {
      const account = await accountRepo.create({
        userId: 'user-1',
        name: 'Initial Name',
        kind: 'bank',
        currency: 'INR',
        openingBalanceMinor: 100000,
        openingDate: '2026-01-01',
        creditLimitMinor: null,
        statementDay: null,
        dueDay: null,
        note: null,
        excludeFromNetWorth: false,
        icon: null,
        color: null,
        sortOrder: 0,
        archivedAt: null,
      })

      // Update 1
      await accountRepo.update(account.id, { name: 'Second Name' })
      // Update 2
      await accountRepo.update(account.id, { name: 'Final Name' })

      // Outbox must have coalesced into ONE entry for this account
      const outboxEntries = await db.outbox.where('table').equals('accounts').toArray()
      expect(outboxEntries.length).toBe(1)
      expect(outboxEntries[0]?.rowId).toBe(account.id)
      expect(outboxEntries[0]?.snapshot['name']).toBe('Final Name')
    })

    it('performs soft delete and records delete operation in outbox', async () => {
      const account = await accountRepo.create({
        userId: 'user-1',
        name: 'To Be Deleted',
        kind: 'cash',
        currency: 'INR',
        openingBalanceMinor: 0,
        openingDate: '2026-01-01',
        creditLimitMinor: null,
        statementDay: null,
        dueDay: null,
        note: null,
        excludeFromNetWorth: false,
        icon: null,
        color: null,
        sortOrder: 0,
        archivedAt: null,
      })

      await accountRepo.delete(account.id)

      const stored = await db.accounts.get(account.id)
      expect(stored?.deletedAt).not.toBeNull()

      const outbox = await db.outbox.where('table').equals('accounts').first()
      expect(outbox?.op).toBe('delete')
    })
  })

  describe('transactionRepo', () => {
    it('creates a transaction with tags and records outbox entries for both', async () => {
      const tx = await transactionRepo.create({
        userId: 'user-1',
        type: 'expense',
        accountId: 'acc-1',
        toAccountId: null,
        amountMinor: 25000,
        toAmountMinor: null,
        baseAmountMinor: 25000,
        fxRate: '1',
        occurredOn: '2026-01-15',
        categoryId: 'cat-food',
        payee: 'Cafe',
        note: 'Coffee',
        paymentMethod: 'UPI',
        adjustmentSign: null,
        recurringRuleId: null,
        recurringOccurrenceDate: null,
        tagIds: ['tag-work'],
      })

      const storedTx = await db.transactions.get(tx.id)
      expect(storedTx).toBeDefined()

      const txOutbox = await db.outbox.where('table').equals('transactions').toArray()
      expect(txOutbox.length).toBe(1)
      expect(txOutbox[0]?.rowId).toBe(tx.id)

      const tagOutbox = await db.outbox.where('table').equals('transaction_tags').toArray()
      expect(tagOutbox.length).toBe(1)
      expect(tagOutbox[0]?.snapshot['transaction_id']).toBe(tx.id)
    })
  })
})
