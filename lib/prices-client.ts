type PriceEntry = Record<string, number>
type PriceResponse = Record<string, PriceEntry>

type CacheItem = {
  expiresAt: number
  data?: PriceResponse
  pending?: Promise<PriceResponse>
}

const TTL_MS = 60_000
const priceCache = new Map<string, CacheItem>()

function keyFor(ids: string, vsCurrencies: string): string {
  return `${ids}|${vsCurrencies}`
}

export async function getSimplePrice(ids: string, vsCurrencies = 'usd'): Promise<PriceResponse> {
  const cacheKey = keyFor(ids, vsCurrencies)
  const now = Date.now()
  const cached = priceCache.get(cacheKey)

  if (cached?.data && cached.expiresAt > now) {
    return cached.data
  }

  if (cached?.pending) {
    return cached.pending
  }

  const pending = (async () => {
    const res = await fetch(
      `/api/prices?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vsCurrencies)}`
    )
    const json = await res.json()
    const data: PriceResponse = json?.data || {}

    priceCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + TTL_MS,
    })

    return data
  })()

  priceCache.set(cacheKey, {
    data: cached?.data,
    expiresAt: cached?.expiresAt ?? 0,
    pending,
  })

  try {
    return await pending
  } finally {
    const settled = priceCache.get(cacheKey)
    if (settled?.pending) {
      priceCache.set(cacheKey, {
        data: settled.data,
        expiresAt: settled.expiresAt,
      })
    }
  }
}
