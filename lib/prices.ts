/**
 * Shared INJ and USDC prices from CoinGecko's public API.
 *
 * Every price hook reads from here, so the app makes at most one request per
 * minute no matter how many components need prices. The keyless API rate-limits
 * aggressively, and its 429 responses carry no CORS headers, which browsers
 * report as a bare "Failed to fetch". On failure we back off and keep serving
 * the last good prices instead of logging an error per call.
 */

export type Prices = {
  /** USD per INJ, or null if never fetched successfully */
  injUsd: number | null
  /** USD per USDC, or null if never fetched successfully */
  usdcUsd: number | null
}

const PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=injective-protocol,usd-coin&vs_currencies=usd'
const FRESH_MS = 60_000
const BACKOFF_MS = 120_000

let cached: Prices = { injUsd: null, usdcUsd: null }
let fetchedAt = 0
let failedAt = 0
let inFlight: Promise<Prices> | null = null
let warned = false

export const PRICE_REFRESH_MS = FRESH_MS

export async function getPrices(): Promise<Prices> {
  const now = Date.now()
  if (now - fetchedAt < FRESH_MS || now - failedAt < BACKOFF_MS) return cached
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const response = await fetch(PRICE_URL)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      cached = {
        injUsd: typeof data['injective-protocol']?.usd === 'number' ? data['injective-protocol'].usd : cached.injUsd,
        usdcUsd: typeof data['usd-coin']?.usd === 'number' ? data['usd-coin'].usd : cached.usdcUsd,
      }
      fetchedAt = Date.now()
      warned = false
    } catch (error) {
      failedAt = Date.now()
      if (!warned) {
        console.warn('Price feed unavailable (CoinGecko rate limit or network); using last known prices.', error)
        warned = true
      }
    } finally {
      inFlight = null
    }
    return cached
  })()

  return inFlight
}
