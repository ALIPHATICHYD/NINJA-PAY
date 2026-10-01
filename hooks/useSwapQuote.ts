'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useEstimateGas, useGasPrice, useReadContract } from 'wagmi'
import { encodeFunctionData } from 'viem'
import { INJECTIVE_EVM } from '@/lib/injective/network'
import { networkFee } from '@/lib/injective/fees'
import { SWAP_ABI, SWAP_PRECOMPILE, findInjUsdcRoute, minReceived, oracleGap, roundToTick } from '@/lib/injective/swap'
import { usePrices } from './usePrices'

export const SLIPPAGE_BPS = 50

/**
 * A quote for selling `amountIn` INJ base units for USDC through the Swap
 * precompile, with the slippage floor, the market's taker fee rate, the
 * network fee a swap would cost and a check against the oracle price.
 */
export function useSwapQuote(amountIn: bigint | null) {
  const { address } = useAccount()
  const { prices } = usePrices()

  const routeQuery = useQuery({
    queryKey: ['swap-route'],
    queryFn: findInjUsdcRoute,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const route = routeQuery.data?.ok ? routeQuery.data.route : null
  const quantity = route && amountIn !== null ? roundToTick(amountIn, route.quantityTick) : null
  const canQuote = !!route && quantity !== null && quantity > BigInt(0)

  const quote = useReadContract({
    address: SWAP_PRECOMPILE,
    abi: SWAP_ABI,
    functionName: 'quoteExactInputV1',
    args: canQuote ? [route.tokenIn, route.marketId, quantity] : undefined,
    chainId: INJECTIVE_EVM.id,
    query: { enabled: canQuote, retry: false, refetchInterval: 15_000 },
  })
  const amountOut = canQuote ? quote.data ?? null : null
  const minOut = amountOut !== null ? minReceived(amountOut, SLIPPAGE_BPS) : null

  // The gas a swap of this size would use, if the connected account made it.
  // The deadline only needs to be in the future for the estimate.
  const swapData = useMemo(() => {
    if (!canQuote || !address || minOut === null) return undefined
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
    return encodeFunctionData({ abi: SWAP_ABI, functionName: 'swapExactInputV1', args: [route.tokenIn, route.marketId, quantity, minOut, address, deadline] })
  }, [canQuote, address, minOut, route, quantity])
  const { data: gas } = useEstimateGas({
    account: address,
    to: SWAP_PRECOMPILE,
    data: swapData,
    chainId: INJECTIVE_EVM.id,
    query: { enabled: !!swapData, retry: false },
  })
  const { data: gasPrice } = useGasPrice({ chainId: INJECTIVE_EVM.id, query: { enabled: !!gas } })

  return {
    checking: routeQuery.isPending,
    unreachable: routeQuery.isError,
    unavailable: routeQuery.data && !routeQuery.data.ok ? routeQuery.data.reason : null,
    route,
    /** The amount quoted, after rounding down to the market's quantity step. */
    quantity,
    quoting: canQuote && quote.isPending,
    quoteFailed: canQuote && quote.isError,
    amountOut,
    minOut,
    networkFee: gas && gasPrice ? networkFee(gas, gasPrice) : null,
    oracleGap: quantity !== null && amountOut !== null ? oracleGap(quantity, amountOut, prices.INJ?.usd ?? null, prices.USDC?.usd ?? null) : null,
  }
}
