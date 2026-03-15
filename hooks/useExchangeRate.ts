import { useState, useCallback, useEffect } from 'react'
import { getINJUSDTPrice } from '@/lib/injective/exchange'

interface UseExchangeRateReturn {
  injToUsdtRate: string
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Hook for fetching live INJ/USDT exchange rate
 */
export function useExchangeRate(): UseExchangeRateReturn {
  const [rate, setRate] = useState<string>('0')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const price = await getINJUSDTPrice()
      setRate(price)
    } catch (err: any) {
      console.error('Failed to fetch exchange rate:', err)
      setError(err.message || 'Failed to fetch exchange rate')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch rate on mount
  useEffect(() => {
    refetch()
  }, [refetch])

  // Poll rate every 30 seconds
  useEffect(() => {
    const interval = setInterval(refetch, 30000)
    return () => clearInterval(interval)
  }, [refetch])

  return {
    injToUsdtRate: rate,
    loading,
    error,
    refetch,
  }
}
