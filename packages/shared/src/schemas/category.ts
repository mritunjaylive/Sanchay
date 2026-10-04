import { z } from 'zod'
import { syncRowSchema } from './sync.js'

export const categorySchema = syncRowSchema.extend({
  name: z.string().min(1).max(80),
  kind: z.enum(['income', 'expense']),
  parentId: z.string().uuid().nullable(),
  icon: z.string().max(10).nullable(),
  color: z.string().max(20).nullable(),
  sortOrder: z.number().int().default(0),
  archivedAt: z.string().datetime().nullable(),
  systemKey: z.string().max(80).nullable(), // stable key for seeded defaults
})
export type Category = z.infer<typeof categorySchema>

export const tagSchema = syncRowSchema.extend({
  name: z.string().min(1).max(80),
  color: z.string().max(20).nullable(),
})
export type Tag = z.infer<typeof tagSchema>

/** Seeded expense category system keys (for localization without renaming). */
export const EXPENSE_CATEGORY_KEYS = [
  'food_dining', 'groceries', 'transport', 'fuel', 'shopping',
  'bills_utilities', 'rent_housing', 'health', 'education', 'entertainment',
  'travel', 'personal_care', 'gifts_donations', 'insurance',
  'emi_loans', 'interest_fees', 'taxes', 'other_expense',
] as const

export const INCOME_CATEGORY_KEYS = [
  'salary', 'business', 'freelance', 'interest_income',
  'investments', 'gifts_income', 'refunds', 'other_income',
] as const
