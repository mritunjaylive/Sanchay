import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  parseAmountToMinor,
  formatAmount,
  formatMoney,
  evaluateExpression,
  convertFx,
  convertMinor,
  getCurrencyExponent,
  roundHalfAwayFromZero,
  divideBigIntHalfAway,
} from '../../lib/money'

describe('lib/money — Integer Minor Unit Arithmetic (No Float Drift)', () => {
  describe('Currency Exponents', () => {
    it('returns 0 for JPY, 2 for INR/USD, 3 for KWD', () => {
      expect(getCurrencyExponent('JPY')).toBe(0)
      expect(getCurrencyExponent('INR')).toBe(2)
      expect(getCurrencyExponent('USD')).toBe(2)
      expect(getCurrencyExponent('KWD')).toBe(3)
    })
  })

  describe('Table-driven Parse & Format Round Trip', () => {
    const tableCases = [
      { currency: 'INR', exp: 2, formatted: '1,234.56', minor: 123456 },
      { currency: 'INR', exp: 2, formatted: '0.05', minor: 5 },
      { currency: 'INR', exp: 2, formatted: '100.00', minor: 10000 },
      { currency: 'JPY', exp: 0, formatted: '500', minor: 500 },
      { currency: 'JPY', exp: 0, formatted: '12,500', minor: 12500 },
      { currency: 'KWD', exp: 3, formatted: '1.250', minor: 1250 },
      { currency: 'KWD', exp: 3, formatted: '0.005', minor: 5 },
      { currency: 'KWD', exp: 3, formatted: '123.456', minor: 123456 },
    ]

    for (const { currency, formatted, minor } of tableCases) {
      it(`parses ${formatted} ${currency} to ${minor} minor units and formats back`, () => {
        const parsed = parseAmountToMinor(formatted, currency)
        expect(parsed).toBe(minor)
        const back = formatAmount(parsed, currency, 'en-US')
        expect(back).toBe(formatted)
      })
    }
  })

  describe('Calculator Expression Precision (0.1 + 0.2 = 0.30)', () => {
    it('evaluates "0.1 + 0.2" to exactly 30 paise (0.30 INR) without IEEE 754 drift', () => {
      // In standard float JS: 0.1 + 0.2 = 0.30000000000000004
      const resultMinor = evaluateExpression('0.1 + 0.2', 'INR')
      expect(resultMinor).toBe(30) // Exactly 30 paise
    })

    it('evaluates complex operations with scaled integers', () => {
      expect(evaluateExpression('250 + 40 * 2', 'INR')).toBe(33000)
      expect(evaluateExpression('(100 + 50) / 2', 'INR')).toBe(7500)
      expect(evaluateExpression('10.55 - 0.55', 'INR')).toBe(1000)
    })

    it('throws on division by zero', () => {
      expect(() => evaluateExpression('100 / 0', 'INR')).toThrow('Division by zero')
    })
  })

  describe('Half-Away-From-Zero Rounding', () => {
    it('rounds positive and negative midpoints away from zero', () => {
      // Positive
      expect(roundHalfAwayFromZero(2.5)).toBe(3)
      expect(roundHalfAwayFromZero(2.49)).toBe(2)
      expect(roundHalfAwayFromZero(2.51)).toBe(3)

      // Negative
      expect(roundHalfAwayFromZero(-2.5)).toBe(-3)
      expect(roundHalfAwayFromZero(-2.49)).toBe(-2)
      expect(roundHalfAwayFromZero(-2.51)).toBe(-3)
    })

    it('BigInt division half-away-from-zero matches rounding rules', () => {
      expect(divideBigIntHalfAway(5n, 2n)).toBe(3n)
      expect(divideBigIntHalfAway(-5n, 2n)).toBe(-3n)
      expect(divideBigIntHalfAway(4n, 2n)).toBe(2n)
      expect(divideBigIntHalfAway(-4n, 2n)).toBe(-2n)
    })
  })

  describe('High Precision & Large Amounts', () => {
    it('maintains full precision for very large amounts (> 100 billion)', () => {
      // 150,000,000,000.50 INR = 15,000,000,000,050 minor
      const largeStr = '150000000000.50'
      const minor = parseAmountToMinor(largeStr, 'INR')
      expect(minor).toBe(15000000000050)
      const formatted = formatAmount(minor, 'INR', 'en-US')
      expect(formatted).toBe('150,000,000,000.50')
    })
  })

  describe('FX Conversion (convertFx & convertMinor)', () => {
    it('converts USD to INR using scaled integer decimal arithmetic', () => {
      // 100 USD (10000 minor) at 84.50 INR/USD = 845000 minor (8450.00 INR)
      const inrMinor = convertFx(10000, 'USD', 'INR', '84.50')
      expect(inrMinor).toBe(845000)
    })

    it('converts across different currency exponents (USD 2 to JPY 0 and KWD 3)', () => {
      // 100 USD (10000 minor) to JPY at 155.25 JPY/USD = 15525 JPY
      const jpyMinor = convertFx(10000, 'USD', 'JPY', '155.25')
      expect(jpyMinor).toBe(15525)

      // 1000 USD (100000 minor) to KWD at 0.3075 KWD/USD = 307.500 KWD (307500 minor)
      const kwdMinor = convertFx(100000, 'USD', 'KWD', '0.3075')
      expect(kwdMinor).toBe(307500)
    })
  })

  describe('Property-Based Testing with fast-check', () => {
    it('round-trips formatAmount and parseAmountToMinor for random valid minor amounts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10_000_000_000 }),
          fc.constantFrom('INR', 'USD', 'EUR'),
          (minor, currency) => {
            const formatted = formatAmount(minor, currency, 'en-US')
            const parsed = parseAmountToMinor(formatted, currency)
            return parsed === minor
          },
        ),
        { numRuns: 100 },
      )
    })

    it('round-trips formatAmount and parseAmountToMinor for JPY (zero-decimal)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000_000 }),
          (minor) => {
            const formatted = formatAmount(minor, 'JPY', 'en-US')
            const parsed = parseAmountToMinor(formatted, 'JPY')
            return parsed === minor
          },
        ),
        { numRuns: 50 },
      )
    })

    it('round-trips formatAmount and parseAmountToMinor for KWD (three-decimal)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10_000_000_000 }),
          (minor) => {
            const formatted = formatAmount(minor, 'KWD', 'en-US')
            const parsed = parseAmountToMinor(formatted, 'KWD')
            return parsed === minor
          },
        ),
        { numRuns: 50 },
      )
    })

    it('FX conversion matches reference BigInt ratio calculation across random inputs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10_000_000 }),
          fc.integer({ min: 100, max: 100_000 }), // Rate as integer bps (e.g. 8450 for 84.50)
          (amountMinor, rateInt) => {
            const rateStr = (rateInt / 100).toFixed(2)
            const result = convertFx(amountMinor, 'USD', 'INR', rateStr)

            // Reference BigInt computation
            const expected = Number(
              divideBigIntHalfAway(
                BigInt(amountMinor) * BigInt(rateInt) * 100n,
                10000n,
              ),
            )
            return result === expected
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
