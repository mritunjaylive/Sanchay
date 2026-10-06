/**
 * db/repositories/categoryRepo.ts — Category and Tag repository.
 *
 * Supports hierarchical categories (up to 2 levels), merge, reassignment on delete,
 * duplicate cleanup, and idempotent default category seeding per spec section 20.
 *
 * @see Sanchay_spec.md section 7.2, 7.5, 20
 */

import { db } from '../db'
import { upsertWithOutbox, softDeleteWithOutbox } from '../outboxHelper'
import { uuidv7 } from '../../lib/ids'
import type { Category, Tag } from '@sanchay/shared'

export const categoryRepo = {
  async getById(id: string): Promise<Category | undefined> {
    return db.categories.get(id)
  },

  async getAll(userId?: string): Promise<Category[]> {
    return db.categories
      .filter((c) => !c.deletedAt && (!userId || !c.userId || c.userId === userId))
      .sortBy('sortOrder')
  },

  async create(data: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'serverSeq' | 'version'>): Promise<Category> {
    const now = new Date().toISOString()
    const id = uuidv7()
    const category: Category = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      serverSeq: null,
      version: 1,
    }

    await upsertWithOutbox(db.categories, 'categories', category)
    return category
  },

  async update(id: string, patch: Partial<Omit<Category, 'id' | 'userId' | 'createdAt' | 'serverSeq'>>): Promise<Category> {
    const existing = await db.categories.get(id)
    if (!existing) throw new Error(`Category not found: ${id}`)

    const now = new Date().toISOString()
    const updated: Category = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: (existing.version ?? 1) + 1,
    }

    await upsertWithOutbox(db.categories, 'categories', updated)
    return updated
  },

  /**
   * Re-points everything that references category `id` and soft-deletes nothing itself.
   * With a target: transactions, budgets, recurring rules and sub-categories move to it.
   * Without one: sub-categories become top-level, rules lose their category and budgets on the
   * category are removed (a budget on a deleted category is meaningless).
   */
  async _reassignReferences(id: string, targetId?: string): Promise<void> {
    const now = new Date().toISOString()
    const target = targetId ? await db.categories.get(targetId) : undefined

    if (targetId) {
      const txs = await db.transactions.filter((tx) => !tx.deletedAt && tx.categoryId === id).toArray()
      for (const tx of txs) {
        await upsertWithOutbox(db.transactions, 'transactions', {
          ...tx,
          categoryId: targetId,
          updatedAt: now,
          version: (tx.version ?? 1) + 1,
        })
      }
    }

    const budgets = await db.budgets.filter((b) => !b.deletedAt && b.categoryId === id).toArray()
    for (const b of budgets) {
      if (targetId) {
        await upsertWithOutbox(db.budgets, 'budgets', {
          ...b,
          categoryId: targetId,
          updatedAt: now,
          version: (b.version ?? 1) + 1,
        })
      } else {
        await softDeleteWithOutbox(db.budgets, 'budgets', b.id)
      }
    }

    const rules = await db.recurringRules.filter((r) => !r.deletedAt && r.categoryId === id).toArray()
    for (const r of rules) {
      await upsertWithOutbox(db.recurringRules, 'recurring_rules', {
        ...r,
        categoryId: targetId ?? null,
        updatedAt: now,
        version: (r.version ?? 1) + 1,
      })
    }

    // Sub-categories: keep the hierarchy at most 2 levels deep.
    const children = await db.categories.filter((c) => !c.deletedAt && c.parentId === id).toArray()
    for (const c of children) {
      await upsertWithOutbox(db.categories, 'categories', {
        ...c,
        parentId: target ? (target.parentId ?? target.id) : null,
        updatedAt: now,
        version: (c.version ?? 1) + 1,
      })
    }
  },

  async delete(id: string, reassignToCategoryId?: string): Promise<void> {
    await this._reassignReferences(id, reassignToCategoryId)
    await softDeleteWithOutbox(db.categories, 'categories', id)
  },

  async merge(sourceId: string, targetId: string): Promise<void> {
    if (sourceId === targetId) return
    await this.delete(sourceId, targetId)
  },

  /**
   * Cleans up any duplicate category rows in IndexedDB.
   * Remaps transactions, budgets, and recurring rules from duplicate to canonical category.
   */
  async deduplicateCategories(userId?: string): Promise<void> {
    const all = await db.categories.filter((c) => !c.deletedAt).toArray()
    if (all.length === 0) return

    // Sort to prioritize keeping rows matching the active userId, then by sortOrder
    const sorted = [...all].sort((a, b) => {
      if (userId) {
        if (a.userId === userId && b.userId !== userId) return -1
        if (b.userId === userId && a.userId !== userId) return 1
      }
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    })

    const canonicalMap = new Map<string, Category>()
    const duplicates: { duplicate: Category; canonical: Category }[] = []

    for (const cat of sorted) {
      const normName = cat.name.trim().toLowerCase()
      // If userId is provided, group per user if possible, or cross-user if one is orphan/offline
      // Sub-categories with the same name under different parents are NOT duplicates.
      const key = `${cat.kind}:${cat.parentId ?? ''}:${normName}`
      const existing = canonicalMap.get(key)
      if (!existing) {
        canonicalMap.set(key, cat)
      } else {
        duplicates.push({ duplicate: cat, canonical: existing })
      }
    }

    if (duplicates.length === 0) return

    for (const { duplicate, canonical } of duplicates) {
      // Moves transactions, budgets, rules and child categories onto the canonical row.
      await this._reassignReferences(duplicate.id, canonical.id)

      // Soft-delete (not a local hard delete): the server copy must receive the tombstone,
      // otherwise the duplicate would be pulled back on the next sync.
      await softDeleteWithOutbox(db.categories, 'categories', duplicate.id)
    }
  },

  /**
   * Seeds default categories for a new user if none exist.
   * Idempotent: skips any category whose name already exists.
   * Spec section 20 standard categories.
   */
  async seedDefaultCategories(userId: string): Promise<void> {
    const existing = await db.categories.filter((c) => !c.deletedAt).toArray()
    const existingKeys = new Set(
      existing.map((c) => `${c.kind}:${c.name.trim().toLowerCase()}`),
    )

    const defaultExpense = [
      { name: 'Food & Dining', icon: 'Utensils', color: '#f97316' },
      { name: 'Groceries', icon: 'ShoppingCart', color: '#10b981' },
      { name: 'Transport & Fuel', icon: 'Car', color: '#3b82f6' },
      { name: 'Shopping', icon: 'ShoppingBag', color: '#ec4899' },
      { name: 'Bills & Utilities', icon: 'Receipt', color: '#8b5cf6' },
      { name: 'Housing & Rent', icon: 'Home', color: '#6366f1' },
      { name: 'Health & Medical', icon: 'HeartPulse', color: '#ef4444' },
      { name: 'Entertainment', icon: 'Film', color: '#f59e0b' },
      { name: 'Education', icon: 'GraduationCap', color: '#14b8a6' },
      { name: 'Personal Care', icon: 'Smile', color: '#06b6d4' },
      { name: 'Gifts & Donations', icon: 'Gift', color: '#d946ef' },
      { name: 'Other Expense', icon: 'CircleEllipsis', color: '#64748b' },
    ]

    const defaultIncome = [
      { name: 'Salary', icon: 'Briefcase', color: '#22c55e' },
      { name: 'Business / Freelance', icon: 'Laptop', color: '#06b6d4' },
      { name: 'Investments & Dividends', icon: 'TrendingUp', color: '#3b82f6' },
      { name: 'Gifts Received', icon: 'Gift', color: '#a855f7' },
      { name: 'Interest', icon: 'Percent', color: '#eab308' },
      { name: 'Other Income', icon: 'Coins', color: '#64748b' },
    ]

    let sortOrder = existing.length
    for (const item of defaultExpense) {
      const key = `expense:${item.name.trim().toLowerCase()}`
      if (existingKeys.has(key)) continue
      existingKeys.add(key)
      await this.create({
        userId,
        name: item.name,
        kind: 'expense',
        parentId: null,
        icon: item.icon,
        color: item.color,
        sortOrder: sortOrder++,
        archivedAt: null,
        systemKey: null,
      })
    }

    for (const item of defaultIncome) {
      const key = `income:${item.name.trim().toLowerCase()}`
      if (existingKeys.has(key)) continue
      existingKeys.add(key)
      await this.create({
        userId,
        name: item.name,
        kind: 'income',
        parentId: null,
        icon: item.icon,
        color: item.color,
        sortOrder: sortOrder++,
        archivedAt: null,
        systemKey: null,
      })
    }
  },
}

