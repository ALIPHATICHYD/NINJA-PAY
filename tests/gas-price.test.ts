import { afterEach, describe, expect, it, vi } from 'vitest'
import { FLOOR_FEE_MARKET, decimalToBigIntCeil, fetchFeeMarket, fetchGasPrice, gasPriceFor } from '@/lib/injective/gas-price'

const MIN = BigInt(160_000_000)
const REST = 'https://rest.test'

// Shapes as a local injectived (v1.20.3) answers them.
const params = (enabled: boolean, minGasPrice = '160000000.000000000000000000') => ({
  params: {
    max_gas_wanted_per_tx: '30000000',
    high_gas_tx_threshold: '25000000',
    min_gas_price_for_high_gas_tx: '0.000000000000000000',
    mempool1559_enabled: enabled,
    min_gas_price: minGasPrice,
  },
})
const baseFee = (value: string) => ({ base_fee: { base_fee: value } })

function serve(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const path = url.replace(REST, '')
    return path in routes
      ? new Response(JSON.stringify(routes[path]), { status: 200 })
      : new Response('{}', { status: 501 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('decimalToBigIntCeil', () => {
  it('reads chain decimals and rounds up any fraction', () => {
    expect(decimalToBigIntCeil('160000000.000000000000000000')).toBe(MIN)
    expect(decimalToBigIntCeil('160000000.000000000000000001')).toBe(MIN + BigInt(1))
    expect(decimalToBigIntCeil('42')).toBe(BigInt(42))
    expect(() => decimalToBigIntCeil('-1')).toThrow()
  })
})

describe('gasPriceFor', () => {
  it('pays the minimum while the adaptive fee market is off', () => {
    expect(gasPriceFor(FLOOR_FEE_MARKET)).toBe(MIN)
  })

  it('pays the base fee plus 12.5% when it is above the minimum', () => {
    expect(gasPriceFor({ ...FLOOR_FEE_MARKET, baseFee: BigInt(400_000_000) })).toBe(BigInt(450_000_000))
  })

  it('never pays less than the minimum', () => {
    expect(gasPriceFor({ ...FLOOR_FEE_MARKET, baseFee: BigInt(100_000_000) })).toBe(MIN)
  })

  it("applies the high-gas minimum only from the chain's threshold", () => {
    const market = { ...FLOOR_FEE_MARKET, minGasPriceForHighGas: BigInt(500_000_000) }
    expect(gasPriceFor(market, BigInt(24_999_999))).toBe(MIN)
    expect(gasPriceFor(market, BigInt(25_000_000))).toBe(BigInt(500_000_000))
  })
})

describe('fetchFeeMarket', () => {
  it("reads the minimum and skips the base fee while it's off", async () => {
    const fetchMock = serve({ '/injective/txfees/v1beta1/params': params(false, '320000000.000000000000000000') })
    await expect(fetchFeeMarket(REST)).resolves.toEqual({ ...FLOOR_FEE_MARKET, minGasPrice: BigInt(320_000_000) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reads the base fee when governance has turned it on', async () => {
    serve({
      '/injective/txfees/v1beta1/params': params(true),
      '/injective/txfees/v1beta1/cur_eip_base_fee': baseFee('240000000.500000000000000000'),
    })
    await expect(fetchFeeMarket(REST)).resolves.toMatchObject({ minGasPrice: MIN, baseFee: BigInt(240_000_001) })
  })
})

describe('fetchGasPrice', () => {
  it("falls back to the minimum when the chain can't be read, and lets the chain decide", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(fetchGasPrice()).resolves.toBe(MIN)
  })
})
