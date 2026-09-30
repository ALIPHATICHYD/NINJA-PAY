'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchPrices, NO_PRICES, PRICE_REFRESH_MS, type Prices } from '@/lib/prices'

/**
 * Indicative INJ and USDC prices from Injective's oracle, shared by every
 * component through the query cache and refreshed each minute.
 */
export function usePrices(): { prices: Prices; loading: boolean } {
  const query = useQuery({
    queryKey: ['prices'],
    queryFn: () => fetchPrices(),
    refetchInterval: PRICE_REFRESH_MS,
    staleTime: PRICE_REFRESH_MS,
  })
  return { prices: query.data ?? NO_PRICES, loading: query.isLoading }
}
