/**
 * db/repositories/recurringRepo.ts — Recurring rules and overrides repository,
 * plus deterministic occurrence materialization.
 *
 * @see Sanchay_spec.md section 10.5
 */

import { db } from '../db'
import { upsertWithOutbox, softDeleteWithOutbox } from '../outboxHelper'
import { uuidv7, uuidv5 } from '../../lib/ids'
import { occurrences } from '../../domain/recurrence'
import { subtractOneYear, todayLocal } from '../../domain/dates'
import { transactionRepo } from './transactionRepo'
import type { RecurringRule, RecurringOverride } from '@sanchay/shared'

export const recurringRepo = {
  async getRuleById(id: string): Promise<RecurringRule | undefined> {
    return db.recurringRules.get(id)
  },

  async getAllRules(): Promise<RecurringRule[]> {
    return db.recurringRules.filter((r) => !r.deletedAt).toArray()
  },

  async createRule(
    data: Omit<RecurringRule, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'serverSeq' | 'version'>,
  ): Promise<RecurringRule> {
    const now = new Date().toISOString()
    const id = uuidv7()
    const rule: RecurringRule = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      serverSeq: null,
      version: 1,
    }

    await upsertWithOutbox(db.recurringRules, 'recurring_rules', rule)
    return rule
  },

  async updateRule(
    id: string,
    patch: Partial<Omit<RecurringRule, 'id' | 'userId' | 'createdAt' | 'serverSeq'>>,
  ): Promise<RecurringRule> {
    const existing = await db.recurringRules.get(id)
    if (!existing) throw new Error(`Recurring rule not found: ${id}`)

    const now = new Date().toISOString()
    const updated: RecurringRule = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: (existing.version ?? 1) + 1,
    }

    await upsertWithOutbox(db.recurringRules, 'recurring_rules', updated)
    return updated
  },

  async deleteRule(id: string): Promise<void> {
    await softDeleteWithOutbox(db.recurringRules, 'recurring_rules', id)
  },

  async getOverridesForRule(ruleId: string): Promise<RecurringOverride[]> {
    return db.recurringOverrides
      .where('ruleId')
      .equals(ruleId)
      .and((o) => !o.deletedAt)
      .toArray()
  },

  async createOverride(
    data: Omit<RecurringOverride, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'serverSeq' | 'version'>,
  ): Promise<RecurringOverride> {
    const now = new Date().toISOString()
    const id = uuidv7()
    const override: RecurringOverride = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      serverSeq: null,
      version: 1,
    }

    await upsertWithOutbox(db.recurringOverrides, 'recurring_overrides', override)
    return override
  },

  /**
   * Materializes due recurring transactions (mode = 'auto_post').
   * Uses deterministic UUIDv5 for transaction id: uuidv5(rule_id, occurrence_date).
   */
  async materializeDueOccurrences(
    userId: string,
    todayStr = todayLocal(),
  ): Promise<number> {
    // Paused rules must not post anything.
    const activeRules = await db.recurringRules
      .where('userId')
      .equals(userId)
      .and((r) => !r.deletedAt && !r.pausedAt && r.mode === 'auto_post')
      .toArray()

    const profile = await db.profiles.filter((p) => p.userId === userId && !p.deletedAt).first()
    const baseCurrency = profile?.baseCurrency ?? null

    let createdCount = 0
    const oneYearAgo = subtractOneYear(todayStr)

    for (const rule of activeRules) {
      const fromDate = rule.startDate > oneYearAgo ? rule.startDate : oneYearAgo
      if (fromDate > todayStr) continue

      const overrides = await this.getOverridesForRule(rule.id)
      const dates = occurrences(rule, fromDate, todayStr, overrides)

      for (const occurrenceDate of dates) {
        // Check if override skipped this
        const override = overrides.find((o) => o.occurrenceDate === occurrenceDate)
        if (override?.action === 'skip') continue

        // Check if transaction already exists for this rule and occurrenceDate
        const existingTx = await db.transactions
          .where('recurringRuleId')
          .equals(rule.id)
          .and((tx) => tx.recurringOccurrenceDate === occurrenceDate)
          .first()

        if (existingTx) continue

        // Deterministic UUIDv5 transaction ID: uuidv5(occurrenceDate, rule.id namespace)
        const deterministicId = await uuidv5(rule.id, occurrenceDate)

        // Check if transaction with this deterministicId already exists (e.g. from sync)
        const existingById = await db.transactions.get(deterministicId)
        if (existingById) continue

        const amountMinor =
          override?.action === 'amount_changed' && override.newAmountMinor
            ? override.newAmountMinor
            : rule.amountMinor
        const accountId = rule.accountId
        const toAccountId = rule.toAccountId ?? null

        // Base amount must be expressed in the base currency, not the account's currency.
        let baseAmountMinor = amountMinor
        let fxRate = '1'
        const account = await db.accounts.get(accountId)
        if (account && baseCurrency && account.currency.toUpperCase() !== baseCurrency.toUpperCase()) {
          try {
            const { fxService } = await import('../../features/fx/services/fxService')
            const converted = await fxService.convert(amountMinor, account.currency, baseCurrency, occurrenceDate)
            baseAmountMinor = converted.baseAmountMinor
            fxRate = converted.rateUsed
          } catch (err) {
            // No usable rate right now: leave this occurrence for the next sync instead of
            // posting a transaction with a wrong base amount.
            console.warn('[Recurring] FX conversion failed; deferring occurrence', occurrenceDate, err)
            continue
          }
        }

        await transactionRepo.create({
          id: deterministicId,
          userId,
          type: rule.type,
          accountId,
          toAccountId,
          amountMinor,
          toAmountMinor: rule.type === 'transfer' ? amountMinor : null,
          baseAmountMinor,
          fxRate,
          occurredOn: occurrenceDate,
          occurredTime: null,
          categoryId: rule.categoryId,
          payee: rule.payee,
          note: rule.note,
          paymentMethod: null,
          adjustmentSign: null,
          recurringRuleId: rule.id,
          recurringOccurrenceDate: occurrenceDate,
          source: 'recurring',
        })

        createdCount++
      }
    }

    return createdCount
  },
}
