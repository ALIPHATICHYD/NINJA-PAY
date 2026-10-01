'use client'

import { useMemo } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useCosmosTransaction } from '@/hooks/useCosmosTransaction'
import { toInjectiveAddress } from '@/lib/injective/address'

/** The inj1 accounts the user has connected: the Keplr/Leap account and the EVM wallet's account, once each. */
export function useConnectedAccounts() {
  const { address: evmAddress } = useWallet()
  const { userAddress: cosmosAddress } = useCosmosTransaction()

  const key = useMemo(() => {
    const list = new Set<string>()
    if (cosmosAddress) list.add(cosmosAddress)
    const walletAccount = toInjectiveAddress(evmAddress)
    if (walletAccount) list.add(walletAccount)
    return [...list].join(',')
  }, [cosmosAddress, evmAddress])

  return useMemo(() => {
    const addresses = key ? key.split(',') : []
    return { addresses, mine: new Set(addresses) as ReadonlySet<string> }
  }, [key])
}
