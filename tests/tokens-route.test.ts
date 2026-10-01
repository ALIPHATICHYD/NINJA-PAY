import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A verified-list entry as Injective's token list writes it.
const LIST = [{ denom: 'peggy0xusdt', symbol: 'USDT', name: 'Tether', decimals: 6, tokenVerification: 'verified' }]

const loadRoute = async () => {
  vi.resetModules()
  return import('@/app/api/tokens/route')
}
const tokensFrom = async (response: Response) => ((await response.json()) as { tokens: unknown[] }).tokens

describe('/api/tokens', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }) })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('waits a minute after a failed read before downloading again', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('timed out'))
    vi.stubGlobal('fetch', fetchMock)
    const { GET, RETRY_MS } = await loadRoute()

    expect(await tokensFrom(await GET())).toEqual([])
    expect(await tokensFrom(await GET())).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValue(new Response(JSON.stringify(LIST)))
    vi.setSystemTime(Date.now() + RETRY_MS + 1)
    expect(await tokensFrom(await GET())).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shares one download between requests that arrive together', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(LIST)))
    vi.stubGlobal('fetch', fetchMock)
    const { GET } = await loadRoute()

    const [a, b] = await Promise.all([GET(), GET()])
    expect(await tokensFrom(a)).toHaveLength(1)
    expect(await tokensFrom(b)).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
