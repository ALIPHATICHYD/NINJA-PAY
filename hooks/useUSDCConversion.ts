'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getINJUSDCPriceFromOrderbook,
  convertINJToUSDC,
  convertUSDCToINJ,
  convertUSDCToNGN,
  convertNGNToUSDC,
  getUSDCPrice,
  getUSDCRedemptionRatio,
} from '@/lib/injective/usdc-testnet'
import { PRICE_REFRESH_MS } from '@/lib/prices'

interface UseUSDCConversionReturn {
  // Prices
  injUsdcRate: string
  usdcPrice: string
  usdcNgnRate: number
  loading: boolean
  error: string | null

  // Conversion functions
  injToUsdc: (amount: string) => Promise<string>
  usdcToInj: (amount: string) => Promise<string>
  usdcToNgn: (amount: string) => string
  ngnToUsdc: (amount: string) => string
  redemptionRatio: number

  // Refresh
  refetch: () => Promise<void>
}

/**
 * Hook for USDC conversions and price updates
 * Provides real-time INJ/USDC rates and NGN conversions
 */
export function useUSDCConversion(usdcNgnRate: number = 1600): UseUSDCConversionReturn {
  const [prices, setPrices] = useState({
    injUsdcRate: '0',
    usdcPrice: '1',
    redemptionRatio: 1.0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPrices = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch prices in parallel
      const [injRate, usdcPriceStr, ratio] = await Promise.all([
        getINJUSDCPriceFromOrderbook(),
        getUSDCPrice(),
        getUSDCRedemptionRatio(),
      ])

      setPrices({
        injUsdcRate: injRate,
        usdcPrice: usdcPriceStr,
        redemptionRatio: ratio,
      })
    } catch (err: any) {
      console.error('Failed to fetch USDC prices:', err)
      setError(err.message || 'Failed to fetch prices')
      // Use fallback values
      setPrices({
        injUsdcRate: '0',
        usdcPrice: '1',
        redemptionRatio: 1.0,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch prices on mount
  useEffect(() => {
    fetchPrices()
  }, [fetchPrices])

  // Poll for price updates every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchPrices, PRICE_REFRESH_MS)
    return () => clearInterval(interval)
  }, [fetchPrices])

  const injToUsdc = useCallback(async (amount: string): Promise<string> => {
    try {
      return await convertINJToUSDC(amount)
    } catch (err) {
      console.error('Failed to convert INJ to USDC:', err)
      return '0'
    }
  }, [])

  const usdcToInj = useCallback(async (amount: string): Promise<string> => {
    try {
      return await convertUSDCToINJ(amount)
    } catch (err) {
      console.error('Failed to convert USDC to INJ:', err)
      return '0'
    }
  }, [])

  const usdcToNgn = useCallback((amount: string): string => {
    return convertUSDCToNGN(amount, usdcNgnRate)
  }, [usdcNgnRate])

  const ngnToUsdc = useCallback((amount: string): string => {
    return convertNGNToUSDC(amount, usdcNgnRate)
  }, [usdcNgnRate])

  return {
    injUsdcRate: prices.injUsdcRate,
    usdcPrice: prices.usdcPrice,
    usdcNgnRate,
    loading,
    error,
    injToUsdc,
    usdcToInj,
    usdcToNgn,
    ngnToUsdc,
    redemptionRatio: prices.redemptionRatio,
    refetch: fetchPrices,
  }
}

/**
 * Hook to fetch just the INJ/USDC price
 */
export function useUSDCPrice(): {
  injUsdcRate: string
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
} {
  const [rate, setRate] = useState('0')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPrice = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const price = await getINJUSDCPriceFromOrderbook()
      setRate(price)
    } catch (err: any) {
      console.error('Failed to fetch INJ/USDC price:', err)
      setError(err.message || 'Failed to fetch price')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrice()
  }, [fetchPrice])

  // Poll every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchPrice, PRICE_REFRESH_MS)
    return () => clearInterval(interval)
  }, [fetchPrice])

  return { injUsdcRate: rate, loading, error, refetch: fetchPrice }
}

/**
 * Hook for NGN conversions
 */
export function useUSDCtoNGNConversion(usdcNgnRate: number = 1600): {
  usdcToNgn: (amount: string) => string
  ngnToUsdc: (amount: string) => string
  rate: number
} {
  const usdcToNgn = useCallback((amount: string): string => {
    return convertUSDCToNGN(amount, usdcNgnRate)
  }, [usdcNgnRate])

  const ngnToUsdc = useCallback((amount: string): string => {
    return convertNGNToUSDC(amount, usdcNgnRate)
  }, [usdcNgnRate])

  return {
    usdcToNgn,
    ngnToUsdc,
    rate: usdcNgnRate,
  }
}
