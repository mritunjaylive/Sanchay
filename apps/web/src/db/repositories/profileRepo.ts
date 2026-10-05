/**
 * db/repositories/profileRepo.ts — User profile repository.
 *
 * P0-B: Critical fix — profile.id MUST equal userId.
 * The previous code used uuidv7() for new profiles, which violated the
 * server FK constraint (profiles.id references auth.users.id), causing
 * remote inserts to fail and the onboarding loop.
 *
 * All writes go through this repository and record an outbox entry.
 *
 * @see Sanchay_spec.md section 7.2, 7.5
 */

import { db } from '../db'
import { upsertWithOutbox } from '../outboxHelper'
import type { Profile } from '@sanchay/shared'

export const profileRepo = {
  async getByUserId(userId: string): Promise<Profile | undefined> {
    return db.profiles.where('userId').equals(userId).first()
  },

  async upsert(profile: Profile): Promise<Profile> {
    await upsertWithOutbox(db.profiles, 'profiles', profile)
    return profile
  },

  async update(userId: string, patch: Partial<Omit<Profile, 'id' | 'userId' | 'createdAt' | 'serverSeq'>>): Promise<Profile> {
    const existing = await this.getByUserId(userId)
    const now = new Date().toISOString()

    const updated: Profile = {
      ...(existing ?? {
        // P0-B: id MUST equal userId (references auth.users.id)
        id: userId,
        userId,
        displayName: null,
        baseCurrency: 'INR',
        locale: 'en-IN',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
        theme: 'system',
        accent: 'emerald',
        defaultAccountId: null,
        hideBalances: false,
        weekStart: 1,
        monthStartDay: 1,
        onboardedAt: null,
        notificationPrefs: {},
        createdAt: now,
        deletedAt: null,
        serverSeq: null,
        version: 1,
      }),
      ...patch,
      updatedAt: now,
      version: existing ? (existing.version ?? 1) + 1 : 1,
    }

    await upsertWithOutbox(db.profiles, 'profiles', updated)
    return updated
  },

  async completeOnboarding(userId: string): Promise<Profile> {
    return this.update(userId, {
      onboardedAt: new Date().toISOString(),
    })
  },
}
