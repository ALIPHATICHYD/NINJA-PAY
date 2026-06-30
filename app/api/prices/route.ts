import { NextResponse } from 'next/server'

type PricePayload = Record<string, Record<string, number>>

type CacheEntry = {
  expiresAt: number
  data: PricePayload
  pending?: Promise<PricePayload>
}

const CACHE_TTL_MS = 5 * 60 * 1000
const FALLBACK_TTL_MS = 5 * 60 * 1000

declare global {
  // eslint-disable-next-line no-var
  var __ninjapayPriceCache: Map<string, CacheEntry> | undefined
}

const cache = globalThis.__ninjapayPriceCache ?? new Map<string, CacheEntry>()
globalThis.__ninjapayPriceCache = cache

function getFallback(ids: string): PricePayload {
  const fallback: PricePayload = {
    'usd-coin': { usd: 1 },
    'injective-protocol': { usd: 0 },
  }

  const out: PricePayload = {}
  for (const id of ids.split(',').map(value => value.trim()).filter(Boolean)) {
    out[id] = fallback[id] || { usd: 0 }
  }
  return out
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const ids = url.searchParams.get('ids') || 'injective-protocol'
    const vs = url.searchParams.get('vs_currencies') || 'usd'
    const cacheKey = `${ids}|${vs}`
    const now = Date.now()

    const cached = cache.get(cacheKey)
    if (cached && cached.data && cached.expiresAt > now) {
      return NextResponse.json({ data: cached.data }, {
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
        },
      })
    }

    if (cached?.pending) {
      const data = await cached.pending
      return NextResponse.json({ data }, {
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
        },
      })
    }

    const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
      ids
    )}&vs_currencies=${encodeURIComponent(vs)}`

    const pending = (async (): Promise<PricePayload> => {
      try {
        const res = await fetch(apiUrl)
        if (res.ok) {
          const data = (await res.json()) as PricePayload
          cache.set(cacheKey, {
            data,
            expiresAt: Date.now() + CACHE_TTL_MS,
          })
          return data
        }
        if (res.status !== 429) {
          console.warn('CoinGecko upstream non-ok', res.status)
        }
      } catch (upErr) {
        console.warn('CoinGecko fetch failed:', String(upErr))
      }

      const data = getFallback(ids)
      cache.set(cacheKey, {
        data,
        expiresAt: Date.now() + FALLBACK_TTL_MS,
      })
      return data
    })()

    cache.set(cacheKey, {
      data: cached?.data ?? getFallback(ids),
      expiresAt: cached?.expiresAt ?? 0,
      pending,
    })

    const data = await pending
    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
  }
}
