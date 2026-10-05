/**
 * lib/money.ts — Safe integer arithmetic for monetary amounts.
 *
 * Spec rule: "Integer minor units, no floats, deterministic rounding, auditable balances."
 * All amounts are stored as integer `number` in the minor unit of the currency.
 * Never use floating-point arithmetic on amounts. Never hardcode 100 as the exponent.
 *
 * @see Sanchay_spec.md section 8
 */

/** ISO 4217 currency exponents (decimal places). 0 = no minor units (JPY). */
const CURRENCY_EXPONENTS: Record<string, number> = {
  // Zero-decimal
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0,
  KRW: 0, MGA: 0, PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,

  // Three-decimal
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,

  // Default: 2 (INR, USD, EUR, GBP, etc.)
}

/** Get the number of decimal places (minor unit exponent) for a currency. */
export function getCurrencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency.toUpperCase()] ?? 2
}

/** Get the minor unit multiplier (e.g., 100 for INR, 1 for JPY, 1000 for KWD). */
export function getMinorUnitMultiplier(currency: string): number {
  return Math.pow(10, getCurrencyExponent(currency))
}

/** A typed money value — minor units + currency. */
export interface Money {
  minor: number
  currency: string
}

export function money(minor: number, currency: string): Money {
  return { minor, currency }
}

// ── BigInt Math Helpers ───────────────────────────────────────────────────

/**
 * Integer division with deterministic half-away-from-zero rounding:
 * e.g. 5 / 2 = 3, -5 / 2 = -3, 4 / 2 = 2, -4 / 2 = -2.
 */
export function divideBigIntHalfAway(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Division by zero')
  const isNeg = (numerator < 0n) !== (denominator < 0n)
  const absNum = numerator < 0n ? -numerator : numerator
  const absDen = denominator < 0n ? -denominator : denominator

  // Half-away-from-zero rounding: add floor(absDen / 2) before integer division
  const quotient = (absNum + (absDen / 2n)) / absDen
  return isNeg ? -quotient : quotient
}

/**
 * Parses a decimal string directly into a scaled integer (BigInt) with targetScale decimal digits.
 * No floating-point math is used.
 *
 * @example
 * parseDecimalToScaled("123.45", 2) // 12345n
 * parseDecimalToScaled("123.456", 2) // 12346n (rounded half-away-from-zero)
 */
export function parseDecimalToScaled(
  str: string,
  targetScale: number,
  decimalSep: '.' | ',' = '.',
): bigint {
  const trimmed = str.trim()
  if (!trimmed) throw new RangeError('Empty decimal string')

  const isNeg = trimmed.startsWith('-')
  const unsignedStr = isNeg || trimmed.startsWith('+') ? trimmed.slice(1).trim() : trimmed

  const parts = unsignedStr.split(decimalSep)
  if (parts.length > 2) {
    throw new RangeError(`Multiple decimal separators in "${str}"`)
  }

  const intPartStr = parts[0] || '0'
  const fracPartStr = parts[1] || ''

  if (!/^\d*$/.test(intPartStr) || !/^\d*$/.test(fracPartStr) || (intPartStr === '' && fracPartStr === '')) {
    throw new RangeError(`Cannot parse "${str}" as decimal`)
  }

  const intVal = BigInt(intPartStr || '0')
  const scaleMultiplier = 10n ** BigInt(targetScale)
  let scaledInt = intVal * scaleMultiplier

  if (targetScale === 0) {
    if (fracPartStr.length > 0) {
      const firstDigit = fracPartStr.charCodeAt(0) - 48
      if (firstDigit >= 5) {
        scaledInt += 1n
      }
    }
  } else if (fracPartStr.length <= targetScale) {
    const paddedFrac = fracPartStr.padEnd(targetScale, '0')
    scaledInt += BigInt(paddedFrac)
  } else {
    // Excess fractional digits: round half-away-from-zero
    const mainFrac = fracPartStr.slice(0, targetScale)
    const roundDigit = fracPartStr.charCodeAt(targetScale) - 48
    let fracVal = BigInt(mainFrac)
    if (roundDigit >= 5) {
      fracVal += 1n
    }
    scaledInt += fracVal
  }

  return isNeg ? -scaledInt : scaledInt
}

// ── Parsing ────────────────────────────────────────────────────────────────

/**
 * Parse a user-entered decimal string (in the given locale) to minor units.
 * Does NOT use floating-point arithmetic.
 *
 * @param input e.g. "1,234.56" (en) or "1.234,56" (de)
 * @param currency e.g. "INR"
 * @param decimalSeparator '.' or ','
 */
