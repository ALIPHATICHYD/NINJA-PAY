/**
 * Cosmos Transactions Manager (Simplified)
 * 
 * Handles transaction preparation, signing, and broadcasting on Injective
 * Supports Keplr and Leap wallets
 */

import { NETWORK, CHAIN_ID } from './constants'

interface TransactionOptions {
  memo?: string
}

interface SendTransactionParams {
  recipientAddress: string
  amount: string
  denom: string
  options?: TransactionOptions
}

/**
 * Initialize Keplr wallet connection
 */
export async function initializeKeplr(chainId: string = CHAIN_ID): Promise<boolean> {
  try {
    if (!(window as any).keplr) {
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
 * Get user's Injective address from connected wallet
 */
export async function getUserAddress(chainId: string = CHAIN_ID): Promise<string> {
  try {
    if (!(window as any).keplr) {
      throw new Error('Keplr extension not installed')
    }

    await (window as any).keplr.enable(chainId)
    const key = await (window as any).keplr.getKey(chainId)
    return key.bech32Address
  } catch (error) {
    console.error('Failed to get user address:', error)
    throw error
  }
}

/**
 * Simple transaction execution using Keplr's native sendTx
 * This handles signing and broadcasting automatically
 */
export async function executeSendTransaction(
  recipientAddress: string,
  amount: string,
  denom: string,
  chainId: string = CHAIN_ID,
  options?: Partial<TransactionOptions>
): Promise<string> {
  try {
    if (!(window as any).keplr) {
      throw new Error('Keplr extension not installed')
    }

    await (window as any).keplr.enable(chainId)

    // Use Keplr's built-in transaction sending capability
    // This is a simplified approach that relies on Keplr's UI for signing
    const result = await (window as any).keplr.sendCustomMessage(chainId, {
      type: 'cosmos/MsgSend',
      value: {
        from_address: await getUserAddress(chainId),
        to_address: recipientAddress,
        amount: [
          {
            denom,
            amount,
          },
        ],
      },
      fee: {
        amount: [{ denom: 'inj', amount: '5000000000000000' }],
        gas: '200000',
      },
      memo: options?.memo || '',
    })

    return result
  } catch (error) {
    console.error('Failed to execute transaction:', error)
    throw error
  }
}

/**
 * Send tokens via Keplr (alternative method using offlineSigner)
 */
export async function sendToken(
  recipientAddress: string,
  amount: string,
  chainId: string = CHAIN_ID
): Promise<string> {
  try {
    if (!(window as any).keplr) {
      throw new Error('Keplr extension not installed')
    }

    const userAddr = await getUserAddress(chainId)

    // Create MsgSend directly and let Keplr handle signing/broadcasting
    const msg = {
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      value: {
        fromAddress: userAddr,
        toAddress: recipientAddress,
        amount: [
          {
            denom: 'inj',
            amount,
          },
        ],
      },
    }

    // Use Keplr's sendTx method (simplified)
    const result = await (window as any).keplr.sendTx(chainId, [msg], 'sync')
    
    if (!result) {
      throw new Error('Transaction failed')
    }

    return result
  } catch (error) {
    console.error('Failed to send token:', error)
    throw error
  }
}

/**
 * Check if user has Keplr installed
 */
export function isKeplrAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).keplr
}

/**
 * Check if user is using Ledger with Keplr
 */
export async function isUserUsingLedger(chainId: string = CHAIN_ID): Promise<boolean> {
  try {
    if (!(window as any).keplr) return false
    
    await (window as any).keplr.enable(chainId)
    const key = await (window as any).keplr.getKey(chainId)
    
    return (key as any).isLedger || false
  } catch {
    return false
  }
}

/**
 * Request account connection from wallet
 */
export async function requestConnection(chainId: string = CHAIN_ID): Promise<string> {
  try {
    await initializeKeplr(chainId)
    return await getUserAddress(chainId)
  } catch (error) {
    console.error('Failed to connect wallet:', error)
    throw error
  }
}
