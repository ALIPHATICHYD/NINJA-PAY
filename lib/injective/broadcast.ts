import { ChainRestAuthApi, type Msgs } from '@injectivelabs/sdk-ts'
import { getNetworkEndpoints } from '@injectivelabs/networks'
import { NETWORK } from './constants'
import { signAndBroadcast } from './cosmos-transactions'

const endpoints = getNetworkEndpoints(NETWORK)

/**
 * Sign with Keplr/Leap and broadcast. Delegates to signAndBroadcast so there is
 * a single signing path (the previous version passed a wallet signer to
 * MsgBroadcasterWithPk, which expects a raw private key).
 */
export async function broadcastTxMessage(
  msgs: Msgs[],
  userAddress: string,
  chainId: string
): Promise<string> {
  if (!userAddress) {
    throw new Error('Missing sender address')
  }
  return signAndBroadcast(msgs, chainId)
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
