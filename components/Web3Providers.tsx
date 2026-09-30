'use client'

import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { WagmiProvider, fallback, http } from 'wagmi'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import '@rainbow-me/rainbowkit/styles.css'
import { ENDPOINTS, INJECTIVE_EVM, PUBLIC_EVM_RPC } from '@/lib/injective/network'

// Reads go to the configured EVM RPC (a premium provider or the /api/evm-rpc
// proxy) and fall back to Injective's public RPC if it fails.
const evmTransport = ENDPOINTS.evmRpc === PUBLIC_EVM_RPC
  ? http(PUBLIC_EVM_RPC)
  : fallback([http(ENDPOINTS.evmRpc), http(PUBLIC_EVM_RPC)])

const config = getDefaultConfig({
  appName: 'NinjaPay',
  // WalletConnect (mobile and QR-code wallets) needs NinjaPay's own WalletConnect
  // Cloud project id, with the site's domains on its allowlist. The fallback is a
  // shared id kept only so local development works; set NEXT_PUBLIC_WALLETCONNECT_ID
  // for every deployment.
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID || 'b56e18d47c72ab683b10814fe9495694',
  // Injective's native EVM (1439 testnet, 1776 mainnet), not the deprecated inEVM.
  chains: [INJECTIVE_EVM],
  transports: { [INJECTIVE_EVM.id]: evmTransport },
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
