/**
 * features/fx/services/fxService.ts — Foreign exchange rate service and conversion engine.
 *
 * Rate sourcing (spec section 8.5, 11.2):
 *   1. Per-transaction manual override (highest priority)
 *   2. Local Dexie `fxRates` cache (seeded by the `fx-refresh` Edge Function)
 *   3. Supabase `fx_rates` table (falls back when local cache is empty)
 *   4. 1.0 rate (offline fallback — never makes third-party network calls)
 *
 * NO direct calls to open.er-api.com, frankfurter.app, or any other
 * third-party FX endpoint from the client. All external rate fetching goes
 * through the server-side `fx-refresh` Edge Function which writes into
 * `fx_rates`. This keeps the CSP connect-src restricted to the app origin
 * and Supabase only.
 *
 * @see Sanchay_spec.md section 8.5, 8.6, 11.2
 * @see FIX_PROMPTS.md Prompt 13 Task B
 */

import { db } from '../../../db/db'
import { convertFx } from '../../../lib/money'
import { upsertWithOutbox } from '../../../db/outboxHelper'
import { budgetRepo } from '../../../db/repositories/budgetRepo'
import type { Transaction } from '@sanchay/shared'

export interface ConversionResult {
  baseAmountMinor: number
  rateUsed: string
}

