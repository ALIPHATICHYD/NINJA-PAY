import { GasPrice, SigningStargateClient } from '@cosmjs/stargate'
import type { EncodeObject, OfflineSigner } from '@cosmjs/proto-signing'
import { getNetworkEndpoints } from '@injectivelabs/networks'
import { NETWORK, DENOMS } from './constants'

const endpoints = getNetworkEndpoints(NETWORK)
const gasPrice = GasPrice.fromString(`0.025${DENOMS.INJ}`)

type CosmosWallet = {
  enable: (chainId: string) => Promise<void>
  getOfflineSigner: (chainId: string) => Promise<OfflineSigner>
}

function getWallet() {
  if (typeof window === 'undefined') {
    throw new Error('Cosmos wallet is only available in the browser')
  }

  const browserWindow = window as Window & { keplr?: CosmosWallet; leap?: CosmosWallet }

  if (browserWindow.keplr) return browserWindow.keplr
  if (browserWindow.leap) return browserWindow.leap

  throw new Error('No Cosmos wallet available. Please install Keplr or Leap.')
}

export async function broadcastTxMessage(
  msgs: EncodeObject[],
  userAddress: string,
  chainId: string,
): Promise<string> {
  if (!userAddress) {
    throw new Error('Missing sender address')
  }

  if (!endpoints.rpc) {
    throw new Error('Injective network RPC endpoint is unavailable')
  }

  const wallet = getWallet()
  await wallet.enable(chainId)
  const offlineSigner = await wallet.getOfflineSigner(chainId)
  const client = await SigningStargateClient.connectWithSigner(endpoints.rpc, offlineSigner, {
    gasPrice,
  })

  const response = await client.signAndBroadcast(userAddress, msgs, 'auto')
  if (!response.transactionHash) {
    throw new Error('Transaction failed - no hash returned')
  }

  return response.transactionHash
}

export async function estimateGas(msgs: EncodeObject[], _userAddress: string): Promise<number> {
  if (!msgs || msgs.length === 0) return 100000
  return 80000 + msgs.length * 50000
}

export async function simulateTx(msgs: EncodeObject[], userAddress: string, _chainId: string): Promise<boolean> {
  return !!userAddress && Array.isArray(msgs) && msgs.length > 0
}
