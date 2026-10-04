import { z } from 'zod'
import { syncRowSchema } from './sync.js'
import { ACCOUNT_KINDS } from '../enums.js'

export const accountSchema = syncRowSchema.extend({
  name: z.string().min(1).max(80),
  kind: z.enum(ACCOUNT_KINDS as [string, ...string[]]),
  currency: z.string().length(3),
  openingBalanceMinor: z.number().int(),
  openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  icon: z.string().max(10).nullable(),
  color: z.string().max(20).nullable(),
  sortOrder: z.number().int().default(0),
  archivedAt: z.string().datetime().nullable(),
  excludeFromNetWorth: z.boolean().default(false),
  creditLimitMinor: z.number().int().positive().nullable(),
  statementDay: z.number().int().min(1).max(31).nullable(),
  dueDay: z.number().int().min(1).max(31).nullable(),
  note: z.string().max(2000).nullable(),
})

export type Account = z.infer<typeof accountSchema>

export const loanTermsSchema = syncRowSchema.extend({
  accountId: z.string().uuid(),
  direction: z.enum(['borrowed', 'lent']),
  counterparty: z.string().max(120).nullable(),
  principalMinor: z.number().int().positive(),
  annualRateBps: z.number().int().min(0), // basis points; 0 = interest-free
  tenureMonths: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  emiMinor: z.number().int().positive().nullable(),
  paymentDay: z.number().int().min(1).max(31).nullable(),
  interestCategoryId: z.string().uuid().nullable(),
  rateType: z.enum(['reducing', 'flat']),
})

export type LoanTerms = z.infer<typeof loanTermsSchema>