export function parseAmountToMinor(
  input: string,
  currency: string,
  decimalSeparator: '.' | ',' = '.',
): number {
  const cleaned = input.trim()
  if (!cleaned) throw new RangeError('Empty amount string')

  // If input contains math operators, delegate to safe expression parser
  if (/[+\-*/()]/.test(cleaned)) {
    return evaluateExpression(cleaned, currency, decimalSeparator)
  }

  const exp = getCurrencyExponent(currency)

  // Strip thousands separators
  const groupSep = decimalSeparator === '.' ? ',' : '.'
  const normalized = cleaned.replace(new RegExp(`\\${groupSep}`, 'g'), '')

  const scaledBigInt = parseDecimalToScaled(normalized, exp, decimalSeparator)
  return Number(scaledBigInt)
}

/**
 * Format minor units to a localized string (without currency symbol).
 * Decomposes integer units to avoid floating-point display drift.
 */
export function formatAmount(minor: number, currency: string, locale = 'en-IN'): string {
  const exp = getCurrencyExponent(currency)
  const isNeg = minor < 0
  const absMinor = Math.abs(minor)
  const multiplier = Math.pow(10, exp)
  const majorPart = Math.floor(absMinor / multiplier)
  const fracPart = absMinor % multiplier
  const fracStr = fracPart.toString().padStart(exp, '0')

  const formattedMajor = new Intl.NumberFormat(locale, {
    useGrouping: true,
  }).format(isNeg ? -majorPart : majorPart)

  if (exp === 0) {
    return formattedMajor
  }

  // Obtain the locale's decimal separator
  const sampleParts = new Intl.NumberFormat(locale).formatToParts(1.1)
  const decimalSep = sampleParts.find((p) => p.type === 'decimal')?.value ?? '.'

  return `${formattedMajor}${decimalSep}${fracStr}`
}

/**
 * Format minor units directly to an unadorned decimal string (e.g. for input fields),
 * without thousands separators or currency symbols. Pure integer math, no float drift.
 */
export function minorToDecimalString(minor: number, currency: string): string {
  const exp = getCurrencyExponent(currency)
  const isNeg = minor < 0
  const absMinor = Math.abs(minor)
  if (exp === 0) {
    return `${isNeg ? '-' : ''}${absMinor}`
  }
  const multiplier = Math.pow(10, exp)
  const majorPart = Math.floor(absMinor / multiplier)
  const fracPart = absMinor % multiplier
  const fracStr = fracPart.toString().padStart(exp, '0')
  return `${isNeg ? '-' : ''}${majorPart}.${fracStr}`
}

/**
 * Format as full currency string including symbol.
 */
export function formatMoney(minor: number, currency: string, locale = 'en-IN'): string {
  const exp = getCurrencyExponent(currency)
  const value = minor / Math.pow(10, exp)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  }).format(value)
}

// ── Arithmetic ─────────────────────────────────────────────────────────────

/** Add two amounts of the same currency. */
export function addMinor(a: number, b: number): number {
  return a + b
}

/** Subtract b from a (same currency). */
export function subtractMinor(a: number, b: number): number {
  return a - b
}

/**
 * Multiply minor units by a decimal rate (e.g. FX rate).
 * Rounding: half-away-from-zero (spec rule 4).
 */
export function multiplyMinor(minor: number, rate: number, targetExp: number, sourceExp: number): number {
  // Convert rate string to scaled integer for pure decimal math
  const rateStr = rate.toString()
  const RATE_SCALE = 12
  const rateScaled = parseDecimalToScaled(rateStr, RATE_SCALE, '.')
  const numerator = BigInt(minor) * rateScaled * (10n ** BigInt(targetExp))
  const denominator = (10n ** BigInt(sourceExp)) * (10n ** BigInt(RATE_SCALE))
  return Number(divideBigIntHalfAway(numerator, denominator))
}

/**
 * Rounding: half-away-from-zero (spec rule 4).
 * E.g. 2.5 → 3, -2.5 → -3.
 */
export function roundHalfAwayFromZero(n: number): number {
  return n >= 0 ? Math.round(n) : -Math.round(-n)
}

// ── FX conversion ──────────────────────────────────────────────────────────

/**
 * Convert an amount from one currency to another using a decimal rate string.
 * Uses pure BigInt decimal arithmetic with 10^12 scale.
 * rate = units of `toCurrency` per 1 unit of `fromCurrency`.
 *
 * @param amountMinor amount in source currency minor units
 * @param rateString decimal string, e.g. "83.123456"
 * @param fromCurrency source currency
 * @param toCurrency target currency
 */
export function convertMinor(
  amountMinor: number,
  rateString: string,
  fromCurrency: string,
  toCurrency: string,
): number {
  return convertFx(amountMinor, fromCurrency, toCurrency, rateString)
}

