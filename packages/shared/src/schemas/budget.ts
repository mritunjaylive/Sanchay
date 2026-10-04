import { z } from 'zod'
import { syncRowSchema } from './sync.js'

export const budgetSchema = syncRowSchema.extend({
  categoryId: z.string().uuid().nullable(), // null = overall budget
  amountMinor: z.number().int().min(0), // 0 = end this budget
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  rollover: z.boolean().default(false),
  alertThresholds: z.array(z.number().int().min(1).max(200)).default([80, 100]),
})

export type Budget = z.infer<typeof budgetSchema>

export const savedFilterSchema = syncRowSchema.extend({
  name: z.string().min(1).max(80),
  filter: z.record(z.unknown()),
})
export type SavedFilter = z.infer<typeof savedFilterSchema>