export const fxService = {
  /**
   * Retrieves exchange rate between two currencies for a specific date (or most recent).
   * Returns rate multiplier: 1 unit of fromCurrency = result units of toCurrency.
   *
   * Rate is sourced from:
   *   1. Local Dexie fxRates cache (seeded by fx-refresh Edge Function)
   *   2. Supabase fx_rates table (no third-party calls ever)
   *   3. 1.0 (offline fallback)
   */
  async getRate(fromCurrency: string, toCurrency: string, dateStr?: string): Promise<number> {
    const from = fromCurrency.toUpperCase()
    const to = toCurrency.toUpperCase()

    if (from === to) {
      return 1.0
    }

    // 1. If USD is involved
    if (from === 'USD') {
      const rate = await this.getRatePerUsd(to, dateStr)
      return rate ?? 1.0
    }

    if (to === 'USD') {
      const fromPerUsd = await this.getRatePerUsd(from, dateStr)
      return fromPerUsd && fromPerUsd > 0 ? 1.0 / fromPerUsd : 1.0
    }

    // 2. Cross-rate via USD
    const fromRate = await this.getRatePerUsd(from, dateStr)
    const toRate = await this.getRatePerUsd(to, dateStr)

    if (fromRate && toRate && fromRate > 0) {
      return toRate / fromRate
    }

    return 1.0
  },

  /**
   * Retrieves rate per USD from local Dexie cache, then falls back to
   * the Supabase `fx_rates` table (written by the server-side fx-refresh
   * Edge Function). Never makes third-party network calls.
   */
  async getRatePerUsd(quote: string, dateStr?: string): Promise<number | null> {
    const upperQuote = quote.toUpperCase()
    if (upperQuote === 'USD') return 1.0

    // 1. Try exact date match from local Dexie cache
    if (dateStr) {
      const exact = await db.fxRates.where('[date+quote]').equals([dateStr, upperQuote]).first()
      if (exact) return exact.ratePerUsd
    }

    // 2. Fall back to most recent available rate from local Dexie cache
    const latest = await db.fxRates
      .where('quote')
      .equals(upperQuote)
      .reverse()
      .sortBy('date')

    if (latest.length > 0 && latest[0]?.ratePerUsd) {
      return latest[0].ratePerUsd
    }

    // 3. Not in local cache: query the server-side fx_rates table via Supabase.
    //    This table is populated by the fx-refresh Edge Function — no direct
    //    calls to third-party APIs are ever made from the browser.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return null
    }

    try {
      const { supabase } = await import('../../../lib/supabase')
      const abortController = new AbortController()
      const timeoutId = setTimeout(() => abortController.abort(), 1000)

      try {
        const query = supabase
          .from('fx_rates')
          .select('date, quote, rate_per_usd')
          .eq('quote', upperQuote)
          .abortSignal(abortController.signal)

        if (dateStr) {
          query.eq('date', dateStr)
        } else {
          query.order('date', { ascending: false }).limit(1)
        }

        const { data } = await query
        if (data && data.length > 0 && data[0]?.rate_per_usd) {
          const rate = Number(data[0].rate_per_usd)
          // Cache locally for future offline access
          await db.fxRates.put({
            date: data[0].date,
            quote: data[0].quote,
            ratePerUsd: rate,
          })
          return rate
        }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch {
      // Offline or Supabase error — fall through to return null
    }

    // 4. No rate available — caller uses 1.0 offline fallback
    return null
  },

  /**
   * Converts an amount in minor units from one currency to another using safe decimal arithmetic.
   * Spec 8.5 formula. Respects per-transaction manual override.
   */
  async convert(
    amountMinor: number,
    fromCurrency: string,
    toCurrency: string,
    dateStr?: string,
    manualRateStr?: string,
  ): Promise<ConversionResult> {
    const from = fromCurrency.toUpperCase()
    const to = toCurrency.toUpperCase()

    if (from === to) {
      return { baseAmountMinor: amountMinor, rateUsed: '1' }
    }

    let rateUsed = '1'

    if (manualRateStr && manualRateStr.trim() !== '' && manualRateStr !== '1') {
      // Manual override always wins
      rateUsed = manualRateStr.trim()
    } else {
      const rate = await this.getRate(from, to, dateStr)
      // toFixed avoids exponent notation (e.g. "1e-7"), which the decimal parser rejects.
      rateUsed = rate.toFixed(12).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
    }

    const baseAmountMinor = convertFx(amountMinor, from, to, rateUsed)
    return { baseAmountMinor, rateUsed }
  },

  /**
   * Background migration job when the user changes base currency.
   * Recomputes base_amount_minor for all existing transactions.
   * Spec section 8.6.
   */
  async recomputeAllBaseAmounts(
    newBaseCurrency: string,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<number> {
    const transactions = await db.transactions.filter((tx) => !tx.deletedAt).toArray()
    const total = transactions.length
    if (total === 0) return 0

    let processed = 0
    const BATCH_SIZE = 50

    const accounts = await db.accounts.toArray()
    const accountCurrencyMap = new Map(accounts.map((a) => [a.id, a.currency]))

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE)

      for (const tx of batch) {
        const txCurrency = accountCurrencyMap.get(tx.accountId) ?? newBaseCurrency
        const { baseAmountMinor, rateUsed } = await this.convert(
          tx.amountMinor,
          txCurrency,
          newBaseCurrency,
          tx.occurredOn,
          tx.fxRate && tx.fxRate !== '1' ? tx.fxRate : undefined,
        )

        const now = new Date().toISOString()
        const updated: Transaction = {
          ...tx,
          baseAmountMinor,
          fxRate: rateUsed,
          updatedAt: now,
          version: (tx.version ?? 1) + 1,
        }

        await upsertWithOutbox(db.transactions, 'transactions', updated)
        processed++
      }

      onProgress?.(processed, total)
    }

    return processed
  },

  /**
   * Converts existing budget amounts when the base currency changes.
   * Budgets are stored in base currency.
   */
  async convertAllBudgets(oldBaseCurrency: string, newBaseCurrency: string): Promise<void> {
    if (oldBaseCurrency.toUpperCase() === newBaseCurrency.toUpperCase()) return

    const rate = await this.getRate(oldBaseCurrency, newBaseCurrency)
    const budgets = await budgetRepo.getAll()

    for (const b of budgets) {
      const { baseAmountMinor } = await this.convert(
        b.amountMinor,
        oldBaseCurrency,
        newBaseCurrency,
        undefined,
        rate.toString(),
      )

      await budgetRepo.update(b.id, {
        amountMinor: baseAmountMinor,
      })
    }
  },
}
