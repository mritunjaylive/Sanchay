/**
 * lib/language.ts — Centralized app language helper.
 *
 * Updates:
 * - i18next instance
 * - localStorage['i18nextLng']
 * - document.documentElement.lang
 * - settingsStore.locale ('en-IN' | 'hi-IN')
 * - profileRepo.update(userId, { locale }) when signed in
 */

import i18n from '../i18n/i18n'
import { useSettingsStore } from '../features/settings/stores/settingsStore'
import { useAuthStore } from '../features/auth/stores/authStore'
import { profileRepo } from '../db/repositories/profileRepo'

export type SupportedLanguage = 'en' | 'hi'

export async function setAppLanguage(lang: SupportedLanguage): Promise<void> {
  // 1. Change i18n
  await i18n.changeLanguage(lang)

  // 2. Persist in localStorage
  localStorage.setItem('i18nextLng', lang)

  // 3. Set HTML lang attribute
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang
  }

  // 4. Update settingsStore locale
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN'
  useSettingsStore.getState().setLocale(locale)

  // 5. If user is signed in, sync to profile in local DB (which syncs to server)
  const session = useAuthStore.getState().session
  if (session?.user?.id) {
    try {
      await profileRepo.update(session.user.id, { locale })
    } catch (e) {
      console.warn('Failed to persist locale to profileRepo:', e)
    }
  }
}