/**
 * Convert an amount in minor units from one currency to another using an FX rate string.
 * Rate is expressed as: 1 fromCurrency = rate toCurrency.
 * Handles exponent differences between currencies without float precision drift.
 */
export function convertFx(
  amountMinor: number,
  fromCurrency: string,
  toCurrency: string,
  rateStr: string,
): number {
  const fromExp = getCurrencyExponent(fromCurrency)
  const toExp = getCurrencyExponent(toCurrency)

  // Scale rate to 12 decimal places
  const RATE_SCALE = 12
  const rateScaled = parseDecimalToScaled(rateStr, RATE_SCALE, '.')
  if (rateScaled <= 0n) {
    throw new RangeError(`Invalid FX rate: "${rateStr}"`)
  }

  // Formula: toMinor = (amountMinor * rateScaled * 10^toExp) / (10^fromExp * 10^RATE_SCALE)
  const numerator = BigInt(amountMinor) * rateScaled * (10n ** BigInt(toExp))
  const denominator = (10n ** BigInt(fromExp)) * (10n ** BigInt(RATE_SCALE))

  return Number(divideBigIntHalfAway(numerator, denominator))
}

// ── Safe expression evaluator ──────────────────────────────────────────────

/**
 * Scale factor for calculator expressions (8 decimal places = 10^8).
 * Guarantees exact operations without IEEE 754 precision drift (e.g. 0.1 + 0.2 = 0.30).
 */
const EXPR_SCALE = 8
const EXPR_SCALE_MUL = 100_000_000n

/**
 * Evaluate an arithmetic expression entered in the amount field using scaled integer arithmetic.
 * Supports: digits, +, -, *, /, (, ), decimal point, spaces.
 * NO eval() — uses recursive-descent parser.
 * Returns the result in minor units.
 *
 * @example
 * evaluateExpression("0.1 + 0.2", "INR") // 30 (0.30 INR in paise)
 * evaluateExpression("250 + 40 * 2", "INR") // 33000 (330.00 INR in paise)
 */
export function evaluateExpression(expr: string, currency: string, decimalSep: '.' | ',' = '.'): number {
  const cleaned = expr.trim()
  if (!cleaned) throw new Error('Empty expression')

  const tokens = tokenize(cleaned)
  let pos = 0

  function peek(): string | undefined { return tokens[pos] }
  function consume(): string {
    const t = tokens[pos++]
    if (t === undefined) throw new Error('Unexpected end of expression')
    return t
  }

  function parseExpr(): bigint { return parseAddSub() }

  function parseAddSub(): bigint {
    let left = parseMulDiv()
    while (peek() === '+' || peek() === '-') {
      const op = consume()
      const right = parseMulDiv()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function parseMulDiv(): bigint {
    let left = parseUnary()
    while (peek() === '*' || peek() === '/') {
      const op = consume()
      const right = parseUnary()
      if (op === '/') {
        if (right === 0n) throw new Error('Division by zero')
        left = divideBigIntHalfAway(left * EXPR_SCALE_MUL, right)
      } else {
        left = divideBigIntHalfAway(left * right, EXPR_SCALE_MUL)
      }
    }
    return left
  }

  function parseUnary(): bigint {
    if (peek() === '-') { consume(); return -parseAtom() }
    if (peek() === '+') { consume(); return parseAtom() }
    return parseAtom()
  }

  function parseAtom(): bigint {
    if (peek() === '(') {
      consume()
      const val = parseExpr()
      if (peek() !== ')') throw new Error('Missing closing parenthesis')
      consume()
      return val
    }
    const t = consume()
    try {
      return parseDecimalToScaled(t, EXPR_SCALE, decimalSep)
    } catch {
      throw new Error(`Invalid token: "${t}"`)
    }
  }

  const resultScaled = parseExpr()
  if (pos < tokens.length) throw new Error(`Unexpected token: "${tokens[pos] ?? ''}"`)

  // Convert scaled result (10^8) to currency exponent (10^exp)
  const exp = getCurrencyExponent(currency)
  const diffExp = EXPR_SCALE - exp
  const minorBigInt = divideBigIntHalfAway(resultScaled, 10n ** BigInt(diffExp))

  return Number(minorBigInt)
}

function tokenize(expr: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]!
    if (/\s/.test(ch)) { i++; continue }
    if ('+-*/()'.includes(ch)) { tokens.push(ch); i++; continue }
    if (/[\d.,]/.test(ch)) {
      let num = ''
      while (i < expr.length && /[\d.,]/.test(expr[i]!)) {
        num += expr[i]!
        i++
      }
      tokens.push(num)
      continue
    }
    throw new Error(`Invalid character: "${ch}"`)
  }
  return tokens
}
