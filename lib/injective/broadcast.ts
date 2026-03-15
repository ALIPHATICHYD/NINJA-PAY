import { MsgBroadcaster } from '@injectivelabs/sdk-ts'
import { getNetworkEndpoints } from '@injectivelabs/networks'
import { NETWORK, CHAIN_ID } from './constants'
import { getWalletStrategy } from './wallet'

const endpoints = getNetworkEndpoints(NETWORK)

/**
 * Broadcast a transaction message to the Injective chain
 * Handles fee estimation, signing, and streaming
 */
export async function broadcastTxMessage(
  msg: any,
  userAddress: string
): Promise<string> {
  try {
    const walletStrategy = getWalletStrategy()

    const msgBroadcaster = new MsgBroadcaster({
      walletStrategy,
      network: NETWORK,
    })

    // Prepare the message with user address
    const preparedMsg = {
      ...msg,
      srcInjectiveAddress:
        msg.srcInjectiveAddress || userAddress || undefined,
    }

    // Broadcast the transaction
    const response = await msgBroadcaster.broadcast({
      msgs: [preparedMsg],
      injectiveAddress: userAddress,
    })

    // Return transaction hash
    if (response.txHash) {
      return response.txHash
    }

    throw new Error('No transaction hash returned')
  } catch (error) {
    console.error('Failed to broadcast transaction:', error)
    throw error
  }
}

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(
  msgs: any[],
  userAddress: string
): Promise<number> {
  try {
    const walletStrategy = getWalletStrategy()

    const msgBroadcaster = new MsgBroadcaster({
      walletStrategy,
      network: NETWORK,
    })

    // Estimate gas
    const gasEstimate = await msgBroadcaster.estimateGasLimit(
      msgs.map((msg) => ({
        ...msg,
        srcInjectiveAddress: userAddress,
      }))
    )

    return gasEstimate
  } catch (error) {
    console.error('Failed to estimate gas:', error)
    // Return a reasonable default
    return 200000
  }
}

/**
 * Simulate a transaction without broadcasting
 */
export async function simulateTx(
  msgs: any[],
  userAddress: string
): Promise<boolean> {
  try {
    const walletStrategy = getWalletStrategy()

    const msgBroadcaster = new MsgBroadcaster({
      walletStrategy,
      network: NETWORK,
    })

    // Simulate the transaction
    await msgBroadcaster.simulate({
      msgs: msgs.map((msg) => ({
        ...msg,
        srcInjectiveAddress: userAddress,
      })),
      injectiveAddress: userAddress,
    })

    return true
  } catch (error) {
    console.error('Transaction simulation failed:', error)
    return false
  }
}

/**
 * Get transaction status by hash
 */
export async function getTxStatus(txHash: string): Promise<any> {
  try {
    // This would require an indexer query
    // For now, return a placeholder
    return {
      status: 'pending',
      hash: txHash,
    }
  } catch (error) {
    console.error('Failed to fetch transaction status:', error)
    throw error
  }
}
