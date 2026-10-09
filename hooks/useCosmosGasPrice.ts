'use client'

import { useQuery } from '@tanstack/react-query'
import { GAS_PRICE } from '@/lib/injective/fees'
import { fetchGasPrice } from '@/lib/injective/gas-price'

const REFRESH_MS = 30_000

/**
 * The gas price Injective requires for Cosmos transactions right now, for fee
 * estimates. Refreshed every 30 seconds; the minimum until it loads. Signing
 * reads it again, so a transaction always pays the price at that moment.
 */
export function useCosmosGasPrice(): bigint {
  const { data } = useQuery({
    queryKey: ['cosmos-gas-price'],
    queryFn: () => fetchGasPrice(),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS,
  })
  return data ?? GAS_PRICE
}
