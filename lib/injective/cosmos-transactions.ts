/**
 * Cosmos Transactions Manager
 *
 * Handles transaction preparation, signing, and broadcasting on Injective
 * Supports Keplr and Leap wallets with proper message encoding
 */

import { GasPrice, SigningStargateClient } from '@cosmjs/stargate'
import { getNetworkEndpoints } from '@injectivelabs/networks'
import type { OfflineSigner } from '@cosmjs/proto-signing'
import { NETWORK, CHAIN_ID, DENOMS } from './constants'

const endpoints = getNetworkEndpoints(NETWORK)
const gasPrice = GasPrice.fromString(`0.025${DENOMS.INJ}`)

type CosmosWallet = {
  enable: (chainId: string) => Promise<void>
  getKey: (chainId: string) => Promise<{ bech32Address: string; isLedger?: boolean }>
  getOfflineSigner: (chainId: string) => Promise<OfflineSigner>
}

declare global {
  interface Window {
    keplr?: CosmosWallet
    leap?: CosmosWallet
  }
}

// Helper to convert amount to proper chain format
export function toChainAmount(amount: string, decimals: number = 18): string {
  const parts = amount.split('.')
  const wholePart = parts[0]
  const fracPart = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals)
  const result = wholePart + fracPart
  return result.replace(/^0+(?!$)/, '0')
}

interface TransactionOptions {
  memo?: string
}

/**
 * Check if Keplr is available
 */
export function isKeplrAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return !!window.keplr
}

/**
 * Check if Leap is available
 */
export function isLeapAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return !!window.leap
}

/**
 * Initialize Keplr wallet connection
 */
export async function initializeKeplr(chainId: string = CHAIN_ID): Promise<boolean> {
  try {
    if (!isKeplrAvailable()) {
      throw new Error('Keplr extension not installed')
    }

    await window.keplr!.enable(chainId)
    return true
  } catch (error) {
    console.error('Failed to initialize Keplr:', error)
    throw error
  }
}

/**
 * Initialize Leap wallet connection
 */
export async function initializeLeap(chainId: string = CHAIN_ID): Promise<boolean> {
  try {
    if (!isLeapAvailable()) {
      throw new Error('Leap extension not installed')
    }

    await window.leap!.enable(chainId)
    return true
  } catch (error) {
    console.error('Failed to initialize Leap:', error)
    throw error
  }
}

/**
 * Get user's Injective address from connected wallet (Keplr or Leap)
 */
export async function getUserAddress(chainId: string = CHAIN_ID): Promise<string> {
  try {
    // Try Keplr first
    if (isKeplrAvailable()) {
      try {
        await window.keplr!.enable(chainId)
        const key = await window.keplr!.getKey(chainId)
        return key.bech32Address
      } catch (err) {
        console.warn('Keplr failed:', err)
      }
    }

    // Fall back to Leap
    if (isLeapAvailable()) {
      await window.leap!.enable(chainId)
      const key = await window.leap!.getKey(chainId)
      return key.bech32Address
    }

    throw new Error('No Web3 wallet available. Please install Keplr or Leap.')
  } catch (error) {
    console.error('Failed to get user address:', error)
    throw error
  }
}

/**
 * Send tokens (INJ or USDC) via Keplr or Leap wallet
 * Properly handles both token types with correct denominations
 */
export async function sendToken(
  recipientAddress: string,
  amount: string,
  chainId: string = CHAIN_ID,
  token: 'INJ' | 'USDC' = 'INJ',
  options?: Partial<TransactionOptions>,
): Promise<string> {
  try {
    if (!recipientAddress.startsWith('inj1') || recipientAddress.length < 40) {
      throw new Error('Invalid Injective address. Must start with "inj1"')
    }

    // Validate amount
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Amount must be a positive number')
    }

    let wallet: CosmosWallet | null = null
    let walletName = ''

    if (isKeplrAvailable()) {
      wallet = window.keplr ?? null
      walletName = 'Keplr'
    } else if (isLeapAvailable()) {
      wallet = window.leap ?? null
      walletName = 'Leap'
    } else {
      throw new Error('No Web3 wallet available. Please install Keplr or Leap.')
    }

    if (!wallet) {
      throw new Error('No Web3 wallet available. Please install Keplr or Leap.')
    }

    if (!endpoints.rpc) {
      throw new Error('Injective network RPC endpoint is unavailable')
    }

    const userAddr = await getUserAddress(chainId)
    const denom = token === 'USDC' ? DENOMS.USDC : DENOMS.INJ
    const decimals = token === 'USDC' ? 6 : 18
    const chainAmount = toChainAmount(amount, decimals)

    console.log(`Sending ${amount} ${token} from ${userAddr} to ${recipientAddress} using ${walletName}`)

    const offlineSigner = await wallet.getOfflineSigner(chainId)
    const client = await SigningStargateClient.connectWithSigner(endpoints.rpc, offlineSigner, {
      gasPrice,
    })

    const txResponse = await client.sendTokens(
      userAddr,
      recipientAddress,
      [{ denom, amount: chainAmount }],
      'auto',
      options?.memo || '',
    )

    if (!txResponse || !txResponse.transactionHash) {
      throw new Error('Transaction failed - no hash returned from broadcaster')
    }

    console.log(`Transaction successful: ${txResponse.transactionHash}`)
    return txResponse.transactionHash
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to send token'
    console.error(`sendToken error for ${token}:`, error)
    throw new Error(`Failed to send ${token}: ${errorMessage}`)
  }
}


/**
 * Check if user is using Ledger with wallet (Keplr or Leap)
 */
export async function isUserUsingLedger(chainId: string = CHAIN_ID): Promise<boolean> {
  try {
    if (isKeplrAvailable()) {
      await window.keplr!.enable(chainId)
      const key = await window.keplr!.getKey(chainId)
      if (key.isLedger) return true
    }

    if (isLeapAvailable()) {
      await window.leap!.enable(chainId)
      const key = await window.leap!.getKey(chainId)
      if (key.isLedger) return true
    }

    return false
  } catch (error) {
    console.warn('Error checking Ledger status:', error)
    return false
  }
}

/**
 * Request account connection from wallet (Keplr preferred, Leap fallback)
 */
export async function requestConnection(chainId: string = CHAIN_ID): Promise<string> {
  try {
    // Try Keplr first
    if (isKeplrAvailable()) {
      try {
        await initializeKeplr(chainId)
        return await getUserAddress(chainId)
      } catch (err) {
        console.warn('Keplr connection failed, trying Leap:', err)
      }
    }

    // Try Leap
    if (isLeapAvailable()) {
      try {
        await initializeLeap(chainId)
        return await getUserAddress(chainId)
      } catch (err) {
        console.warn('Leap connection failed:', err)
      }
    }

    throw new Error('No Web3 wallet available. Please install Keplr or Leap.')
  } catch (error) {
    console.error('Failed to connect wallet:', error)
    throw error
  }
}
