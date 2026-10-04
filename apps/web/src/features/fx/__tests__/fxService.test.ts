import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../../../db/db'
import { fxService } from '../services/fxService'

let mockSupabaseRows: Array<{ date: string; quote: string; rate_per_usd: number }> = []

interface MockQueryBuilder {
  select: () => MockQueryBuilder
  eq: (col: string, val: string) => MockQueryBuilder
  abortSignal: () => MockQueryBuilder
  order: () => MockQueryBuilder
  limit: () => MockQueryBuilder
  then: <TResult1 = unknown, TResult2 = never>(
    resolve?: ((value: { data: typeof mockSupabaseRows }) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>
}

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (_table: string) => {
      let quoteVal = ''
      let dateVal = ''
      const builder: MockQueryBuilder = {
        select: () => builder,
        eq: (col: string, val: string) => {
          if (col === 'quote') quoteVal = val
          if (col === 'date') dateVal = val
          return builder
        },
        abortSignal: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (resolve, reject) => {
          let matches = mockSupabaseRows
          if (quoteVal) matches = matches.filter((r) => r.quote === quoteVal)
          if (dateVal) matches = matches.filter((r) => r.date === dateVal)
          return Promise.resolve({ data: matches }).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

describe('fxService', () => {
  beforeEach(async () => {
    mockSupabaseRows = []
    await db.transaction('rw', [db.fxRates, db.accounts, db.transactions], async () => {
      await db.fxRates.clear()
      await db.accounts.clear()
      await db.transactions.clear()
    })
  })

  it('returns 1.0 for same currency conversion', async () => {
    const rate = await fxService.getRate('INR', 'INR')
    expect(rate).toBe(1.0)

    const res = await fxService.convert(10000, 'INR', 'INR')
    expect(res.baseAmountMinor).toBe(10000)
    expect(res.rateUsed).toBe('1')
  })

  it('converts correctly using cached USD rates', async () => {
    // 1 USD = 83.50 INR, 1 USD = 0.92 EUR
    await db.fxRates.bulkPut([
      { date: '2026-03-01', quote: 'INR', ratePerUsd: 83.5 },
      { date: '2026-03-01', quote: 'EUR', ratePerUsd: 0.92 },
    ])

    // Convert 10 USD (1000 cents) to INR (paise)
    const resUsdToInr = await fxService.convert(1000, 'USD', 'INR', '2026-03-01')
    expect(resUsdToInr.baseAmountMinor).toBe(83500) // 835.00 INR

    // Cross-rate EUR to INR: (83.5 / 0.92) ~ 90.760869...
    const resEurToInr = await fxService.convert(1000, 'EUR', 'INR', '2026-03-01')
    expect(resEurToInr.baseAmountMinor).toBeGreaterThan(90000)
  })

  it('fetches rate from Supabase fx_rates when not in local Dexie cache, and caches it', async () => {
    mockSupabaseRows = [{ date: '2026-03-01', quote: 'AED', rate_per_usd: 3.67 }]

    // AED not in Dexie
    const cachedBefore = await db.fxRates.where('quote').equals('AED').first()
    expect(cachedBefore).toBeUndefined()

    const rate = await fxService.getRate('USD', 'AED', '2026-03-01')
    expect(rate).toBe(3.67)

    // Now it should be cached in Dexie
    const cachedAfter = await db.fxRates.where('quote').equals('AED').first()
    expect(cachedAfter?.ratePerUsd).toBe(3.67)
  })

  it('falls back gracefully to 1.0 when rates are completely missing offline', async () => {
    // No rates cached for JPY or GBP, and Supabase returns empty
    const rate = await fxService.getRate('GBP', 'JPY')
    expect(rate).toBe(1.0)

    // JPY has 0 decimals, GBP has 2
    // 10 GBP (1000 pence) -> 10 JPY with 1.0 rate
    const res = await fxService.convert(1000, 'GBP', 'JPY')
    expect(res.baseAmountMinor).toBe(10) // 1000 * 10^(0-2) = 10
  })

  it('respects per-transaction manual exchange rate overrides', async () => {
    await db.fxRates.put({
      date: '2026-03-01',
      quote: 'EUR',
      ratePerUsd: 0.92,
    })

    // Manual rate override of 1.15
    const res = await fxService.convert(1000, 'USD', 'EUR', '2026-03-01', '1.15')
    expect(res.rateUsed).toBe('1.15')
    expect(res.baseAmountMinor).toBe(1150) // 10.00 USD * 1.15 = 11.50 EUR (1150 minor)
  })
})
