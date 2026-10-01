import { afterEach, describe, expect, it, vi } from 'vitest'
import { labelDenom, tokenMap, verifiedTokens } from '@/lib/injective/token-list'
import { formatCoin, pricedAs, withTokenNames, type ActivityItem } from '@/lib/injective/activity'
import { INJ, USDC, LEGACY_PEGGY_USDC_DENOM } from '@/lib/injective/tokens'

// Entries as they appear in Injective's mainnet list (fields trimmed).
const PEGGY_INJ = { denom: 'peggy0xe28b3b32b6c345a34ff64674606124dd5aceca30', symbol: 'INJ', name: 'Injective', decimals: 18, tokenVerification: 'verified' }
const USDC_NOBLE = { denom: 'ibc/2CBC2EA121AE42563B08028466F37B600F2D7D4282342DE938283CC3FB2BC00E', symbol: 'USDCnb', name: 'USD Coin (Legacy)', decimals: 6, tokenVerification: 'verified' }
const FAKE_USDC = { denom: 'factory/inj14ejqjyq8um4p3xfqj74yld5waqljf88f9eneuk/inj10dctm5qkm722pgazwq0wy9lxnzh8mlnnv9mr65', symbol: 'USDC', name: 'USD Coin (PoS) (Wormhole)', decimals: 6, tokenVerification: 'unverified' }
const RENAMED = { denom: '2024election', symbol: '2024ELECTION', overrideSymbol: 'TRUMPWIN', decimals: 6, tokenVerification: 'verified' }

const LIST = [PEGGY_INJ, USDC_NOBLE, FAKE_USDC, RENAMED]

describe('verifiedTokens', () => {
  it('keeps verified entries only, with the override symbol', () => {
    expect(verifiedTokens(LIST).map(t => t.symbol)).toEqual(['INJ', 'USDCnb', 'TRUMPWIN'])
    expect(verifiedTokens(LIST)[2]).toEqual({ denom: '2024election', symbol: 'TRUMPWIN', name: 'TRUMPWIN', decimals: 6 })
  })

  it('shortens a symbol that is a whole denom', () => {
    const denom = 'erc20:0xD8F3573F6dC7bedD4C5246F2aAe90df47854A229' // as in the testnet list
    const [token] = verifiedTokens([{ denom, symbol: denom, decimals: 18, tokenVerification: 'verified' }])
    expect(token).toEqual({ denom, symbol: 'erc20:0xD8…', name: 'erc20:0xD8…', decimals: 18 })
  })

  it('skips malformed entries', () => {
    const bad = [
      null,
      { ...USDC_NOBLE, decimals: '6' },
      { ...USDC_NOBLE, decimals: -1 },
      { ...USDC_NOBLE, decimals: 6.5 },
      { ...USDC_NOBLE, denom: '' },
      { ...USDC_NOBLE, symbol: '  ' },
    ]
    expect(verifiedTokens(bad)).toEqual([])
    expect(verifiedTokens({ tokens: LIST })).toEqual([])
  })
})

describe('labelDenom', () => {
  const list = tokenMap(verifiedTokens(LIST))

  it('names INJ and USDC by their exact denoms, in either case', () => {
    expect(labelDenom('inj', list)).toEqual({ token: 'INJ', decimals: 18, verified: true })
    expect(labelDenom(USDC.denom.toLowerCase(), list)).toEqual({ token: 'USDC', decimals: 6, verified: true })
  })

  it('names other denoms from the verified list', () => {
    expect(labelDenom(USDC_NOBLE.denom, list)).toEqual({ token: 'USDCnb', decimals: 6, verified: true })
    expect(labelDenom(USDC_NOBLE.denom.toLowerCase(), list).token).toBe('USDCnb')
  })

  it('never calls a listed token INJ or USDC on another denom', () => {
    expect(labelDenom(PEGGY_INJ.denom, list)).toEqual({ token: 'INJ · peggy0xe28…', decimals: 18, verified: true })
    const lookalikes = tokenMap(verifiedTokens([{ ...USDC_NOBLE, symbol: 'u.s.d.c' }]))
    expect(labelDenom(USDC_NOBLE.denom, lookalikes).token).toBe('u.s.d.c · ibc/2CBC2E…')
  })

  it('shows an unverified denom as its short denom in base units', () => {
    expect(labelDenom(FAKE_USDC.denom, list)).toEqual({ token: 'factory/in…', decimals: 0, verified: false })
    expect(labelDenom(USDC_NOBLE.denom)).toEqual({ token: 'ibc/2CBC2E…', decimals: 0, verified: false })
  })

  it('keeps the legacy Polygon USDC.e apart from USDC', () => {
    expect(labelDenom(LEGACY_PEGGY_USDC_DENOM, list)).toEqual({ token: 'USDC.e (legacy)', decimals: 6, verified: true })
  })
})

describe('activity coins', () => {
  const item = (denom: string, amountBase: string): ActivityItem => ({
    hash: 'AB',
    timestamp: new Date(0),
    type: 'receive',
    direction: 'in',
    counterparty: 'inj1sender',
    coins: [{ denom, amountBase, ...labelDenom(denom) }],
    success: true,
  })

  it('names coins once the list loads', () => {
    const [named] = withTokenNames([item(USDC_NOBLE.denom, '2500000')], tokenMap(verifiedTokens(LIST)))
    expect(formatCoin(named.coins[0])).toBe('2.5 USDCnb')
    expect(formatCoin(item(FAKE_USDC.denom, '2500000').coins[0])).toBe('2500000 factory/in… (unverified)')
  })

  it('prices coins by denom, never by name', () => {
    const [named] = withTokenNames([item(PEGGY_INJ.denom, '1')], tokenMap(verifiedTokens(LIST)))
    expect(pricedAs(named.coins[0])).toBeNull()
    expect(pricedAs({ ...named.coins[0], token: 'INJ' })).toBeNull()
    expect(pricedAs(item(INJ.denom, '1').coins[0])).toBe('INJ')
    expect(pricedAs(item(USDC.denom.toLowerCase(), '1').coins[0])).toBe('USDC')
  })
})

describe('/api/tokens', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  const get = async () => (await import('@/app/api/tokens/route')).GET()

  it('returns the verified tokens, cached for an hour', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(LIST)))
    vi.stubGlobal('fetch', fetchMock)
    const response = await get()
    expect(response.headers.get('cache-control')).toContain('s-maxage=3600')
    expect((await response.json()).tokens.map((t: { symbol: string }) => t.symbol)).toEqual(['INJ', 'USDCnb', 'TRUMPWIN'])
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/injective-lists\/master\/json\/tokens\/(testnet|mainnet)\.json$/)
  })

  it('returns an empty list it does not cache when the list cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    const response = await get()
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ tokens: [] })
  })
})
