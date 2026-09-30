'use client'

import { useState, useEffect } from 'react'
import { getPrices, PRICE_REFRESH_MS } from '@/lib/prices'

interface TokenPrices {
  injUsd: number
  usdcNgn: number // Approximate P2P/black market rate for USDC to NGN
  loading: boolean
}

export function useTokenPrice(): TokenPrices {
  const [prices, setPrices] = useState<TokenPrices>({
    injUsd: 0,
    usdcNgn: 1600, // Default estimated parallel market rate
    loading: true,
  })

  useEffect(() => {
    let mounted = true

    const fetchPrice = async () => {
      const { injUsd } = await getPrices()
      if (mounted) setPrices(prev => ({ ...prev, injUsd: injUsd ?? prev.injUsd, loading: false }))
    }

    fetchPrice()
    const interval = setInterval(fetchPrice, PRICE_REFRESH_MS)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return prices
}
