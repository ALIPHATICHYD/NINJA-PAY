'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toInjectiveAddress } from '@/lib/injective/address'
import { balanceOf, fetchAllBalances } from '@/lib/injective/bank'
import { DENOMS } from '@/lib/injective/tokens'

interface BalanceReturn {
  inj: string    // base units, 18 decimals
  usdc: string   // base units, 6 decimals (Circle's native USDC)
  loading: boolean
  error?: string
  refetch: () => void
}

/**
 * INJ and USDC balances (base units) of the connected wallet.
 *
 * Both come from the bank module for the account's inj1 address, which is the
 * same account as its 0x address. USDC follows the MultiVM Token Standard, so
 * this is also its ERC-20 balance: no Keplr prompt is needed to read it.
 */
export function useBalance(address: string | null): BalanceReturn {
  const injectiveAddress = useMemo(() => toInjectiveAddress(address), [address])

  const query = useQuery({
    queryKey: ['bank-balances', injectiveAddress],
    queryFn: () => fetchAllBalances(injectiveAddress!),
    enabled: !!injectiveAddress,
    refetchInterval: 30_000,
  })

  const balances = query.data ?? []
  return {
    inj: balanceOf(balances, DENOMS.INJ),
    usdc: balanceOf(balances, DENOMS.USDC),
    loading: query.isLoading,
    error: query.error ? 'Could not load your balance. Try again.' : undefined,
    refetch: () => { void query.refetch() },
  }
}
