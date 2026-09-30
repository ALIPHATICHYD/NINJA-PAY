import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const NOW = new Date('2026-09-30T12:00:00Z')
const INJ_FEED = '0x7a5bc1d2b56ad029048cd63964b3ad2776eadf812edc1a43a31406cb54bff592'
const USDC_FEED = '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a'

const secondsAgo = (s: number) => String(Math.floor(NOW.getTime() / 1000) - s)

const pythState = (priceId: string, price: string, publishTime: string) => ({
  price_state: { price_id: priceId, publish_time: publishTime, price_state: { price, cumulative_price: '0', timestamp: publishTime } },
})

// Answers each feed from `feeds`; a missing feed gets a 404.
function stubChain(feeds: Record<string, unknown>) {
  const fetchMock = vi.fn<typeof fetch>(async input => {
    const id = new URL(String(input)).searchParams.get('price_id') ?? ''
    return id in feeds ? new Response(JSON.stringify(feeds[id])) : new Response('{"code":5}', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

let prices: typeof import('@/lib/prices')

beforeEach(async () => {
  vi.resetModules()
  prices = await import('@/lib/prices')
})

afterEach(() => vi.unstubAllGlobals())

describe('Pyth prices from Injective', () => {
  it('reads a fresh price from the oracle module by feed id', async () => {
    const fetchMock = stubChain({ [INJ_FEED]: pythState(INJ_FEED, '21.345000000000000000', secondsAgo(30)) })
    await expect(prices.fetchPythPrice(INJ_FEED, NOW)).resolves.toEqual({ usd: 21.345, publishedAt: new Date(NOW.getTime() - 30_000) })
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/injective/oracle/v1beta1/pyth_price?price_id=${INJ_FEED}`)
  })

  it('accepts the feed id back without 0x or in another case', async () => {
    stubChain({ [INJ_FEED]: pythState(INJ_FEED.slice(2).toUpperCase(), '21.3', secondsAgo(30)) })
    expect((await prices.fetchPythPrice(INJ_FEED, NOW))?.usd).toBe(21.3)
  })

  it('treats a price older than ten minutes as unavailable', async () => {
    stubChain({ [INJ_FEED]: pythState(INJ_FEED, '21.3', secondsAgo(11 * 60)) })
    await expect(prices.fetchPythPrice(INJ_FEED, NOW)).resolves.toBeNull()
  })

  it('returns null for a missing feed, another feed, a bad price, or no network', async () => {
    stubChain({})
    await expect(prices.fetchPythPrice(INJ_FEED, NOW)).resolves.toBeNull()

    stubChain({ [INJ_FEED]: pythState(USDC_FEED, '1', secondsAgo(30)) })
    await expect(prices.fetchPythPrice(INJ_FEED, NOW)).resolves.toBeNull()

    stubChain({ [INJ_FEED]: pythState(INJ_FEED, '0.000000000000000000', secondsAgo(30)) })
    await expect(prices.fetchPythPrice(INJ_FEED, NOW)).resolves.toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(prices.fetchPythPrice(INJ_FEED, NOW)).resolves.toBeNull()
  })

  it('keeps the last price through a failed refresh only while it is fresh', async () => {
    stubChain({
      [INJ_FEED]: pythState(INJ_FEED, '21.3', secondsAgo(0)),
      [USDC_FEED]: pythState(USDC_FEED, '0.9998', secondsAgo(0)),
    })
    const first = await prices.fetchPrices(NOW)
    expect(first.INJ?.usd).toBe(21.3)
    expect(first.USDC?.usd).toBe(0.9998)

    stubChain({ [USDC_FEED]: pythState(USDC_FEED, '0.9999', secondsAgo(0)) })
    const refreshed = await prices.fetchPrices(new Date(NOW.getTime() + 60_000))
    expect(refreshed.INJ?.usd).toBe(21.3)
    expect(refreshed.USDC?.usd).toBe(0.9999)

    const later = await prices.fetchPrices(new Date(NOW.getTime() + 11 * 60_000))
    expect(later.INJ).toBeNull()
  })
})

describe('USD values', () => {
  const known = { INJ: { usd: 20, publishedAt: NOW }, USDC: { usd: 1, publishedAt: NOW } }

  it('values priced tokens and returns null for anything without a fresh price', () => {
    expect(prices.usdValue(2, 'INJ', known)).toBe(40)
    expect(prices.usdValue(2, 'USDT', known)).toBeNull()
    expect(prices.usdValue(2, 'INJ', { ...known, INJ: null })).toBeNull()
  })

  it('does not total a set that includes an unknown value', () => {
    expect(prices.sumUsd([40, 1.5])).toBe(41.5)
    expect(prices.sumUsd([40, null])).toBeNull()
    expect(prices.formatUsd(null)).toBe('—')
    expect(prices.formatUsd(0.99981, 4)).toBe('$0.9998')
  })
})
