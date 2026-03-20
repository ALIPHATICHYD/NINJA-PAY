'use client'

import { useAccount, useDisconnect } from 'wagmi'

interface UseWalletReturn {
  address: string | null
  isConnected: boolean
  loading: boolean
  error: string | null
  /** @deprecated — wallet connection is now handled by RainbowKit's ConnectButton */
  connect: (walletType: 'keplr' | 'leap' | 'metamask') => Promise<void>
  disconnect: () => void
}

/**
 * Bridge hook: reads the wagmi/RainbowKit account state so every page
 * that calls useWallet() works automatically when the user connects via RainbowKit.
 *
 * The `connect` method is a no-op stub kept for backward compatibility with
 * pages that haven't been migrated yet.
 */
export function useWallet(): UseWalletReturn {
  const { address, isConnected, isConnecting } = useAccount()
  const { disconnect } = useDisconnect()

  return {
    address: address ?? null,
    isConnected,
    loading: isConnecting,
    error: null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    connect: async (_walletType) => {
      // No-op: use RainbowKit's ConnectButton instead
      console.warn('useWallet.connect() is deprecated — use RainbowKit ConnectButton')
    },
    disconnect,
  }
}
