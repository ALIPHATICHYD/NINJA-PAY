/**
 * EVM wallet helpers (MetaMask and other injected wallets).
 *
 * Adds and switches to Injective's native EVM: chain 1439 on testnet, 1776 on
 * mainnet. See network.ts for the source of these values.
 */

import { numberToHex } from 'viem'
import { USDC } from './tokens'
import { INJECTIVE_EVM } from './network'

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

/** EIP-3085 parameters for the network NinjaPay runs on. */
export const INJECTIVE_EVM_WALLET_CONFIG: InjectiveNetworkConfig = {
  chainId: numberToHex(INJECTIVE_EVM.id),
  chainName: INJECTIVE_EVM.name,
  rpcUrls: [...INJECTIVE_EVM.rpcUrls.default.http],
  nativeCurrency: { ...INJECTIVE_EVM.nativeCurrency },
  blockExplorerUrls: [INJECTIVE_EVM.blockExplorers.default.url],
}

/**
 * Switch the wallet to Injective's EVM, adding the network first if the
 * wallet does not know it yet (error 4902).
 */
export async function addInjectiveToWallet(): Promise<void> {
  if (!window.ethereum) {
    throw new Error('MetaMask or EVM wallet provider not found. Please install MetaMask.')
  }

  const config = INJECTIVE_EVM_WALLET_CONFIG

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: config.chainId }],
    })
  } catch (switchError) {
    if ((switchError as { code?: number }).code !== 4902) throw switchError
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [config],
    })
  }
}

/**
 * Check if the wallet is on Injective's EVM
 */
export async function isInjectiveNetworkConnected(): Promise<boolean> {
  if (!window.ethereum) {
    return false
  }

  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' })
    return Number(chainId) === INJECTIVE_EVM.id
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
