'use client'

import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import '@rainbow-me/rainbowkit/styles.css'

// Injective EVM Testnet (inEVM Testnet)
export const injectiveTestnet = {
  id: 2424,
  name: 'Injective Testnet',
  nativeCurrency: { name: 'Injective', symbol: 'INJ', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet.rpc.inevm.com/http'] },
    public:  { http: ['https://testnet.rpc.inevm.com/http'] },
  },
  blockExplorers: {
    default: {
      name: 'Injective Testnet Explorer',
      url: 'https://testnet.explorer.injective.network',
    },
  },
  testnet: true,
} as const

const config = getDefaultConfig({
  appName: 'NinjaPay',
  // Replace with a real WalletConnect Cloud project ID: https://cloud.walletconnect.com
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID || 'b56e18d47c72ab683b10814fe9495694',
  chains: [injectiveTestnet],
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
