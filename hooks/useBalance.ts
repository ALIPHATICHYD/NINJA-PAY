'use client'

import { useBalance as useWagmiBalance } from 'wagmi'

interface BalanceReturn {
  inj: string    // raw wei string for native INJ
  usdc: string   // raw wei string (placeholder 0 for now)
  loading: boolean
  error?: string
  refetch: () => void
}

/**
 * Returns the connected wallet's native INJ balance on the EVM chain.
 * `inj` is in wei (18 decimals) for backward compat with the rest of the UI.
 */
export function useBalance(address: string | null): BalanceReturn {
  const { data, isLoading, error, refetch } = useWagmiBalance({
    address: address as `0x${string}` | undefined,
    query: { enabled: !!address },
  })

  return {
    inj:  data ? data.value.toString() : '0',
    usdc: '0',  // ERC-20 USDC balance can be added later
    loading: isLoading,
    error: error?.message,
    refetch,
  }
}
