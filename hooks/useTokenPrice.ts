'use client'

import { useState, useEffect } from 'react'
import { getSimplePrice } from '@/lib/prices-client'

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
      try {
        const data = await getSimplePrice('injective-protocol', 'usd')
        if (mounted && data['injective-protocol']) {
          setPrices(prev => ({ ...prev, injUsd: data['injective-protocol'].usd, loading: false }))
        }
      } catch (err) {
        console.error('Failed to fetch INJ price:', err)
        if (mounted) setPrices(prev => ({ ...prev, loading: false }))
      }
    }

    fetchPrice()
    const interval = setInterval(fetchPrice, 30000) // update every 30s
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return prices
}
