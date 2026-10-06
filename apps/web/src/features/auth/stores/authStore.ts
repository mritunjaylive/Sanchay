/**
 * features/auth/stores/authStore.ts
 *
 * P0-A: Auth reliability fixes
 * - initialize() always registers onAuthStateChange (idempotent guard)
 * - Detects auth params in URL to avoid skipping supabase import
 * - signIn() synchronously sets session, clears offline session, hydrates profile
 * - isSubmitting flag separate from isLoading
 * - resendConfirmation() helper
 * - Typed error codes for SignInScreen to map to translations
 * - signInOffline only available in non-prod
 * - signOut safety (no data wipe if outbox has pending rows)
 *
 * P0-B: Profile hydration
 * - hydrationStatus: 'idle' | 'loading' | 'ready'
 * - hydrateProfile(userId) — local → remote single fetch → pullOnce → new user
 * - Per-user localStorage onboarded hint (sanchay_onboarded_<userId>)
 * - Dexie liveQuery subscription keeps store.profile in sync with local DB
 */

import { create } from 'zustand'
import { db } from '../../../db/db'
import type { Session, AuthError } from '@supabase/supabase-js'
import type { Profile } from '@sanchay/shared'
import { profileRepo } from '../../../db/repositories/profileRepo'

// Module-level guard so React StrictMode double-invoke can't register two listeners
let _listenerRegistered = false
let _unsubscribe: (() => void) | null = null
let _liveQueryUnsubscribe: (() => void) | null = null

async function getSupabase() {
  const { supabase } = await import('../../../lib/supabase')
  return supabase
}

/** Check if the URL contains auth-related query/hash params */
function urlHasAuthParams(): boolean {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const authKeys = ['code', 'access_token', 'refresh_token', 'error', 'error_description', 'type']
  return authKeys.some((k) => search.has(k) || hash.has(k))
}

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'network'
  | 'rate_limited'
  | 'unknown'

function classifyAuthError(err: AuthError | null): AuthErrorCode {
  if (!err) return 'unknown'
  const msg = err.message.toLowerCase()
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) return 'invalid_credentials'
  if (msg.includes('email not confirmed') || msg.includes('confirm')) return 'email_not_confirmed'
  if (msg.includes('too many') || err.status === 429) return 'rate_limited'
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')) return 'network'
  return 'unknown'
}

/** `ok: false` means nothing was done because unsynced local changes would be lost. */
export interface SignOutResult {
  ok: boolean
  pending: number
}

export interface SignOutOptions {
  /** Sign out even though some local changes could not be synced (they are lost). */
  discardUnsynced?: boolean
}

/** Tries a final sync and returns how many outbox rows are still unsynced. */
async function flushPendingChanges(): Promise<number> {
  try {
    const { syncEngine } = await import('../../../features/sync/services/syncEngine')
    return await syncEngine.flush(8000)
  } catch {
    return db.outbox.count().catch(() => 0)
  }
}

export interface AuthSignInResult {
  error: AuthErrorCode | null
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  isSubmitting: boolean
  hydrationStatus: 'idle' | 'loading' | 'ready'
  error: string | null

