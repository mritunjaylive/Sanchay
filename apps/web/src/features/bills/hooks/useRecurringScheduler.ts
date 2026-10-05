import { useEffect } from 'react'
import { recurringRepo } from '../../../db/repositories/recurringRepo'
import { useAuthStore } from '../../auth/stores/authStore'

/**
 * Automatically triggers recurring transaction materialization:
 * - On initial auth / mount
 * - On visibilitychange -> visible
 * - At local midnight
 * Works completely offline without requiring a network sync.
 */
export function useRecurringScheduler() {
  const userId = useAuthStore((s) => s.session?.user.id)

  useEffect(() => {
    if (!userId) return

    // 1. App start / auth change
    void recurringRepo.materializeDueOccurrences(userId)

    // 2. Window becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void recurringRepo.materializeDueOccurrences(userId)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // 3. Timer for local midnight
    let timerId: ReturnType<typeof setTimeout> | null = null

    const scheduleMidnight = () => {
      const now = new Date()
      const tomorrow = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        2
      )
      const msUntilMidnight = tomorrow.getTime() - now.getTime()

      timerId = setTimeout(() => {
        void recurringRepo.materializeDueOccurrences(userId)
        scheduleMidnight()
      }, msUntilMidnight)
    }

    scheduleMidnight()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (timerId !== null) {
        clearTimeout(timerId)
      }
    }
  }, [userId])
}
