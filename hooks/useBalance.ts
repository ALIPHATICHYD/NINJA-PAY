'use client'

import { useEffect, useState } from 'react'
import { useBalance as useWagmiBalance } from 'wagmi'

interface BalanceReturn {
  inj: string    // raw wei string for native INJ on EVM
  usdc: string   // raw 6-decimal string for USDC on Cosmos
  loading: boolean
  error?: string
  refetch: () => void
}

/**
 * Returns the connected wallet's token balances.
 * - `inj` is in wei (18 decimals) from EVM via wagmi
 * - `usdc` is fetched from Cosmos bank API (6 decimals)
 */
export function useBalance(address: string | null): BalanceReturn {
  const { data, isLoading, error, refetch } = useWagmiBalance({
    address: address as `0x${string}` | undefined,
    query: { enabled: !!address },
  })

  const [usdcBalance, setUsdcBalance] = useState('0')
  const [usdcLoading, setUsdcLoading] = useState(false)
  const [usdcError, setUsdcError] = useState<string>()

  // Fetch USDC balance from Cosmos chain
  useEffect(() => {
    if (!address) {
      setUsdcBalance('0')
      return
    }

    const fetchUSDCBalance = async () => {
      setUsdcLoading(true)
      setUsdcError(undefined)

      try {
        const { fetchBalance } = await import('@/lib/injective/bank')

        // Try to fetch from Cosmos chain using the address
        // If address is EVM (0x...), we need to convert to Injective address
        let injectiveAddress = address

        // If it's an EVM address, we'll need the Cosmos address from Keplr
        if (address.startsWith('0x')) {
          try {
            const { getUserAddress } = await import('@/lib/injective/cosmos-transactions')
            injectiveAddress = await getUserAddress()
          } catch {
            // Keplr not available, can't fetch USDC balance
            setUsdcBalance('0')
            setUsdcLoading(false)
            return
          }
        }

        const balances = await fetchBalance(injectiveAddress)
        setUsdcBalance(balances.usdc || '0')
      } catch (err: any) {
        console.error('Failed to fetch USDC balance:', err)
        setUsdcError(err.message)
        setUsdcBalance('0')
      } finally {
        setUsdcLoading(false)
      }
    }

    fetchUSDCBalance()
  }, [address])

  return {
    inj: data ? data.value.toString() : '0',
    usdc: usdcBalance,
    loading: isLoading || usdcLoading,
    error: error?.message || usdcError,
    refetch: () => {
      refetch()
      // Note: USDC refetch would need to be implemented separately
    },
  }
}
