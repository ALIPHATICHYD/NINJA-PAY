'use client'

import { useMemo } from 'react'
import { numberToHex } from 'viem'
import { useAccount, useSwitchChain } from 'wagmi'
import type { EvmCosmosSigner } from '@/lib/injective/cosmos-transactions'
import { ETHEREUM_SIGNING_CHAIN_ID, INJECTIVE_EVM } from '@/lib/injective/network'
import { isPhantomConnector } from '@/lib/injective/phantom'

/** How long to wait for the wallet's signature before saying it didn't come back. */
export const SIGNATURE_TIMEOUT_MS = 3 * 60_000

export const SIGNATURE_LOST =
  "Your wallet didn't send the signature back to NinjaPay, so nothing was sent. Try again, or open NinjaPay in your wallet's own browser."

type Eip1193 = { request: (args: { method: string; params: unknown[] }) => Promise<unknown> }

/** Whether the connected EVM wallet is Phantom, which can't join Injective's EVM network. */
export function usePhantom(): boolean {
  const { connector } = useAccount()
  return isPhantomConnector(connector)
}

/**
 * The connected EVM wallet (MetaMask, or any wallet RainbowKit connects) as a
 * signer for Cosmos messages, or null when none is connected. It signs
 * EIP-712 typed data with eth_signTypedData_v4, so a Ledger connected
 * through the wallet signs the same way.
 *
 * Wallets refuse typed data for a chain other than the active one, so it asks
 * the wallet to switch to Injective's EVM network first when needed. Phantom
 * can't switch there, so it signs under Ethereum's chain id, which the chain
 * also accepts (see ETHEREUM_SIGNING_CHAIN_ID).
 */
export function useEvmSigner(): EvmCosmosSigner | null {
  const { address, chainId, connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const phantom = isPhantomConnector(connector)

  return useMemo(() => {
    if (!address || !connector) return null
    return {
      kind: 'evm',
      address,
      typedDataChainId: phantom ? ETHEREUM_SIGNING_CHAIN_ID : undefined,
      signTypedData: async (typedDataJson: string) => {
        const provider = (await connector.getProvider()) as Eip1193
        if (phantom) {
          // Ethereum and Sepolia are Phantom networks, so this usually just works. If Phantom
          // won't switch, ask for the signature anyway: Phantom says so itself if it refuses.
          if (chainId !== ETHEREUM_SIGNING_CHAIN_ID) {
            await provider
              .request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(ETHEREUM_SIGNING_CHAIN_ID) }] })
              .catch(() => undefined)
          }
        } else if (chainId !== INJECTIVE_EVM.id) {
          await switchChainAsync({ chainId: INJECTIVE_EVM.id })
        }
        // A wallet opened in another app (MetaMask from Leap's browser, say) can sign and never send
        // the signature back, which left "Approving…" spinning. Nothing is broadcast without it.
        let timer: ReturnType<typeof setTimeout> | undefined
        const lost = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(SIGNATURE_LOST)), SIGNATURE_TIMEOUT_MS)
        })
        const signature = provider.request({ method: 'eth_signTypedData_v4', params: [address, typedDataJson] })
        return (await Promise.race([signature, lost]).finally(() => clearTimeout(timer))) as string
      },
    }
  }, [address, chainId, connector, phantom, switchChainAsync])
}
