/**
 * INJ and USDC prices in US dollars, read from Injective's oracle module.
 *
 * Injective keeps Pyth prices on chain. NinjaPay reads them by Pyth feed id
 * and treats a price older than MAX_PRICE_AGE_MS as unavailable instead of
 * showing a stale number. Prices are indicative and never decide how much
 * anyone is paid.
 *
 * Injective has no naira price feed, so NinjaPay shows no naira rate. One
 * will appear only when a licensed partner quotes it.
 *
 * Sources (checked 2026-09-30):
 * - Feed ids: https://docs.injective.network/developers-evm/oracle-precompile
 * - Route: PythPrice, GET /injective/oracle/v1beta1/pyth_price, in
 *   https://github.com/InjectiveLabs/sdk-go/blob/master/proto/injective/oracle/v1beta1/query.proto
 */

import { ENDPOINTS } from './injective/network'

export const PYTH_FEED_IDS = {
  INJ: '0x7a5bc1d2b56ad029048cd63964b3ad2776eadf812edc1a43a31406cb54bff592',
  USDC: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
} as const

export type PricedToken = keyof typeof PYTH_FEED_IDS

export type Price = { usd: number; publishedAt: Date }

/** A token is null when Injective has no fresh price for it. */
export type Prices = Record<PricedToken, Price | null>

export const NO_PRICES: Prices = { INJ: null, USDC: null }

/** An on-chain price older than this is not shown. */
export const MAX_PRICE_AGE_MS = 10 * 60_000

export const PRICE_REFRESH_MS = 60_000

type PythPriceResponse = {
  price_state?: { price_id?: string; publish_time?: string; price_state?: { price?: string } }
}

const sameFeed = (a: string, b: string) => a.replace(/^0x/i, '').toLowerCase() === b.replace(/^0x/i, '').toLowerCase()

const isFresh = (price: Price, now: Date) => now.getTime() - price.publishedAt.getTime() <= MAX_PRICE_AGE_MS

/** One Pyth price from Injective, or null if it is missing, malformed or stale. */
export async function fetchPythPrice(feedId: string, now: Date = new Date()): Promise<Price | null> {
  try {
    const response = await fetch(`${ENDPOINTS.rest}/injective/oracle/v1beta1/pyth_price?price_id=${feedId}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const { price_state: state } = (await response.json()) as PythPriceResponse
    if (!state?.price_id || !sameFeed(state.price_id, feedId)) return null
    const price = { usd: Number(state.price_state?.price), publishedAt: new Date(Number(state.publish_time) * 1000) }
    if (!Number.isFinite(price.usd) || price.usd <= 0 || Number.isNaN(price.publishedAt.getTime())) return null
    return isFresh(price, now) ? price : null
  } catch {
    return null
  }
}

// A failed refresh keeps the last price only while it is still fresh.
let lastGood: Prices = NO_PRICES

export async function fetchPrices(now: Date = new Date()): Promise<Prices> {
  const tokens = Object.keys(PYTH_FEED_IDS) as PricedToken[]
  const fetched = await Promise.all(tokens.map(token => fetchPythPrice(PYTH_FEED_IDS[token], now)))
  const prices = { ...NO_PRICES }
  tokens.forEach((token, i) => {
    const kept = lastGood[token]
    prices[token] = fetched[i] ?? (kept && isFresh(kept, now) ? kept : null)
  })
  lastGood = prices
  return prices
}

/** USD value of an amount of a token, or null when there is no fresh price for it. */
export function usdValue(amount: number, token: string, prices: Prices): number | null {
  const price = token in PYTH_FEED_IDS ? prices[token as PricedToken] : null
  return price ? amount * price.usd : null
}

/** Total of several USD values, or null if any of them is unknown. */
export function sumUsd(values: (number | null)[]): number | null {
  let total = 0
  for (const value of values) {
    if (value === null) return null
    total += value
  }
  return total
}

export function formatUsd(value: number | null, digits = 2): string {
  return value === null ? '—' : `$${value.toFixed(digits)}`
}
