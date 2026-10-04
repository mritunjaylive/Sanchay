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

  async delete(id: string, reassignToCategoryId?: string): Promise<void> {
    if (reassignToCategoryId) {
      // Reassign transactions
      const txs = await db.transactions
        .filter((tx) => !tx.deletedAt && tx.categoryId === id)
        .toArray()
      for (const tx of txs) {
        if (!tx.deletedAt) {
          const now = new Date().toISOString()
          await upsertWithOutbox(db.transactions, 'transactions', {
            ...tx,
            categoryId: reassignToCategoryId,
            updatedAt: now,
            version: (tx.version ?? 1) + 1,
          })
        }
      }
    }

    await softDeleteWithOutbox(db.categories, 'categories', id)
  },

  async merge(sourceId: string, targetId: string): Promise<void> {
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
      const key = `${cat.kind}:${normName}`
      const existing = canonicalMap.get(key)
      if (!existing) {
        canonicalMap.set(key, cat)
      } else {
        duplicates.push({ duplicate: cat, canonical: existing })
      }
    }

    if (duplicates.length === 0) return

    for (const { duplicate, canonical } of duplicates) {
      // 1. Reassign transactions
      const txs = await db.transactions
        .filter((tx) => !tx.deletedAt && tx.categoryId === duplicate.id)
        .toArray()
      for (const tx of txs) {
        await upsertWithOutbox(db.transactions, 'transactions', {
          ...tx,
          categoryId: canonical.id,
          updatedAt: new Date().toISOString(),
          version: (tx.version ?? 1) + 1,
        })
      }

      // 2. Reassign budgets
      const budgets = await db.budgets
        .filter((b) => !b.deletedAt && b.categoryId === duplicate.id)
        .toArray()
      for (const b of budgets) {
        await upsertWithOutbox(db.budgets, 'budgets', {
          ...b,
          categoryId: canonical.id,
          updatedAt: new Date().toISOString(),
          version: (b.version ?? 1) + 1,
        })
      }

      // 3. Reassign recurring rules
      const rules = await db.recurringRules
        .filter((r) => !r.deletedAt && r.categoryId === duplicate.id)
        .toArray()
      for (const r of rules) {
        await upsertWithOutbox(db.recurringRules, 'recurring_rules', {
          ...r,
          categoryId: canonical.id,
          updatedAt: new Date().toISOString(),
          version: (r.version ?? 1) + 1,
        })
      }

      // 4. Delete the duplicate category from local table and outbox
      await db.categories.delete(duplicate.id)
      await db.outbox
        .where('table')
        .equals('categories')
        .and((e) => e.rowId === duplicate.id)
        .delete()
    }
  },

  /**
   * Seeds default categories for a new user if none exist.
   * Idempotent: skips any category whose name already exists.
   * Spec section 20 standard categories.
   */
  async seedDefaultCategories(userId: string): Promise<void> {
    await this.deduplicateCategories(userId)

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
    const rows = await db.transactionTags.where('tagId').equals(sourceTagId).toArray()
    const now = new Date().toISOString()
    for (const r of rows) {
      if (!r.deletedAt) {
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
