import { z } from 'zod'
import { syncRowSchema } from './sync.js'

export const recurringRuleSchema = syncRowSchema.extend({
  title: z.string().min(1).max(80),
  type: z.enum(['income', 'expense', 'transfer']),
  accountId: z.string().uuid(),
  toAccountId: z.string().uuid().nullable(),
  amountMinor: z.number().int().positive(),
  categoryId: z.string().uuid().nullable(),
  payee: z.string().max(120).nullable(),
  note: z.string().max(2000).nullable(),
  freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).default(1),
  byWeekday: z.array(z.number().int().min(0).max(6)).nullable(),
  byMonthDay: z.number().int().min(-1).max(31).nullable(), // -1 = last day of month
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  maxCount: z.number().int().positive().nullable(),
  mode: z.enum(['auto_post', 'remind_only']),
  remindDaysBefore: z.number().int().min(0).default(1),
  pausedAt: z.string().datetime().nullable(),
})
export type RecurringRule = z.infer<typeof recurringRuleSchema>

export const recurringOverrideSchema = syncRowSchema.extend({
  ruleId: z.string().uuid(),
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  action: z.enum(['skip', 'moved', 'amount_changed']),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  newAmountMinor: z.number().int().positive().nullable(),
})
export type RecurringOverride = z.infer<typeof recurringOverrideSchema>
