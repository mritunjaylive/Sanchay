import { z } from 'zod'
import { syncRowSchema } from './sync.js'

export const profileSchema = syncRowSchema.extend({
  displayName: z.string().max(80).nullable(),
  baseCurrency: z.string().length(3),
  locale: z.string().max(20),
  timeZone: z.string().max(60),
  weekStart: z.number().int().min(0).max(6),
  monthStartDay: z.number().int().min(1).max(28),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  accent: z.string().max(20).default('emerald'),
  defaultAccountId: z.string().uuid().nullable(),
  hideBalances: z.boolean().default(false),
  notificationPrefs: z.record(z.unknown()).nullable(),
  onboardedAt: z.string().datetime().nullable(),
})

export type Profile = z.infer<typeof profileSchema>
