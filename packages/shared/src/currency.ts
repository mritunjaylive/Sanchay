/**
 * Currency utility: exponent (decimal places) per ISO 4217.
 * The full list is maintained here to avoid depending on Intl for server-side edge functions.
 */

export const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  // Zero-decimal currencies
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0,
  KRW: 0, MGA: 0, PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0,
  XAF: 0, XOF: 0, XPF: 0,

  // Three-decimal currencies
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,

  // All others default to 2 (the function below handles that)
}

/** Returns the number of decimal places for the given ISO 4217 currency code. */
export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency.toUpperCase()] ?? 2
}

/** Returns 10^exponent — the multiplier between major and minor units. */
export function minorUnitMultiplier(currency: string): number {
  return Math.pow(10, currencyExponent(currency))
}

/** Typed Money value. Minor = integer in the currency's smallest unit. */
export interface Money {
  minor: number
  currency: string
}
