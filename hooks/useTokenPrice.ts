'use client'

import { useState, useEffect } from 'react'

interface TokenPrices {
  injUsd: number
  usdtNgn: number // Approximate P2P/black market rate for USDT to NGN
  loading: boolean
}

export function useTokenPrice(): TokenPrices {
  const [prices, setPrices] = useState<TokenPrices>({
    injUsd: 0,
    usdtNgn: 1600, // Default estimated parallel market rate
    loading: true,
  })

  useEffect(() => {
    let mounted = true

    const fetchPrice = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=injective-protocol&vs_currencies=usd')
        const data = await res.json()
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
