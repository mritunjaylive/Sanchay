import { create } from 'zustand'
import { db } from '../../../db/db'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@sanchay/shared'
import { profileRepo } from '../../../db/repositories/profileRepo'

async function getSupabase() {
  const { supabase } = await import('../../../lib/supabase')
  return supabase
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  error: string | null

  // Actions
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signInOffline: () => Promise<void>
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  signOutAll: () => Promise<void>
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
  error: null,

  initialize: async () => {
    try {
      // Check offline session first
      const offlineSessionStr = localStorage.getItem('sanchay_offline_session')
      if (offlineSessionStr) {
        try {
          const mockSession = JSON.parse(offlineSessionStr) as Session
          const profile = await profileRepo.getByUserId(mockSession.user.id)
          set({ session: mockSession, profile: profile ?? null, isLoading: false })
          return
        } catch {
          localStorage.removeItem('sanchay_offline_session')
        }
      }

      // Check if localStorage has any supabase auth keys before importing supabase
      const hasSupabaseAuth = Object.keys(localStorage).some(
        (key) => key.startsWith('sb-') && key.endsWith('-auth-token'),
      )

      if (!hasSupabaseAuth) {
        set({ session: null, profile: null, isLoading: false })
        return
      }

      const supabase = await getSupabase()
      // Get existing session
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const profile = await profileRepo.getByUserId(session.user.id)
        set({ session, profile: profile ?? null, isLoading: false })
      } else {
        set({ session: null, profile: null, isLoading: false })
      }

      // Subscribe to auth changes
      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const profile = await profileRepo.getByUserId(session.user.id)
          set({ session, profile: profile ?? null })
        } else if (!localStorage.getItem('sanchay_offline_session')) {
          set({ session: null, profile: null })
        }
      })
    } catch (e: unknown) {
      console.warn('Auth initialize error:', e)
      set({ session: null, profile: null, isLoading: false })
    }
  },

  signInOffline: async () => {
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
    set({ session: mockSession, profile: profile ?? null, isLoading: false, error: null })
  },

  signIn: async (email, password) => {
    set({ error: null })
    const supabase = await getSupabase()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      set({ error: error.message })
      return { error: error.message }
    }
    return { error: null }
  },

  signInWithEmail: async (email, password) => {
    return get().signIn(email, password)
  },

  signUp: async (email, password, displayName) => {
    set({ error: null })
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
      set({ error: error.message })
      return { error: error.message }
    }
    return { error: null }
  },

  signUpWithEmail: async (email, password, displayName) => {
    return get().signUp(email, password, displayName)
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
        emailRedirectTo: `${window.location.origin}/auth/verify-email`,
      },
    })
    if (error) return { error: error.message }
    return { error: null }
  },

  signOut: async () => {
    try {
      localStorage.removeItem('sanchay_offline_session')
      const supabase = await getSupabase()
      await supabase.auth.signOut()
    } finally {
      await db.wipeAll()
      set({ session: null, profile: null })
    }
  },

  signOutAll: async () => {
    try {
      localStorage.removeItem('sanchay_offline_session')
      const supabase = await getSupabase()
      await supabase.auth.signOut({ scope: 'global' })
    } finally {
      await db.wipeAll()
      set({ session: null, profile: null })
    }
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
      set({ session: null, profile: null })
      return { error: null }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { error: message }
    }
  },

  resetPassword: async (email) => {
    const supabase = await getSupabase()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
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

  // Expose for RequireAuth check
  _get: get,
}))
