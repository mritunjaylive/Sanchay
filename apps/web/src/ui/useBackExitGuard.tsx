/**
 * ui/useBackExitGuard.tsx — Android PWA "Press back again to exit" guard (P1-G).
 *
 * Active only in standalone display mode on Android.
 * - On Home (/): arms sentinel. On first Back, shows toast "Press back again to exit".
 *   Second Back within 2s exits PWA natively.
 * - On other top-level tabs: Back navigates to Home (/) first.
 */

import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from './Toast'

export function isStandaloneAndroid(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const isAndroid = /android/i.test(navigator.userAgent)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // @ts-expect-error iOS Safari standalone fallback
    Boolean(navigator.standalone)
  return isAndroid && isStandalone
}

export function useBackExitGuard() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const lastBackPressTimeRef = useRef<number>(0)
  const armedRef = useRef<boolean>(false)

  useEffect(() => {
    if (!isStandaloneAndroid()) return

    const isHome = location.pathname === '/'

    if (isHome) {
      if (!location.state?.backGuard) {
        navigate('/', { state: { backGuard: true }, replace: false })
        armedRef.current = true
      }
    }

    const handlePopState = () => {
      if (location.pathname === '/' || window.location.pathname === '/') {
        const now = Date.now()
        if (now - lastBackPressTimeRef.current <= 2000) {
          return
        }

        lastBackPressTimeRef.current = now
        toast.info(t('common.pressBackAgainToExit', 'Press back again to exit'), { duration: 2000 })

        setTimeout(() => {
          if (window.location.pathname === '/') {
            navigate('/', { state: { backGuard: true }, replace: false })
          }
        }, 2100)
      } else {
        navigate('/', { replace: true })
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [location.pathname, location.state, navigate, t])
}
