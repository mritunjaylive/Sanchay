/**
 * db/repositories/goalRepo.ts — Savings goals and contributions repository.
 *
 * All writes go through this repository and record an outbox entry.
 *
 * @see Sanchay_spec.md section 7.2, 7.5, 10.8
 */

import { db } from '../db'
import { upsertWithOutbox, softDeleteWithOutbox } from '../outboxHelper'
import { uuidv7 } from '../../lib/ids'
import type { Goal, GoalContribution } from '@sanchay/shared'

export const goalRepo = {
  async getById(id: string): Promise<Goal | undefined> {
    return db.goals.get(id)
  },

  async getAll(): Promise<Goal[]> {
    return db.goals.filter((g) => !g.deletedAt).toArray()
  },

  async create(data: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'serverSeq' | 'version'>): Promise<Goal> {
    const now = new Date().toISOString()
    const id = uuidv7()
    const goal: Goal = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      serverSeq: null,
      version: 1,
    }

    await upsertWithOutbox(db.goals, 'goals', goal)
    return goal
  },

  async update(id: string, patch: Partial<Omit<Goal, 'id' | 'userId' | 'createdAt' | 'serverSeq'>>): Promise<Goal> {
    const existing = await db.goals.get(id)
    if (!existing) throw new Error(`Goal not found: ${id}`)

    const now = new Date().toISOString()
    const updated: Goal = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: (existing.version ?? 1) + 1,
    }

    await upsertWithOutbox(db.goals, 'goals', updated)
    return updated
  },

  async delete(id: string): Promise<void> {
    await softDeleteWithOutbox(db.goals, 'goals', id)
  },

  async getContributions(goalId: string): Promise<GoalContribution[]> {
    return db.goalContributions
      .where('goalId')
      .equals(goalId)
      .and((c) => !c.deletedAt)
      .toArray()
  },

  async addContribution(
    data: Omit<GoalContribution, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'serverSeq' | 'version'>,
  ): Promise<GoalContribution> {
    const now = new Date().toISOString()
    const id = uuidv7()
    const contribution: GoalContribution = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      serverSeq: null,
      version: 1,
    }

    await upsertWithOutbox(db.goalContributions, 'goal_contributions', contribution)
    return contribution
  },

  async deleteContribution(id: string): Promise<void> {
    await softDeleteWithOutbox(db.goalContributions, 'goal_contributions', id)
  },
}
