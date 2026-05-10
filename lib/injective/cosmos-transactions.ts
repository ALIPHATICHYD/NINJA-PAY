/**
 * Cosmos Transactions Manager
 *
 * Handles transaction preparation, signing, and broadcasting on Injective
 * Supports Keplr and Leap wallets with proper message encoding
 */

import {
  MsgSend,
  MsgBroadcasterWithPk,
  getNetworkEndpoints,
  SigningStargateClient,
} from '@injectivelabs/sdk-ts'
import { NETWORK, CHAIN_ID, DENOMS } from './constants'

const endpoints = getNetworkEndpoints(NETWORK)

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
  return !!(window as any).keplr
}

/**
 * Check if Leap is available
 */
export function isLeapAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).leap
}

/**
 * Initialize Keplr wallet connection
 */
export async function initializeKeplr(chainId: string = CHAIN_ID): Promise<boolean> {
  try {
    if (!isKeplrAvailable()) {
      throw new Error('Keplr extension not installed')
    }

    await (window as any).keplr.enable(chainId)
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

    await (window as any).leap.enable(chainId)
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
        await (window as any).keplr.enable(chainId)
        const key = await (window as any).keplr.getKey(chainId)
        return key.bech32Address
      } catch (err) {
        console.warn('Keplr failed:', err)
      }
    }

    // Fall back to Leap
    if (isLeapAvailable()) {
      await (window as any).leap.enable(chainId)
      const key = await (window as any).leap.getKey(chainId)
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
    // Validate recipient address format
    if (!recipientAddress.startsWith('inj1') || recipientAddress.length < 40) {
      throw new Error('Invalid Injective address. Must start with "inj1"')
    }

    // Validate amount
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Amount must be a positive number')
    }

    // Get wallet signer
    let wallet: any = null
    let walletName: string = ''

    if (isKeplrAvailable()) {
      wallet = (window as any).keplr
      walletName = 'Keplr'
    } else if (isLeapAvailable()) {
      wallet = (window as any).leap
      walletName = 'Leap'
    } else {
      throw new Error('No Web3 wallet available. Please install Keplr or Leap.')
    }

    const userAddr = await getUserAddress(chainId)
    const denom = token === 'USDC' ? DENOMS.USDC : DENOMS.INJ
    const decimals = token === 'USDC' ? 6 : 18
    const chainAmount = toChainAmount(amount, decimals)

    console.log(`Sending ${amount} ${token} from ${userAddr} to ${recipientAddress} using ${walletName}`)

    // Create MsgSend message using Injective SDK
    const msgSend = MsgSend.fromJSON({
      srcInjectiveAddress: userAddr,
      dstInjectiveAddress: recipientAddress,
      amount: {
        denom,
        amount: chainAmount,
      },
    })

    // Get offline signer from wallet
    const offlineSigner = wallet.getOfflineSignerOnlyMethods
      ? await wallet.getOfflineSignerOnlyMethods(chainId)
      : await wallet.getOfflineSigner(chainId)

    // Broadcast transaction
    const broadcaster = new MsgBroadcasterWithPk({
      chainId,
      msgs: msgSend,
      injectiveAddress: userAddr,
      signer: offlineSigner,
      simulateGas: true,
    })

    const txResponse = await broadcaster.broadcast()

    if (!txResponse || !txResponse.txhash) {
      throw new Error('Transaction failed - no hash returned from broadcaster')
    }

    console.log(`Transaction successful: ${txResponse.txhash}`)
    return txResponse.txhash
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to send token'
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
      await (window as any).keplr.enable(chainId)
      const key = await (window as any).keplr.getKey(chainId)
      if ((key as any).isLedger) return true
    }

    if (isLeapAvailable()) {
      await (window as any).leap.enable(chainId)
      const key = await (window as any).leap.getKey(chainId)
      if ((key as any).isLedger) return true
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
