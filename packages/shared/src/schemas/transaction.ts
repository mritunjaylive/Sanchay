import { z } from 'zod'
import { syncRowSchema } from './sync.js'

export const transactionSchema = syncRowSchema.extend({
  type: z.enum(['income', 'expense', 'transfer', 'adjustment']),
  accountId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occurredTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  categoryId: z.string().uuid().nullable(),
  toAccountId: z.string().uuid().nullable(),
  toAmountMinor: z.number().int().positive().nullable(),
  payee: z.string().max(120).nullable(),
  note: z.string().max(2000).nullable(),
  paymentMethod: z.string().max(40).nullable(),
  fxRate: z.string().nullable(),
  baseAmountMinor: z.number().int(),
  recurringRuleId: z.string().uuid().nullable(),
  recurringOccurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  source: z.enum(['manual', 'recurring', 'import', 'loan_schedule']).default('manual'),
  adjustmentSign: z.enum(['+', '-']).nullable(),
}).superRefine((data, ctx) => {
  // transfer_shape: transfer iff toAccountId and toAmountMinor present
  if (data.type === 'transfer') {
    if (!data.toAccountId || !data.toAmountMinor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Transfer must have toAccountId and toAmountMinor',
      })
    }
  } else {
    if (data.toAccountId || data.toAmountMinor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Non-transfer cannot have toAccountId or toAmountMinor',
      })
    }
  }

  // category_shape: only income/expense have category
  if (!['income', 'expense'].includes(data.type) && data.categoryId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only income/expense transactions can have a categoryId',
    })
  }

  // adjustment_shape: adjustment iff adjustmentSign present
  if (data.type === 'adjustment' && !data.adjustmentSign) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Adjustment must have adjustmentSign',
    })
  }
  if (data.type !== 'adjustment' && data.adjustmentSign) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only adjustment can have adjustmentSign',
    })
  }
})

export type Transaction = z.infer<typeof transactionSchema>

export const transactionTagSchema = syncRowSchema.extend({
  transactionId: z.string().uuid(),
  tagId: z.string().uuid(),
})
export type TransactionTag = z.infer<typeof transactionTagSchema>

export const attachmentSchema = syncRowSchema.extend({
  transactionId: z.string().uuid(),
  storagePath: z.string().max(500),
  mimeType: z.enum(['image/webp', 'image/jpeg']),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  uploadState: z.enum(['pending', 'uploaded']).default('pending'),
})
export type Attachment = z.infer<typeof attachmentSchema>
