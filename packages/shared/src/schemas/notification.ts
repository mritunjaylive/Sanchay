import { z } from 'zod'
import { syncRowSchema } from './sync.js'

export const notificationSchema = syncRowSchema.extend({
  kind: z.string().max(40),
  title: z.string().max(120),
  body: z.string().max(500),
  payload: z.record(z.unknown()).nullable(),
  readAt: z.string().datetime().nullable(),
  dedupeKey: z.string().max(200), // unique per user, prevents duplicate reminders
})
export type Notification = z.infer<typeof notificationSchema>
