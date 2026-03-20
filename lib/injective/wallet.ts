'use client'

// This module should only be used in client components

type WalletType = 'keplr' | 'leap' | 'metamask'

type ConnectedWallet = {
  walletType: WalletType
  address: string
}

let connectedWallet: ConnectedWallet | null = null

/**
 * Initialize wallet strategy - must be called from a 'use client' component
 */
export async function initWalletStrategy(
  walletType: WalletType
): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('Wallet initialization requires browser environment')
  }

  try {
    if (walletType === 'metamask') {
      const ethereum = (window as any).ethereum
      if (!ethereum) {
        throw new Error('MetaMask is not installed')
      }

      const accounts = (await ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[]

      if (!accounts || accounts.length === 0) {
        throw new Error('No MetaMask accounts found')
      }

      connectedWallet = {
        walletType,
        address: accounts[0],
      }

      return connectedWallet
    }

    const keplr = (window as any).keplr
    if (!keplr) {
      throw new Error('Keplr-compatible wallet is not installed')
    }

    const chainId = 'injective-888'
    await keplr.enable(chainId)

    const offlineSigner =
      typeof (window as any).getOfflineSigner === 'function'
        ? (window as any).getOfflineSigner(chainId)
        : keplr.getOfflineSigner(chainId)

    const accounts = await offlineSigner.getAccounts()
    if (!accounts || accounts.length === 0) {
      throw new Error('No wallet addresses found')
    }

    connectedWallet = {
      walletType,
      address: accounts[0].address,
    }

    return connectedWallet
  } catch (error) {
    console.error('Failed to initialize wallet:', error)
    connectedWallet = null
    throw error
  }
}

/**
 * Get the current wallet strategy instance
 */
export function getWalletStrategy(): any {
  if (!connectedWallet) {
    throw new Error('Wallet not initialized. Call initWalletStrategy first.')
  }

  // Minimal adapter to keep compatibility with call sites expecting walletStrategy-like object.
  return {
    getAddresses: async () => [connectedWallet!.address],
    disconnect: async () => {
      connectedWallet = null
    },
  }
}

/**
 * Get the user's wallet address
 */
export async function getWalletAddress(): Promise<string> {
  if (!connectedWallet) {
    throw new Error('No wallet address found')
  }

  if (!connectedWallet.address) {
    throw new Error('No wallet address found')
  }

  return connectedWallet.address
}

/**
 * Disconnect wallet
 */
export async function disconnectWallet(): Promise<void> {
  connectedWallet = null
}

/**
 * Check if wallet is connected
 */
export function isWalletConnected(): boolean {
  return connectedWallet !== null
}

/**
 * Sign a message with wallet
 */
export async function signMessage(message: string): Promise<string> {
  const address = await getWalletAddress()

  if (!connectedWallet) {
    throw new Error('Wallet not initialized')
  }

  if (connectedWallet.walletType === 'metamask') {
    const ethereum = (window as any).ethereum
    if (!ethereum) {
      throw new Error('MetaMask provider not found')
    }

    const signature = (await ethereum.request({
      method: 'personal_sign',
      params: [message, address],
    })) as string

    return signature
  }

  const keplr = (window as any).keplr
  const chainId = 'injective-888'
  if (!keplr || typeof keplr.signArbitrary !== 'function') {
    throw new Error('Keplr signing is not available')
  }

  const result = await keplr.signArbitrary(chainId, address, message)
  return result.signature
}