  // Actions
  initialize: () => Promise<void>
  hydrateProfile: (userId: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<AuthSignInResult>
  signInWithEmail: (email: string, password: string) => Promise<AuthSignInResult>
  signInOffline: () => Promise<void>
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  resendConfirmation: (email: string) => Promise<{ error: string | null }>
  signOut: (opts?: SignOutOptions) => Promise<SignOutResult>
  signOutAll: (opts?: SignOutOptions) => Promise<SignOutResult>
  deleteAccount: () => Promise<{ error: string | null }>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  setProfile: (profile: Profile) => void
  updateUserProfile: (displayName: string, avatarUrl?: string | null) => Promise<{ error: string | null }>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: true,
  isSubmitting: false,
  hydrationStatus: 'idle',
  error: null,

  initialize: async () => {
    // Guard against double-invoke (React StrictMode)
    if (_listenerRegistered) {
      return
    }

    try {
      // In production, skip offline session entirely
      if (!import.meta.env.PROD) {
        const offlineSessionStr = localStorage.getItem('sanchay_offline_session')
        if (offlineSessionStr) {
          try {
            const mockSession = JSON.parse(offlineSessionStr) as Session
            const profile = await profileRepo.getByUserId(mockSession.user.id)
            set({ session: mockSession, profile: profile ?? null, isLoading: false, hydrationStatus: 'ready' })
            _listenerRegistered = true
            return
          } catch {
            localStorage.removeItem('sanchay_offline_session')
          }
        }
      }

      // Decide whether to import Supabase:
      // skip only when there's no sb-* key AND no auth params in URL
      const hasSupabaseAuth = Object.keys(localStorage).some(
        (key) => key.startsWith('sb-') && key.endsWith('-auth-token'),
      )
      const hasAuthParams = urlHasAuthParams()

      if (!hasSupabaseAuth && !hasAuthParams) {
        set({ session: null, profile: null, isLoading: false, hydrationStatus: 'ready' })
        _listenerRegistered = true
        return
      }

      const supabase = await getSupabase()

      // Register listener FIRST before reading session to avoid race
      _listenerRegistered = true
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
          // Clear in-memory state but don't wipe DB here (signOut() does that)
          set({ session: null, profile: null, hydrationStatus: 'ready' })
          if (_liveQueryUnsubscribe) {
            _liveQueryUnsubscribe()
            _liveQueryUnsubscribe = null
          }
          return
        }

        if (event === 'PASSWORD_RECOVERY') {
          set({ session })
          return
        }

        if (session?.user) {
          set({ session })

          // Subscribe liveQuery for this user to keep profile in sync with Dexie
          if (_liveQueryUnsubscribe) {
            _liveQueryUnsubscribe()
            _liveQueryUnsubscribe = null
          }
          const { liveQuery } = await import('dexie')
          const observable = liveQuery(() => profileRepo.getByUserId(session.user.id))
          const sub = observable.subscribe({
            next: (profile) => {
              set({ profile: profile ?? null })
            },
          })
          _liveQueryUnsubscribe = () => sub.unsubscribe()

          // Hydrate profile if not already done
          if (get().hydrationStatus !== 'ready') {
            await get().hydrateProfile(session.user.id)
          }

          // Trigger sync on sign-in/token refresh
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            import('../../../features/sync/services/syncEngine').then(({ syncEngine }) => {
              void syncEngine.triggerSync(true)
            }).catch(() => { /* sync is optional */ })
          }
        }
      })
      _unsubscribe = () => subscription.unsubscribe()

      // Now read the current session
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        set({ session })
        await get().hydrateProfile(session.user.id)

        // Subscribe liveQuery
        if (_liveQueryUnsubscribe) {
          _liveQueryUnsubscribe()
          _liveQueryUnsubscribe = null
        }
        const { liveQuery } = await import('dexie')
        const observable = liveQuery(() => profileRepo.getByUserId(session.user.id))
        const sub = observable.subscribe({
          next: (profile) => {
            set({ profile: profile ?? null })
          },
        })
        _liveQueryUnsubscribe = () => sub.unsubscribe()
      } else {
        set({ session: null, profile: null, isLoading: false, hydrationStatus: 'ready' })
      }
    } catch (e: unknown) {
      console.warn('Auth initialize error:', e)
      set({ session: null, profile: null, isLoading: false, hydrationStatus: 'ready' })
    }
  },

  hydrateProfile: async (userId: string) => {
    set({ hydrationStatus: 'loading' })
    try {
      // Step 1: check local DB first
      const local = await profileRepo.getByUserId(userId)
      if (local) {
        // Apply locale from profile
        if (local.locale) {
          const lang = local.locale.startsWith('hi') ? 'hi' : 'en'
          const { default: i18n } = await import('../../../i18n/i18n')
          await i18n.changeLanguage(lang)
          document.documentElement.lang = lang
        }
        set({ profile: local, isLoading: false, hydrationStatus: 'ready' })
        localStorage.setItem(`sanchay_onboarded_${userId}`, '1')
        return
      }

      // Step 2: not local — try remote fetch if online
      if (navigator.onLine) {
        try {
          const supabase = await getSupabase()
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle()

          if (data) {
            // Map snake_case → camelCase and put without outbox entry
            const mapped: Profile = {
              id: (data as Record<string, unknown>)['id'] as string,
              userId: (data as Record<string, unknown>)['user_id'] as string,
              displayName: (data as Record<string, unknown>)['display_name'] as string | null,
              baseCurrency: ((data as Record<string, unknown>)['base_currency'] as string) ?? 'INR',
              locale: ((data as Record<string, unknown>)['locale'] as string) ?? 'en-IN',
              timeZone: ((data as Record<string, unknown>)['time_zone'] as string) ?? 'Asia/Kolkata',
              theme: (((data as Record<string, unknown>)['theme'] as string) as 'light' | 'dark' | 'system') ?? 'system',
              accent: ((data as Record<string, unknown>)['accent'] as string) ?? 'emerald',
              defaultAccountId: (data as Record<string, unknown>)['default_account_id'] as string | null,
              hideBalances: Boolean((data as Record<string, unknown>)['hide_balances']),
              weekStart: ((data as Record<string, unknown>)['week_start'] as number) ?? 1,
              monthStartDay: ((data as Record<string, unknown>)['month_start_day'] as number) ?? 1,
              onboardedAt: (data as Record<string, unknown>)['onboarded_at'] as string | null,
              notificationPrefs: ((data as Record<string, unknown>)['notification_prefs'] as Record<string, unknown>) ?? {},
              createdAt: (data as Record<string, unknown>)['created_at'] as string,
              updatedAt: (data as Record<string, unknown>)['updated_at'] as string,
              deletedAt: (data as Record<string, unknown>)['deleted_at'] as string | null,
              serverSeq: (data as Record<string, unknown>)['server_seq'] as number | null,
              version: ((data as Record<string, unknown>)['version'] as number) ?? 1,
            }
            // Put WITHOUT outbox entry — this is a read from server
            await db.profiles.put(mapped)
            if (mapped.locale) {
              const lang = mapped.locale.startsWith('hi') ? 'hi' : 'en'
              const { default: i18n } = await import('../../../i18n/i18n')
              await i18n.changeLanguage(lang)
              document.documentElement.lang = lang
            }
            set({ profile: mapped, isLoading: false, hydrationStatus: 'ready' })
            if (mapped.onboardedAt) {
              localStorage.setItem(`sanchay_onboarded_${userId}`, '1')
            }
            return
          }
        } catch {
          // Remote fetch failed, continue
        }

        // Step 3: trigger a pull sync with timeout
        try {
          const { syncEngine } = await import('../../../features/sync/services/syncEngine')
          await Promise.race([
            syncEngine.pullOnce(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
          ])
          const afterPull = await profileRepo.getByUserId(userId)
          if (afterPull) {
            set({ profile: afterPull, isLoading: false, hydrationStatus: 'ready' })
            if (afterPull.onboardedAt) {
              localStorage.setItem(`sanchay_onboarded_${userId}`, '1')
            }
            return
          }
        } catch {
          // Sync failed or timed out
        }
      }

      // Step 4: new user or offline with no data — mark ready with null profile
      set({ profile: null, isLoading: false, hydrationStatus: 'ready' })
    } catch (e: unknown) {
      console.warn('hydrateProfile error:', e)
      set({ profile: null, isLoading: false, hydrationStatus: 'ready' })
    }
  },

  signInOffline: async () => {
    if (import.meta.env.PROD) return // Not available in production

    const offlineUserId = '00000000-0000-0000-0000-000000000001'
    const mockSession = {
      access_token: 'offline_token',
      token_type: 'bearer',
      expires_in: 999999999,
      refresh_token: 'offline_refresh',
      user: {
        id: offlineUserId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'offline@sanchay.local',
        email_confirmed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        app_metadata: { provider: 'email' },
        user_metadata: { display_name: 'Demo User' },
      },
    } as unknown as Session

    try {
      localStorage.setItem('sanchay_offline_session', JSON.stringify(mockSession))
    } catch {
      // Ignore storage errors
    }

    const profile = await profileRepo.getByUserId(offlineUserId)
    set({ session: mockSession, profile: profile ?? null, isLoading: false, hydrationStatus: 'ready', error: null })
  },

  signIn: async (email, password) => {
    set({ error: null, isSubmitting: true })
    try {
      const supabase = await getSupabase()
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        const code = classifyAuthError(error)
        set({ error: error.message, isSubmitting: false })
        return { error: code }
      }

      // Synchronously set session and clear offline session
      localStorage.removeItem('sanchay_offline_session')
      set({ session: data.session })

      // Hydrate profile before resolving
      if (data.session?.user?.id) {
        await get().hydrateProfile(data.session.user.id)
      }

      set({ isSubmitting: false })
      return { error: null }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      set({ error: msg, isSubmitting: false })
      return { error: 'network' }
    }
  },

  signInWithEmail: async (email, password) => {
    return get().signIn(email, password)
  },

  signUp: async (email, password, displayName) => {
    set({ error: null, isSubmitting: true })
    try {
      const supabase = await getSupabase()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/verify-email`,
          ...(displayName ? { data: { display_name: displayName } } : {}),
        },
      })
      if (error) {
        set({ error: error.message, isSubmitting: false })
        return { error: error.message }
      }
      set({ isSubmitting: false })
      return { error: null }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to sign up'
      set({ error: msg, isSubmitting: false })
      return { error: msg }
    }
  },

  signUpWithEmail: async (email, password, displayName) => {
    return get().signUp(email, password, displayName)
  },

  resendConfirmation: async (email) => {
    try {
      const supabase = await getSupabase()
      const { error } = await supabase.auth.resend({ type: 'signup', email })
      if (error) return { error: error.message }
      return { error: null }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Failed to resend' }
    }
  },

  clearError: () => {
    set({ error: null })
  },

  signInWithGoogle: async () => {
    const supabase = await getSupabase()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) return { error: error.message }
    return { error: null }
  },

  signInWithMagicLink: async (email) => {
    const supabase = await getSupabase()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) return { error: error.message }
    return { error: null }
  },

  signOut: async (opts) => {
    const userId = get().session?.user?.id

    // Safety: never wipe local data that has not reached the server unless explicitly told to.
    if (!opts?.discardUnsynced) {
      const pending = await flushPendingChanges()
      if (pending > 0) return { ok: false, pending }
    }

    try {
      localStorage.removeItem('sanchay_offline_session')
      if (userId) {
        localStorage.removeItem(`sanchay_onboarded_${userId}`)
      }
      if (_unsubscribe) {
        _unsubscribe()
        _unsubscribe = null
      }
      if (_liveQueryUnsubscribe) {
        _liveQueryUnsubscribe()
        _liveQueryUnsubscribe = null
      }
      _listenerRegistered = false

      const supabase = await getSupabase()
      await supabase.auth.signOut()
    } finally {
      await db.wipeAll()
      set({ session: null, profile: null, hydrationStatus: 'ready' })
    }
    return { ok: true, pending: 0 }
  },

  signOutAll: async (opts) => {
    const userId = get().session?.user?.id

    if (!opts?.discardUnsynced) {
      const pending = await flushPendingChanges()
      if (pending > 0) return { ok: false, pending }
    }

    try {
      localStorage.removeItem('sanchay_offline_session')
      if (userId) {
        localStorage.removeItem(`sanchay_onboarded_${userId}`)
      }
      if (_unsubscribe) {
        _unsubscribe()
        _unsubscribe = null
      }
      if (_liveQueryUnsubscribe) {
        _liveQueryUnsubscribe()
        _liveQueryUnsubscribe = null
      }
      _listenerRegistered = false

      const supabase = await getSupabase()
      await supabase.auth.signOut({ scope: 'global' })
    } finally {
      await db.wipeAll()
      set({ session: null, profile: null, hydrationStatus: 'ready' })
    }
    return { ok: true, pending: 0 }
  },

  deleteAccount: async () => {
    const { session } = get()
    if (!session?.access_token) return { error: 'Not authenticated' }

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}))
        return { error: (errJson as { error?: string }).error || 'Failed to delete account' }
      }

      await db.wipeAll()
      const supabase = await getSupabase()
      await supabase.auth.signOut()
      set({ session: null, profile: null, hydrationStatus: 'ready' })
      return { error: null }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { error: message }
    }
  },

  resetPassword: async (email) => {
    const supabase = await getSupabase()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    })
    if (error) return { error: error.message }
    return { error: null }
  },

  setProfile: (profile) => {
    set({ profile })
  },

  updateUserProfile: async (displayName, avatarUrl) => {
    try {
      const { session } = get()
      const userId = session?.user?.id
      if (!userId) return { error: 'Not authenticated' }

      // 1. Update local IndexedDB profile
      const updatedProfile = await profileRepo.update(userId, { displayName })

      // 2. Cache avatar locally
      if (avatarUrl !== undefined) {
        if (avatarUrl) {
          localStorage.setItem(`sanchay_user_avatar_${userId}`, avatarUrl)
        } else {
          localStorage.removeItem(`sanchay_user_avatar_${userId}`)
        }
      }

      // 3. Update Supabase Auth user metadata if available
      try {
        const supabase = await getSupabase()
        const metaUpdate: Record<string, unknown> = { full_name: displayName }
        if (avatarUrl !== undefined) {
          metaUpdate['avatar_url'] = avatarUrl
        }
        await supabase.auth.updateUser({ data: metaUpdate })
      } catch {
        // Ignore Supabase connection / offline failures
      }

      // 4. Update in-memory session and profile
      if (session?.user) {
        const updatedUser = {
          ...session.user,
          user_metadata: {
            ...session.user.user_metadata,
            full_name: displayName,
            ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
          },
        }
        set({
          profile: updatedProfile,
          session: { ...session, user: updatedUser },
        })
      } else {
        set({ profile: updatedProfile })
      }

      return { error: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile'
      return { error: msg }
    }
  },
}))
