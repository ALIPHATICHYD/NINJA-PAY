// This module should only be used in client components
// Import with 'use client' at the top of your component

let walletStrategy: any = null

/**
 * Initialize wallet strategy - must be called from a 'use client' component
 */
export async function initWalletStrategy(
  walletType: 'keplr' | 'leap'
): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('Wallet initialization requires browser environment')
  }

  try {
    // Dynamic import inside function to avoid SSR issues
    const { WalletStrategy, Wallet: InjectiveWallet } = await import(
      '@injectivelabs/wallet-ts'
    )
    const { ChainId } = await import('@injectivelabs/ts-types')

    const wallet =
      walletType === 'keplr'
        ? InjectiveWallet.Keplr
        : InjectiveWallet.Leap

    const args = {
      chainId: ChainId.Testnet,
      wallet: wallet,
    }

    walletStrategy = new WalletStrategy(args)

    // Attempt to get addresses to verify connection
    const addresses = await walletStrategy.getAddresses()
    if (!addresses || addresses.length === 0) {
      throw new Error('No wallet addresses found')
    }

    return walletStrategy
  } catch (error) {
    console.error('Failed to initialize wallet:', error)
    walletStrategy = null
    throw error
  }
}

/**
 * Get the current wallet strategy instance
 */
export function getWalletStrategy(): any {
  if (!walletStrategy) {
    throw new Error('Wallet not initialized. Call initWalletStrategy first.')
  }
  return walletStrategy
}

/**
 * Get the user's wallet address
 */
export async function getWalletAddress(): Promise<string> {
  const strategy = getWalletStrategy()
  const addresses = await strategy.getAddresses()
  if (!addresses || addresses.length === 0) {
    throw new Error('No wallet address found')
  }
  return addresses[0]
}

/**
 * Disconnect wallet
 */
export async function disconnectWallet(): Promise<void> {
  if (walletStrategy) {
    try {
      await walletStrategy.disconnect()
    } catch (error) {
      console.warn('Error disconnecting wallet:', error)
    }
  }
  walletStrategy = null
}

/**
 * Check if wallet is connected
 */
export function isWalletConnected(): boolean {
  return walletStrategy !== null
}

/**
 * Sign a message with wallet
 */
export async function signMessage(message: string): Promise<string> {
  const strategy = getWalletStrategy()
  const address = await getWalletAddress()

  // sign message implementation
  // This varies by wallet and is handled by the strategy
  const signature = await strategy.signMessage({
    message,
    address,
  })

  return signature
}
