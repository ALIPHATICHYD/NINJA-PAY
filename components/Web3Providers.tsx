'use client'

import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import '@rainbow-me/rainbowkit/styles.css'
import { INJECTIVE_EVM } from '@/lib/injective/network'

const config = getDefaultConfig({
  appName: 'NinjaPay',
  // Replace with a real WalletConnect Cloud project ID: https://cloud.walletconnect.com
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID || 'b56e18d47c72ab683b10814fe9495694',
  // Injective's native EVM (1439 testnet, 1776 mainnet), not the deprecated inEVM.
  chains: [INJECTIVE_EVM],
  ssr: true,
})

const queryClient = new QueryClient()

export function Web3Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#4d3dff',
            accentColorForeground: '#eeefff',
            borderRadius: 'medium',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
