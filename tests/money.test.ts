import { describe, expect, it } from 'vitest'
import { baseUnitsToNumber, formatBaseUnits, toChainAmount } from '@/lib/money'

describe('toChainAmount', () => {
  it('converts USDC amounts to 6-decimal base units', () => {
    expect(toChainAmount('1', 6)).toBe('1000000')
    expect(toChainAmount('1.5', 6)).toBe('1500000')
    expect(toChainAmount('0.000001', 6)).toBe('1')
    expect(toChainAmount('.5', 6)).toBe('500000')
  })

  it('converts INJ amounts to 18-decimal base units', () => {
    expect(toChainAmount('1', 18)).toBe('1000000000000000000')
    expect(toChainAmount('0.1', 18)).toBe('100000000000000000')
  })

  it('rejects more decimals than the token has instead of rounding', () => {
    expect(() => toChainAmount('0.0000001', 6)).toThrow('more than 6 decimal places')
  })

  it('rejects malformed input', () => {
    for (const bad of ['', '.', 'abc', '1,5', '-1', '1e6']) {
      expect(() => toChainAmount(bad, 6)).toThrow()
    }
  })
})

describe('formatBaseUnits', () => {
  it('formats 6-decimal USDC, not 18', () => {
    expect(formatBaseUnits('1500000', 6)).toBe('1.5')
    expect(formatBaseUnits('1', 6)).toBe('0.000001')
    expect(formatBaseUnits('0', 6)).toBe('0')
  })

  it('cuts extra digits instead of rounding up', () => {
    expect(formatBaseUnits('1999999', 6, 2)).toBe('1.99')
    expect(formatBaseUnits('123456789000000000000', 18, 4)).toBe('123.4567')
  })

  it('round-trips with toChainAmount', () => {
    for (const amount of ['0.000001', '12.34', '1000000']) {
      expect(formatBaseUnits(toChainAmount(amount, 6), 6)).toBe(amount)
    }
  })

  it('accepts bigint input', () => {
    expect(formatBaseUnits(BigInt(2500000), 6)).toBe('2.5')
  })
})

describe('baseUnitsToNumber', () => {
  it('returns a float for display maths', () => {
    expect(baseUnitsToNumber('2500000', 6)).toBe(2.5)
  })
})
