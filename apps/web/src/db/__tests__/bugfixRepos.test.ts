/**
 * Regression tests for repository / store bug fixes.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../db'
import { transactionRepo } from '../repositories/transactionRepo'
import { categoryRepo, tagRepo } from '../repositories/categoryRepo'
import { recurringRepo } from '../repositories/recurringRepo'
import { notificationRepo } from '../repositories/notificationRepo'
import { useAppLockStore } from '../../features/auth/stores/appLockStore'
import type { Category, RecurringRule } from '@sanchay/shared'

const U = 'user-1'

const baseTx = {
  userId: U,
  type: 'expense' as const,
  accountId: 'acc-1',
  toAccountId: null,
  amountMinor: 1000,
  toAmountMinor: null,
  baseAmountMinor: 1000,
  fxRate: '1',
  occurredOn: '2026-03-10',
  categoryId: null,
  payee: 'Shop',
  note: null,
  paymentMethod: null,
  adjustmentSign: null,
  recurringRuleId: null,
  recurringOccurrenceDate: null,
}

const cat = (p: Partial<Category> & { id: string; name: string }): Category => ({
  userId: U,
  kind: 'expense',
  parentId: null,
  icon: null,
  color: null,
  sortOrder: 0,
  archivedAt: null,
  systemKey: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  serverSeq: null,
  version: 1,
  ...p,
})

describe('repository bug fixes', () => {
  beforeEach(async () => {
    await Promise.all([
      db.transactions.clear(),
      db.transactionTags.clear(),
      db.tags.clear(),
      db.categories.clear(),
      db.budgets.clear(),
      db.recurringRules.clear(),
      db.recurringOverrides.clear(),
      db.notifications.clear(),
      db.accounts.clear(),
      db.profiles.clear(),
      db.outbox.clear(),
      db.kv.clear(),
    ])
  })

  it('duplicate() does not copy the recurring slot of the original', async () => {
    const original = await transactionRepo.create({
      ...baseTx,
      recurringRuleId: 'rule-1',
      recurringOccurrenceDate: '2026-03-10',
      source: 'recurring',
    })
    const copy = await transactionRepo.duplicate(original.id)
    expect(copy.recurringRuleId).toBeNull()
    expect(copy.recurringOccurrenceDate).toBeNull()
    expect(copy.source).toBe('manual')
  })

  it('re-adding a removed tag revives the old link instead of creating a duplicate pair', async () => {
    const t = await transactionRepo.create({ ...baseTx, tagIds: ['tag-1'] })
    await transactionRepo.update(t.id, {}, [])
    await transactionRepo.update(t.id, {}, ['tag-1'])

    const rows = await db.transactionTags.where('transactionId').equals(t.id).toArray()
    expect(rows.filter((r) => r.tagId === 'tag-1')).toHaveLength(1)
    expect(rows[0]!.deletedAt).toBeNull()
    expect(await transactionRepo.getTagsForTransaction(t.id)).toEqual(['tag-1'])
  })

  it('tag merge never creates a second (transaction, tag) pair', async () => {
    const src = await tagRepo.create({ userId: U, name: 'a', color: null } as never)
    const dst = await tagRepo.create({ userId: U, name: 'b', color: null } as never)
    const both = await transactionRepo.create({ ...baseTx, tagIds: [src.id, dst.id] })
    const onlySrc = await transactionRepo.create({ ...baseTx, tagIds: [src.id] })

    await tagRepo.merge(src.id, dst.id)

    expect(await transactionRepo.getTagsForTransaction(both.id)).toEqual([dst.id])
    expect(await transactionRepo.getTagsForTransaction(onlySrc.id)).toEqual([dst.id])
    const live = (await db.transactionTags.toArray()).filter((r) => !r.deletedAt)
    const pairs = live.map((r) => `${r.transactionId}:${r.tagId}`)
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('a dismissed notification is not recreated for the same dedupe key', async () => {
    const data = {
      userId: U,
      kind: 'bill_reminder',
      title: 't',
      body: 'b',
      payload: null,
      readAt: null,
      dedupeKey: 'bill-1-2026-03-10',
    }
    const first = await notificationRepo.create(data as never)
    expect(first).not.toBeNull()
    await notificationRepo.delete(first!.id)
    expect(await notificationRepo.create(data as never)).toBeNull()
  })

  it('paused recurring rules do not auto-post', async () => {
    const rule = {
      id: 'rule-paused',
      userId: U,
      title: 'Paused',
      type: 'expense',
      accountId: 'acc-1',
      toAccountId: null,
      amountMinor: 500,
      categoryId: null,
      payee: null,
      note: null,
      freq: 'monthly',
      interval: 1,
      byWeekday: null,
      byMonthDay: null,
      startDate: '2026-01-01',
      endDate: null,
      maxCount: null,
      mode: 'auto_post',
      remindDaysBefore: 1,
      pausedAt: '2026-02-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      serverSeq: null,
      version: 1,
    } as RecurringRule
    await db.recurringRules.put(rule)
    expect(await recurringRepo.materializeDueOccurrences(U, '2026-03-15')).toBe(0)

    await db.recurringRules.put({ ...rule, pausedAt: null })
    expect(await recurringRepo.materializeDueOccurrences(U, '2026-03-15')).toBe(3)
  })

  it('deleting a category with a target moves transactions, budgets, rules and sub-categories', async () => {
    await db.categories.bulkPut([
      cat({ id: 'old', name: 'Old' }),
      cat({ id: 'new', name: 'New' }),
      cat({ id: 'child', name: 'Child', parentId: 'old' }),
    ])
    await db.budgets.put({
      id: 'b1', userId: U, categoryId: 'old', amountMinor: 1, effectiveFrom: '2026-01', rollover: false,
      alertThresholds: [80, 100], createdAt: 'x', updatedAt: 'x', deletedAt: null, serverSeq: null, version: 1,
    } as never)
    await transactionRepo.create({ ...baseTx, categoryId: 'old' })

    await categoryRepo.delete('old', 'new')

    expect((await db.budgets.get('b1'))?.categoryId).toBe('new')
    expect((await db.categories.get('child'))?.parentId).toBe('new')
    expect((await db.transactions.toArray())[0]!.categoryId).toBe('new')
    expect((await db.categories.get('old'))?.deletedAt).not.toBeNull()
  })

  it('deduplicate keeps same-named sub-categories under different parents and soft-deletes real duplicates', async () => {
    await db.categories.bulkPut([
      cat({ id: 'food', name: 'Food' }),
      cat({ id: 'travel', name: 'Travel' }),
      cat({ id: 'food-other', name: 'Other', parentId: 'food' }),
      cat({ id: 'travel-other', name: 'Other', parentId: 'travel' }),
      cat({ id: 'dup', name: 'food', sortOrder: 5 }),
    ])
    await categoryRepo.deduplicateCategories(U)

    expect((await db.categories.get('food-other'))?.deletedAt).toBeNull()
    expect((await db.categories.get('travel-other'))?.deletedAt).toBeNull()
    // duplicate is tombstoned (still present locally) and queued for the server
    expect((await db.categories.get('dup'))?.deletedAt).toBeTruthy()
    expect(await db.outbox.where('rowId').equals('dup').count()).toBe(1)
  })

  it('removing the PIN requires the current PIN and counts failed attempts', async () => {
    const store = useAppLockStore
    await store.getState().setPin('1234')

    expect(await store.getState().removePin()).toEqual({ success: false, error: 'pin_required' })
    expect((await store.getState().removePin('0000')).error).toBe('invalid_pin')
    expect(store.getState().failedAttempts).toBe(1)
    expect(store.getState().hasPin).toBe(true)

    expect((await store.getState().removePin('1234')).success).toBe(true)
    expect(store.getState().hasPin).toBe(false)
  })
})
