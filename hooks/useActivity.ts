'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getInjectiveAddress } from '@injectivelabs/sdk-ts'
import { useWallet } from '@/hooks/useWallet'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { fetchActivity, type ActivityItem } from '@/lib/injective/activity'
import { resolveClaimEscrows } from '@/lib/supabase'

/**
 * On-chain activity for every Injective account the user has connected:
 * the Keplr/Leap account and the inj1 form of the EVM wallet address.
 */
export function useActivity() {
  const { address: evmAddress } = useWallet()
  const { userAddress: cosmosAddress } = useCosmosTransaction()

  const addresses = useMemo(() => {
    const list = new Set<string>()
    if (cosmosAddress) list.add(cosmosAddress)
    if (evmAddress) {
      try { list.add(getInjectiveAddress(evmAddress)) } catch { /* not a valid 0x address */ }
    }
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

  return { items, loading, error, refetch: load, addresses }
}
