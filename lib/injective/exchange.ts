import { IndexerGrpcSpotApi } from '@injectivelabs/sdk-ts'
import { getNetworkEndpoints } from '@injectivelabs/networks'
import { NETWORK, MARKETS } from './constants'

const endpoints = getNetworkEndpoints(NETWORK)
const spotApi = new IndexerGrpcSpotApi(endpoints.indexer)

/**
 * Fetch live INJ/USDC price
 * Returns price as a decimal string (e.g., "12.45" means 1 INJ = 12.45 USDC)
 * USDC is Circle's regulated stablecoin via CCTP (Cross-Chain Transfer Protocol)
 */
export async function getINJUSDCPrice(): Promise<string> {
  try {
    const markets = await spotApi.fetchMarkets()

    // Find INJ/USDC market
    const injUsdcMarket = markets.find(
      (m) => m.marketId === MARKETS.INJ_USDC || m.ticker === MARKETS.INJ_USDC
    )

    if (!injUsdcMarket) {
      throw new Error('INJ/USDC market not found')
    }

    const orderbook = await spotApi.fetchOrderbookV2(injUsdcMarket.marketId)
    const bestBid = orderbook.buys?.[0]?.price
    const bestAsk = orderbook.sells?.[0]?.price

    if (bestBid && bestAsk) {
      return ((parseFloat(bestBid) + parseFloat(bestAsk)) / 2).toString()
    }

    return bestBid || bestAsk || '0'
  } catch (error) {
    console.error('Failed to fetch INJ/USDC price:', error)
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
 * Convert INJ amount to USDC equivalent
 */
export async function convertINJToUSDC(injAmount: string): Promise<string> {
  const price = await getINJUSDCPrice()
  // Simple multiplication: INJ amount * price = USDC amount
  const usdcAmount = (parseFloat(injAmount) * parseFloat(price)).toString()
  return usdcAmount
}

/**
 * Convert USDC amount to INJ equivalent
 */
export async function convertUSDCToINJ(usdcAmount: string): Promise<string> {
  const price = await getINJUSDCPrice()
  // Simple division: USDC amount / price = INJ amount
  const injAmount = (parseFloat(usdcAmount) / parseFloat(price)).toString()
  return injAmount
}
