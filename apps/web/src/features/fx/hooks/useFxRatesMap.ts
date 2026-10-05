/**
 * features/fx/hooks/useFxRatesMap.ts — Synchronous FX rate lookup from local Dexie cache.
 *
 * Implements P1-D item 1: synchronous lookup from local FX table for Net Worth & Home screens.
 * Falls back to 1.0 with hasRates flag so screens can show "rates unavailable" notice when offline.
 */

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../db/db'
import { convertFx } from '../../../lib/money'

export function useFxRatesMap() {
  const allRates = useLiveQuery(() => db.fxRates.toArray(), [], [])

  return useMemo(() => {
    const rateMap = new Map<string, number>()
    rateMap.set('USD', 1.0)

    // Sort ascending by date so latest rates win
    const sorted = [...(allRates ?? [])].sort((a, b) => a.date.localeCompare(b.date))
    for (const r of sorted) {
      rateMap.set(r.quote.toUpperCase(), r.ratePerUsd)
    }

    const hasRates = (allRates?.length ?? 0) > 0

    const getRateSync = (fromCurrency: string, toCurrency: string): number => {
      const from = fromCurrency.toUpperCase()
      const to = toCurrency.toUpperCase()
      if (from === to) return 1.0

      const fromPerUsd = rateMap.get(from)
      const toPerUsd = rateMap.get(to)

      if (fromPerUsd && toPerUsd && fromPerUsd > 0) {
        return toPerUsd / fromPerUsd
      }
      return 1.0
    }

    const convertToSync = (
      minor: number,
      fromCurrency: string,
      toCurrency: string,
    ): number => {
      if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
        return minor
      }
      const rate = getRateSync(fromCurrency, toCurrency)
      try {
        return convertFx(minor, fromCurrency, toCurrency, rate.toString())
      } catch {
        return minor
      }
    }

    return {
      getRateSync,
      convertToSync,
      hasRates,
      rateCount: allRates?.length ?? 0,
    }
  }, [allRates])
}
