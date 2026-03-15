import {
  WalletStrategy,
  Wallet as InjectiveWallet,
  WalletStrategyArguments,
} from '@injectivelabs/wallet-ts'
import { ChainGrpcBankApi } from '@injectivelabs/sdk-ts'
import { getNetworkEndpoints } from '@injectivelabs/networks'
import { NETWORK, CHAIN_ID } from './constants'
import { BalanceState } from './types'

let walletStrategy: WalletStrategy | null = null

/**
 * Initialize wallet strategy for Keplr or Leap wallet
 */
export async function initWalletStrategy(
  walletType: 'keplr' | 'leap'
): Promise<WalletStrategy> {
  const wallet =
    walletType === 'keplr' ? InjectiveWallet.Keplr : InjectiveWallet.Leap

  const args: WalletStrategyArguments = {
    chainId: CHAIN_ID,
    wallet: wallet,
  }

  walletStrategy = new WalletStrategy(args)

  // Attempt to get addresses to verify connection
  try {
    await walletStrategy.getAddresses()
  } catch (error) {
    console.error('Failed to initialize wallet:', error)
    walletStrategy = null
    throw error
  }

  return walletStrategy
}

/**
 * Get the current wallet strategy instance
 */
export function getWalletStrategy(): WalletStrategy {
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
