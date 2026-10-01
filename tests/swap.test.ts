import { afterEach, describe, expect, it, vi } from 'vitest'
import { findInjUsdcRoute, minReceived, oracleGap, roundToTick } from '@/lib/injective/swap'
import { USDC } from '@/lib/injective/tokens'

const MARKET = '0x' + 'ab'.repeat(32)
const WINJ = '0x' + '0e'.repeat(20)

const market = (extra: object = {}) => ({
  market_id: MARKET,
  base_denom: 'inj',
  quote_denom: USDC.denom.toLowerCase(), // the chain may write the erc20: address in either case
  taker_fee_rate: '0.001000000000000000',
  min_quantity_tick_size: '1000000000000000.000000000000000000',
  ...extra,
})

function stubChain({ markets = [market()], swapParams = { enabled: true, allowed_markets: [MARKET] } as object | null, pairs = [{ bank_denom: 'inj', erc20_address: WINJ }] } = {}) {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => {
    const path = new URL(String(input)).pathname
    const body =
      path === '/injective/exchange/v1beta1/spot/markets' ? { markets }
      : path === '/injective/exchange/v2/exchangeParams' ? { params: { swap_params: swapParams } }
      : path === '/injective/erc20/v1beta1/all_token_pairs' ? { token_pairs: pairs }
      : null
    return body ? new Response(JSON.stringify(body)) : new Response('{}', { status: 404 })
  }))
}

afterEach(() => vi.unstubAllGlobals())

describe('findInjUsdcRoute', () => {
  it('finds the allowlisted INJ/USDC market and INJ’s ERC20 address', async () => {
    stubChain()
    expect(await findInjUsdcRoute()).toEqual({
      ok: true,
      route: { marketId: MARKET, tokenIn: WINJ, quantityTick: BigInt('1000000000000000'), takerFeeRate: 0.001 },
    })
  })

  it('says why there is no quote', async () => {
    stubChain({ markets: [market({ quote_denom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7' })] })
    expect(await findInjUsdcRoute()).toEqual({ ok: false, reason: 'no-market' })
    stubChain({ swapParams: null }) // a chain without the swap module
    expect(await findInjUsdcRoute()).toEqual({ ok: false, reason: 'swaps-off' })
    stubChain({ swapParams: { enabled: true, allowed_markets: ['0x' + 'cd'.repeat(32)] } })
    expect(await findInjUsdcRoute()).toEqual({ ok: false, reason: 'not-allowlisted' })
    stubChain({ pairs: [] })
    expect(await findInjUsdcRoute()).toEqual({ ok: false, reason: 'no-token' })
  })

  it('throws when Injective cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    await expect(findInjUsdcRoute()).rejects.toThrow()
  })
})

describe('quote maths', () => {
  it('rounds the amount down to the quantity step', () => {
    const tick = BigInt('1000000000000000') // 0.001 INJ
    expect(roundToTick(BigInt('1234567890000000000'), tick)).toBe(BigInt('1234000000000000000'))
    expect(roundToTick(BigInt('999'), tick)).toBe(BigInt(0))
    expect(roundToTick(BigInt('999'), BigInt(1))).toBe(BigInt('999'))
  })

  it('applies slippage in whole base units, rounding down', () => {
    expect(minReceived(BigInt(12_345_678), 50)).toBe(BigInt(12_283_949))
    expect(minReceived(BigInt(1), 50)).toBe(BigInt(0))
  })

  it('measures the gap from the oracle price', () => {
    const oneInj = BigInt(10) ** BigInt(18)
    expect(oracleGap(oneInj, BigInt(20_000_000), 20, 1)).toBe(0)
    expect(oracleGap(oneInj, BigInt(19_000_000), 20, 1)).toBeCloseTo(0.05)
    expect(oracleGap(oneInj, BigInt(20_000_000), null, 1)).toBeNull()
  })
})
