import { IndexerGrpcSpotApi } from '@injectivelabs/sdk-ts'
import { getNetworkEndpoints } from '@injectivelabs/networks'
import { NETWORK, MARKETS } from './constants'

const endpoints = getNetworkEndpoints(NETWORK)
const spotApi = new IndexerGrpcSpotApi(endpoints.indexer)

/**
 * Fetch live INJ/USDT price
 * Returns price as a decimal string (e.g., "12.45" means 1 INJ = 12.45 USDT)
 */
export async function getINJUSDTPrice(): Promise<string> {
  try {
    const markets = await spotApi.fetchMarkets()

    // Find INJ/USDT market
    const injUsdtMarket = markets.find(
      (m) => m.marketId === MARKETS.INJ_USDT || m.ticker === MARKETS.INJ_USDT
    )

    if (!injUsdtMarket) {
      throw new Error('INJ/USDT market not found')
    }

    const orderbook = await spotApi.fetchOrderbookV2(injUsdtMarket.marketId)
    const bestBid = orderbook.buys?.[0]?.price
    const bestAsk = orderbook.sells?.[0]?.price

    if (bestBid && bestAsk) {
      return ((parseFloat(bestBid) + parseFloat(bestAsk)) / 2).toString()
    }

    return bestBid || bestAsk || '0'
  } catch (error) {
    console.error('Failed to fetch INJ/USDT price:', error)
    throw error
  }
}

/**
 * Fetch all available markets
 */
export async function getAvailableMarkets() {
  try {
    const markets = await spotApi.fetchMarkets()
    return markets
  } catch (error) {
    console.error('Failed to fetch markets:', error)
    throw error
  }
}

/**
 * Convert INJ amount to USDT equivalent
 */
export async function convertINJToUSDT(injAmount: string): Promise<string> {
  const price = await getINJUSDTPrice()
  // Simple multiplication: INJ amount * price = USDT amount
  const usdtAmount = (parseFloat(injAmount) * parseFloat(price)).toString()
  return usdtAmount
}

/**
 * Convert USDT amount to INJ equivalent
 */
export async function convertUSDTToINJ(usdtAmount: string): Promise<string> {
  const price = await getINJUSDTPrice()
  // Simple division: USDT amount / price = INJ amount
  const injAmount = (parseFloat(usdtAmount) / parseFloat(price)).toString()
  return injAmount
}
