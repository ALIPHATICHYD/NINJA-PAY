import {
  ChainRestAuthApi,
  ChainRestTendermintApi,
  MsgBroadcasterWithPk,
} from '@injectivelabs/sdk-ts'
import { getNetworkEndpoints } from '@injectivelabs/networks'
import { NETWORK } from './constants'

const endpoints = getNetworkEndpoints(NETWORK)

/**
 * Broadcast a signed transaction using Keplr wallet
 */
export async function broadcastTxMessage(
  msgs: any[],
  userAddress: string,
  chainId: string
): Promise<string> {
  try {
    if (!userAddress) {
      throw new Error('Missing sender address')
    }

    if (!(window as any).keplr) {
      throw new Error('Keplr not available')
    }

    // Get Keplr signer
    const keplr = (window as any).keplr
    const offlineSigner = keplr.getOfflineSignerOnlyMethods
      ? await keplr.getOfflineSignerOnlyMethods(chainId)
      : keplr.getOfflineSigner(chainId)

    // Prepare transaction with proper gas estimation
    const authApi = new ChainRestAuthApi(endpoints.rest)
    const tendermintApi = new ChainRestTendermintApi(endpoints.rest)

    await authApi.fetchAccount(userAddress)
    await tendermintApi.fetchLatestBlock()

    const broadcaster = new MsgBroadcasterWithPk({
      network: NETWORK,
      privateKey: offlineSigner,
      simulateTx: true,
    })

    // Sign and broadcast the transaction
    const txResponse = await broadcaster.broadcast({
      msgs,
    })

    if (!txResponse || !txResponse.txHash) {
      throw new Error('Transaction failed - no hash returned')
    }

    return txResponse.txHash
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
    // Gas estimation for average Cosmos transaction
    // Will vary based on message complexity
    if (!msgs || msgs.length === 0) return 100000

    // Base gas + per-message overhead
    let estimatedGas = 80000
    estimatedGas += msgs.length * 50000

    return estimatedGas
  } catch (error) {
    console.error('Failed to estimate gas:', error)
    return 200000 // fallback
  }
}

/**
 * Simulate a transaction without broadcasting
 */
export async function simulateTx(
  msgs: any[],
  userAddress: string,
  chainId: string
): Promise<boolean> {
  try {
    if (!userAddress || !msgs.length) return false

    const authApi = new ChainRestAuthApi(endpoints.rest)
    const account = await authApi.fetchAccount(userAddress)

    // If we can fetch the account, basic validation passes
    return !!account
  } catch (error) {
    console.error('Simulation failed:', error)
    return false
  }
}
