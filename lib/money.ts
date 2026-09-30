/**
 * Exact conversions between human-readable amounts ("1.5") and a token's base
 * units ("1500000" for 6 decimals). String and bigint only: no floating point
 * touches an amount that gets signed.
 */

/**
 * "1.5" -> "1500000" (6 decimals). Throws on malformed input, and on more
 * decimal places than the token supports instead of silently truncating.
 */
export function toChainAmount(amount: string, decimals: number = 18): string {
  const trimmed = amount.trim()
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '' || trimmed === '.') {
    throw new Error(`Invalid amount "${amount}"`)
  }
  const [wholePart = '', fracPart = ''] = trimmed.split('.')
  if (fracPart.length > decimals) {
    throw new Error(`Amount has more than ${decimals} decimal places`)
  }
  const result = (wholePart + fracPart.padEnd(decimals, '0')).replace(/^0+(?=\d)/, '')
  return result === '' ? '0' : result
}

/**
 * "1500000" (6 decimals) -> "1.5". Extra fraction digits beyond
 * `maxFractionDigits` are cut, never rounded up, so a displayed balance is
 * never more than the real one.
 */
export function formatBaseUnits(base: string | bigint, decimals: number, maxFractionDigits = decimals): string {
  const value = BigInt(base)
  const negative = value < BigInt(0)
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0')
  const whole = decimals === 0 ? digits : digits.slice(0, digits.length - decimals)
  const frac = decimals === 0 ? '' : digits.slice(digits.length - decimals).slice(0, maxFractionDigits).replace(/0+$/, '')
  return `${negative ? '-' : ''}${frac ? `${whole}.${frac}` : whole}`
}

/** Base units as a float, for charts and USD estimates only. Never sign with this. */
export function baseUnitsToNumber(base: string | bigint, decimals: number): number {
  return Number(formatBaseUnits(base, decimals))
}