export const tagRepo = {
  async getAll(): Promise<Tag[]> {
    return db.tags.filter((t) => !t.deletedAt).toArray()
  },

  async create(data: Omit<Tag, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'serverSeq' | 'version'>): Promise<Tag> {
    const now = new Date().toISOString()
    const id = uuidv7()
    const tag: Tag = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      serverSeq: null,
      version: 1,
    }

    await upsertWithOutbox(db.tags, 'tags', tag)
    return tag
  },

  async update(id: string, patch: Partial<Omit<Tag, 'id' | 'userId' | 'createdAt' | 'serverSeq'>>): Promise<Tag> {
    const existing = await db.tags.get(id)
    if (!existing) throw new Error(`Tag not found: ${id}`)

    const now = new Date().toISOString()
    const updated: Tag = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: (existing.version ?? 1) + 1,
    }

    await upsertWithOutbox(db.tags, 'tags', updated)
    return updated
  },

  async delete(id: string): Promise<void> {
    await softDeleteWithOutbox(db.tags, 'tags', id)
  },

  async merge(sourceTagId: string, targetTagId: string): Promise<void> {
    if (sourceTagId === targetTagId) return
    const rows = await db.transactionTags.where('tagId').equals(sourceTagId).toArray()
    const now = new Date().toISOString()
    for (const r of rows) {
      if (r.deletedAt) continue

      const targetRows = await db.transactionTags
        .where('transactionId')
        .equals(r.transactionId)
        .and((x) => x.tagId === targetTagId)
        .toArray()
      const live = targetRows.find((x) => !x.deletedAt)
      const tombstone = targetRows.find((x) => !!x.deletedAt)

      if (live) {
        // Transaction already carries the target tag: just drop the source link.
        await softDeleteWithOutbox(db.transactionTags, 'transaction_tags', r.id)
      } else if (tombstone) {
        // Revive the old target link rather than creating a duplicate pair.
        await upsertWithOutbox(db.transactionTags, 'transaction_tags', {
          ...tombstone,
          deletedAt: null,
          updatedAt: now,
          version: (tombstone.version ?? 1) + 1,
        })
        await softDeleteWithOutbox(db.transactionTags, 'transaction_tags', r.id)
      } else {
        await upsertWithOutbox(db.transactionTags, 'transaction_tags', {
          ...r,
          tagId: targetTagId,
          updatedAt: now,
          version: (r.version ?? 1) + 1,
        })
      }
    }
    await this.delete(sourceTagId)
  },
}
