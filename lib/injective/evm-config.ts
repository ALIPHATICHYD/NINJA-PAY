/**
 * EVM Network Configuration
 * 
 * Enables users to add Injective to their EVM-compatible wallets (MetaMask, etc.)
 * Injective operates as an EVM chain with ChainId 1776 (0x6f0 in hex)
 */

import { USDC } from './tokens'

export interface InjectiveNetworkConfig {
  chainId: string
  chainName: string
  rpcUrls: string[]
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  blockExplorerUrls: string[]
}

/**
 * Injective Mainnet EVM Configuration
 */
export const INJECTIVE_MAINNET_EVM: InjectiveNetworkConfig = {
  chainId: '0x6f0', // 1776 in decimal
  chainName: 'Injective',
  rpcUrls: [
    'https://evm-rpc.injective.network',
    'https://evm.injective.network',
  ],
  nativeCurrency: {
    name: 'Injective',
    symbol: 'INJ',
    decimals: 18,
  },
  blockExplorerUrls: ['https://explorer.injective.network'],
}

/**
 * Injective Testnet EVM Configuration
 */
export const INJECTIVE_TESTNET_EVM: InjectiveNetworkConfig = {
  chainId: '0x968', // 2408 in decimal
  chainName: 'Injective Testnet',
  rpcUrls: [
    'https://testnet.rpc.inevm.com/http',
    'https://testnet.evm.injective.network',
  ],
  nativeCurrency: {
    name: 'Injective',
    symbol: 'INJ',
    decimals: 18,
  },
  blockExplorerUrls: ['https://testnet.explorer.injective.network'],
}

/**
 * Add Injective network to MetaMask or EVM-compatible wallet
 * 
 * @param isTestnet Whether to add testnet or mainnet
 * @returns Promise that resolves when network is added
 */
export async function addInjectiveToWallet(isTestnet: boolean = false): Promise<void> {
  if (!window.ethereum) {
    throw new Error('MetaMask or EVM wallet provider not found. Please install MetaMask.')
  }

  const config = isTestnet ? INJECTIVE_TESTNET_EVM : INJECTIVE_MAINNET_EVM

  try {
    // First, try to switch to the network
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: config.chainId }],
    })

    console.log(`Switched to ${isTestnet ? 'Testnet' : 'Mainnet'} successfully!`)
  } catch (switchError: any) {
    // Error code 4902 means the network hasn't been added yet
    if (switchError.code === 4902) {
      try {
        // Add the network
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [config],
        })

        console.log(`${isTestnet ? 'Testnet' : 'Mainnet'} network added successfully!`)
      } catch (addError) {
        console.error(`Failed to add ${isTestnet ? 'Testnet' : 'Mainnet'} network:`, addError)
        throw addError
      }
    } else {
      console.error(`Failed to switch to ${isTestnet ? 'Testnet' : 'Mainnet'} network:`, switchError)
      throw switchError
    }
  }
}

/**
 * Add Injective Mainnet to wallet
 */
export async function addInjectiveMainnetToWallet(): Promise<void> {
  return addInjectiveToWallet(false)
}

/**
 * Add Injective Testnet to wallet
 */
export async function addInjectiveTestnetToWallet(): Promise<void> {
  return addInjectiveToWallet(true)
}

/**
 * Check if user has Injective network added to wallet
 */
export async function isInjectiveNetworkConnected(isTestnet: boolean = false): Promise<boolean> {
  if (!window.ethereum) {
    return false
  }

  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' })
    const expectedChainId = isTestnet ? INJECTIVE_TESTNET_EVM.chainId : INJECTIVE_MAINNET_EVM.chainId
    return chainId === expectedChainId
  } catch (error) {
    console.error('Failed to check network connection:', error)
    return false
  }
}

/**
 * Get current connected EVM chain ID
 */
export async function getCurrentChainId(): Promise<string | null> {
  if (!window.ethereum) {
    return null
  }

  try {
    return await window.ethereum.request({ method: 'eth_chainId' })
  } catch (error) {
    console.error('Failed to get chain ID:', error)
    return null
  }
}

/**
 * Get current connected EVM address
 */
export async function getCurrentEVMAddress(): Promise<string | null> {
  if (!window.ethereum) {
    return null
  }

  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' })
    return accounts && accounts.length > 0 ? accounts[0] : null
  } catch (error) {
    console.error('Failed to get EVM address:', error)
    return null
  }
}

/**
 * Request user to connect to EVM wallet
 */
export async function requestEVMConnection(): Promise<string[]> {
  if (!window.ethereum) {
    throw new Error('MetaMask or EVM wallet provider not found')
  }

  try {
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    })
    return accounts as string[]
  } catch (error: any) {
    if (error.code === 4001) {
      throw new Error('User rejected the connection request')
    }
    throw error
  }
}

/**
 * Add custom token (USDC) to wallet
 * 
 * @param tokenAddress Contract address of the token
 * @param tokenSymbol Symbol of the token (e.g., "USDC")
 * @param tokenDecimals Decimals for the token
 * @param tokenImage URL to token image
 */
export async function addTokenToWallet(
  tokenAddress: string,
  tokenSymbol: string,
  tokenDecimals: number = 6,
  tokenImage?: string
): Promise<boolean> {
  if (!window.ethereum) {
    throw new Error('MetaMask or EVM wallet provider not found')
  }

  try {
    return await window.ethereum.request({
      method: 'wallet_watchAsset',
      params: {
        type: 'ERC20',
        options: {
          address: tokenAddress,
          symbol: tokenSymbol,
          decimals: tokenDecimals,
          image: tokenImage,
        },
      },
    })
  } catch (error) {
    console.error('Failed to add token to wallet:', error)
    throw error
  }
}

/**
 * Add Circle's native USDC on Injective to the wallet's token list.
 */
export async function addUSDCToWallet(): Promise<boolean> {
  if (!USDC.evmAddress) throw new Error('USDC has no EVM contract configured')
  return addTokenToWallet(USDC.evmAddress, USDC.symbol, USDC.decimals, USDC.logo)
}

/**
 * Listen for network changes
 */
export function onNetworkChange(callback: (chainId: string) => void): () => void {
  if (!window.ethereum) {
    console.warn('No EVM provider detected')
    return () => {}
  }

  const handleChainChanged = (chainId: string) => {
    callback(chainId)
  }

  window.ethereum.on('chainChanged', handleChainChanged)

  // Return unsubscribe function
  return () => {
    window.ethereum?.removeListener('chainChanged', handleChainChanged)
  }
}

/**
 * Listen for account changes
 */
export function onAccountChange(callback: (accounts: string[]) => void): () => void {
  if (!window.ethereum) {
    console.warn('No EVM provider detected')
    return () => {}
  }

  const handleAccountsChanged = (accounts: string[]) => {
    callback(accounts)
  }

  window.ethereum.on('accountsChanged', handleAccountsChanged)

  // Return unsubscribe function
  return () => {
    window.ethereum?.removeListener('accountsChanged', handleAccountsChanged)
  }
}
