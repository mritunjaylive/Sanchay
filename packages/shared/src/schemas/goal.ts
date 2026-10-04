import { z } from 'zod'
import { syncRowSchema } from './sync.js'

export const goalSchema = syncRowSchema.extend({
  name: z.string().min(1).max(80),
  targetMinor: z.number().int().positive(),
  currency: z.string().length(3),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  linkedAccountId: z.string().uuid().nullable(),
  icon: z.string().max(10).nullable(),
  color: z.string().max(20).nullable(),
  completedAt: z.string().datetime().nullable(),
})
export type Goal = z.infer<typeof goalSchema>

export const goalContributionSchema = syncRowSchema.extend({
  goalId: z.string().uuid(),
  amountMinor: z.number().int(), // signed: negative = withdrawal
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(2000).nullable(),
})
export type GoalContribution = z.infer<typeof goalContributionSchema>
