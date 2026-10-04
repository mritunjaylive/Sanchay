/**
 * db/repositories/notificationRepo.ts — In-app notification center repository.
 *
 * Uses dedupeKey to avoid duplicate notifications (e.g. for bill reminders or budget alerts).
 *
 * @see Sanchay_spec.md section 7.2, 7.5, 12.10
 */

import { db } from '../db'
import { upsertWithOutbox, softDeleteWithOutbox } from '../outboxHelper'
import { uuidv7 } from '../../lib/ids'
import type { Notification } from '@sanchay/shared'

export const notificationRepo = {
  async getAll(): Promise<Notification[]> {
    return db.notifications.filter((n) => !n.deletedAt).reverse().toArray()
  },

  async getUnreadCount(): Promise<number> {
    return db.notifications
      .filter((n) => !n.deletedAt && !n.readAt)
      .count()
  },

  async create(
    data: Omit<Notification, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'serverSeq' | 'version'>,
  ): Promise<Notification | null> {
    // If dedupeKey is specified, check if one already exists
    if (data.dedupeKey) {
      const existing = await db.notifications
        .where('dedupeKey')
        .equals(data.dedupeKey)
        .and((n) => !n.deletedAt)
        .first()
      if (existing) return existing
    }

    const now = new Date().toISOString()
    const id = uuidv7()
    const notification: Notification = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      serverSeq: null,
      version: 1,
    }

    await upsertWithOutbox(db.notifications, 'notifications', notification)
    return notification
  },

  async markAsRead(id: string): Promise<void> {
    const existing = await db.notifications.get(id)
    if (!existing || existing.readAt) return

    const now = new Date().toISOString()
    const updated: Notification = {
      ...existing,
      readAt: now,
      updatedAt: now,
      version: (existing.version ?? 1) + 1,
    }

    await upsertWithOutbox(db.notifications, 'notifications', updated)
  },

  async markAllAsRead(): Promise<void> {
    const unread = await db.notifications.filter((n) => !n.deletedAt && !n.readAt).toArray()
    const now = new Date().toISOString()
    for (const n of unread) {
      await upsertWithOutbox(db.notifications, 'notifications', {
        ...n,
        readAt: now,
        updatedAt: now,
        version: (n.version ?? 1) + 1,
      })
    }
  },

  async delete(id: string): Promise<void> {
    await softDeleteWithOutbox(db.notifications, 'notifications', id)
  },
}
