'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { useTokenList } from '@/hooks/useTokenList'
import { fetchActivity, withTokenNames, type ActivityItem } from '@/lib/injective/activity'
import { toInjectiveAddress } from '@/lib/injective/address'
import { resolveClaimEscrows } from '@/lib/supabase'

/**
 * On-chain activity for every Injective account the user has connected:
 * the Keplr/Leap account and the inj1 form of the EVM wallet address.
 * Tokens other than INJ and USDC are named from Injective's token list.
 */
export function useActivity() {
  const { address: evmAddress } = useWallet()
  const { userAddress: cosmosAddress } = useCosmosTransaction()

  const addresses = useMemo(() => {
    const list = new Set<string>()
    if (cosmosAddress) list.add(cosmosAddress)
    const walletAccount = toInjectiveAddress(evmAddress)
    if (walletAccount) list.add(walletAccount)
    return [...list]
  }, [cosmosAddress, evmAddress])

  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const key = addresses.join(',')
  const load = useCallback(async () => {
    if (!key) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setItems(await fetchActivity(key.split(','), { resolveEscrows: resolveClaimEscrows }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activity.')
    } finally {
      setLoading(false)
    }
  }, [key])

  useEffect(() => { load() }, [load])

  const tokens = useTokenList()
  const named = useMemo(() => withTokenNames(items, tokens), [items, tokens])

  return { items: named, loading, error, refetch: load, addresses }
}
