/**
 * ui/useBackClose.ts — Closes overlays on hardware/browser Back button (P1-G).
 *
 * When an overlay opens, pushes a history state sentinel.
 * When user hits Back (popstate), closes the overlay instead of navigating away.
 */

import { useEffect, useRef } from 'react'

export function useBackClose(isOpen: boolean, onClose: () => void) {
  const isPushedRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      if (isPushedRef.current) {
        isPushedRef.current = false
        if (window.history.state?.overlayCloseSentinel) {
          window.history.back()
        }
      }
      return
    }

    // Modal just opened: push history sentinel
    window.history.pushState({ ...window.history.state, overlayCloseSentinel: true }, '')
    isPushedRef.current = true

    const handlePopState = () => {
      if (isPushedRef.current) {
        isPushedRef.current = false
        onClose()
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isOpen, onClose])
}
