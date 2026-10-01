'use client'

import { useMemo } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import type { EvmCosmosSigner } from '@/lib/injective/cosmos-transactions'
import { INJECTIVE_EVM } from '@/lib/injective/network'

type Eip1193 = { request: (args: { method: string; params: unknown[] }) => Promise<unknown> }

/**
 * The connected EVM wallet (MetaMask, or any wallet RainbowKit connects) as a
 * signer for Cosmos messages, or null when none is connected. It signs
 * EIP-712 typed data with eth_signTypedData_v4, so a Ledger connected
 * through the wallet signs the same way.
 *
 * Wallets refuse typed data for a chain other than the active one, so it asks
 * the wallet to switch to Injective's EVM network first when needed.
 */
export function useEvmSigner(): EvmCosmosSigner | null {
  const { address, chainId, connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  return useMemo(() => {
    if (!address || !connector) return null
    return {
      kind: 'evm',
      address,
      signTypedData: async (typedDataJson: string) => {
        if (chainId !== INJECTIVE_EVM.id) await switchChainAsync({ chainId: INJECTIVE_EVM.id })
        const provider = (await connector.getProvider()) as Eip1193
        return (await provider.request({ method: 'eth_signTypedData_v4', params: [address, typedDataJson] })) as string
      },
    }
  }, [address, chainId, connector, switchChainAsync])
}
