import { useState, useCallback, useEffect } from 'react'
import { fetchBalance } from '@/lib/injective/bank'
import { BalanceState } from '@/lib/injective/types'

interface UseBalanceReturn extends BalanceState {
  refetch: () => Promise<void>
}

/**
 * Hook for fetching and managing INJ/USDT balance
 */
export function useBalance(address: string | null): UseBalanceReturn {
  const [balance, setBalance] = useState<BalanceState>({
    inj: '0',
    usdt: '0',
    loading: true,
  })

  const refetch = useCallback(async () => {
    if (!address) {
      setBalance({
        inj: '0',
        usdt: '0',
        loading: false,
      })
      return
    }

    setBalance((prev) => ({
      ...prev,
      loading: true,
    }))

    try {
      const newBalance = await fetchBalance(address)
      setBalance(newBalance)
    } catch (error: any) {
      console.error('Failed to fetch balance:', error)
      setBalance({
        inj: '0',
        usdt: '0',
        loading: false,
        error: error.message || 'Failed to fetch balance',
      })
    }
  }, [address])

  // Fetch balance when address changes
  useEffect(() => {
    refetch()
  }, [address, refetch])

  // Poll balance every 10 seconds
  useEffect(() => {
    if (!address) return

    const interval = setInterval(refetch, 10000)
    return () => clearInterval(interval)
  }, [address, refetch])

  return {
    ...balance,
    refetch,
  }
}
