/**
 * A receipt for one transaction, read from the chain each time it is shown.
 *
 * NinjaPay stores nothing for a receipt: the link carries only the
 * transaction hash, which is public on Injective anyway, and the details
 * come from the chain. Storing receipts on a server would make them personal
 * data under Nigeria's NDPA, which is a compliance question still open.
 *
 * - Cosmos hashes (64 hex digits) are read from the chain's REST API,
 *   GET /cosmos/tx/v1beta1/txs/{hash}.
 * - EVM hashes (0x plus 64 hex digits) are read over EVM JSON-RPC: the
 *   transaction, its receipt for status and ERC-20 Transfer logs, and its
 *   block for the time.
 *
 * An EVM transaction's fee is its gas limit times its fee cap
 * (maxFeePerGas, or gasPrice for older transaction types). Injective charges
 * that up front and refunds no unused gas, so gasUsed x effectiveGasPrice
 * from the receipt can be lower than what was paid.
 * Source: injective-core v1.20.3, injective-chain/modules/evm/types/msg.go
 * (MsgEthereumTx.GetFee) and modules/evm/keeper/gas.go (RefundGas returns
 * without refunding). Checked on a local chain by tests/e2e/evm.e2e.ts.
 */

import { createPublicClient, erc20Abi, getAddress, http, parseEventLogs, type Hash } from 'viem'
import { ENDPOINTS, INJECTIVE_EVM, isEvmTxHash } from './network'
import { INJ } from './tokens'
import { toCoins, type ActivityCoin } from './activity'

export type ReceiptTransfer = { from: string; to: string; coin: ActivityCoin }

export type Receipt = {
  hash: string
  status: 'confirmed' | 'failed' | 'pending'
  /** The chain's reason when a Cosmos transaction failed. */
  failure?: string
  timestamp: Date | null
  block: string | null
  fee: ActivityCoin | null
  memo: string
  transfers: ReceiptTransfer[]
  /** Messages or calls in the transaction that aren't transfers. */
  otherActions: number
}

export const isTxHash = (hash: string) => isEvmTxHash(hash) || /^[0-9a-fA-F]{64}$/.test(hash)

type Coin = { denom: string; amount: string }
type RestTx = {
  tx?: { body?: { memo?: string; messages?: Record<string, unknown>[] }; auth_info?: { fee?: { amount?: Coin[] } } }
  tx_response?: { txhash: string; height: string; code: number; raw_log?: string; timestamp?: string }
}

/** The transfers in a Cosmos transaction's messages: MsgSend and MsgMultiSend. */
export function cosmosTransfers(messages: Record<string, unknown>[]): { transfers: ReceiptTransfer[]; otherActions: number } {
  const transfers: ReceiptTransfer[] = []
  let otherActions = 0
  for (const msg of messages) {
    const kind = String(msg['@type']).split('.').pop()
    if (kind === 'MsgSend') {
      const coins = toCoins((msg.amount as Coin[] | undefined) ?? [])
      coins.forEach(coin => transfers.push({ from: String(msg.from_address), to: String(msg.to_address), coin }))
    } else if (kind === 'MsgMultiSend') {
      const inputs = (msg.inputs as { address: string }[] | undefined) ?? []
      const from = inputs.length === 1 ? inputs[0].address : `${inputs.length} senders`
      for (const output of (msg.outputs as { address: string; coins: Coin[] }[] | undefined) ?? []) {
        toCoins(output.coins).forEach(coin => transfers.push({ from, to: output.address, coin }))
      }
    } else {
      otherActions++
    }
  }
  return { transfers, otherActions }
}

async function cosmosReceipt(hash: string): Promise<Receipt | null> {
  const response = await fetch(`${ENDPOINTS.rest}/cosmos/tx/v1beta1/txs/${hash.toUpperCase()}`, { signal: AbortSignal.timeout(15_000) })
  if (response.status === 404) return null
  const data = (await response.json().catch(() => ({}))) as RestTx & { code?: number; message?: string }
  if (!response.ok) {
    if (/not found/i.test(data.message ?? '')) return null
    throw new Error(`Injective returned HTTP ${response.status}`)
  }
  const result = data.tx_response
  if (!result) return null
  const fee = data.tx?.auth_info?.fee?.amount?.[0]
  return {
    hash: result.txhash,
    status: result.code === 0 ? 'confirmed' : 'failed',
    failure: result.code === 0 ? undefined : result.raw_log,
    timestamp: result.timestamp ? new Date(result.timestamp) : null,
    block: result.height,
    fee: fee ? toCoins([fee])[0] : null,
    memo: data.tx?.body?.memo ?? '',
    ...cosmosTransfers(data.tx?.body?.messages ?? []),
  }
}

async function evmReceipt(hash: Hash): Promise<Receipt | null> {
  const client = createPublicClient({ chain: INJECTIVE_EVM, transport: http(ENDPOINTS.evmRpc) })
  const tx = await client.getTransaction({ hash }).catch(error => {
    if ((error as Error).name === 'TransactionNotFoundError') return null
    throw error
  })
  if (!tx) return null

  const transfers: ReceiptTransfer[] = []
  if (tx.value > BigInt(0) && tx.to) {
    transfers.push({ from: tx.from, to: tx.to, coin: toCoins([{ denom: INJ.denom, amount: tx.value.toString() }])[0] })
  }
  const receipt = await client.getTransactionReceipt({ hash }).catch(error => {
    if ((error as Error).name === 'TransactionReceiptNotFoundError') return null
    throw error
  })
  if (!receipt) {
    return { hash, status: 'pending', timestamp: null, block: null, fee: null, memo: '', transfers, otherActions: 0 }
  }

  const logs = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs, strict: false })
  for (const log of logs) {
    const { from, to, value } = log.args
    if (!from || !to || value === undefined || value === BigInt(0)) continue
    transfers.push({ from, to, coin: toCoins([{ denom: `erc20:${getAddress(log.address)}`, amount: value.toString() }])[0] })
  }
  const block = await client.getBlock({ blockNumber: receipt.blockNumber })
  return {
    hash,
    status: receipt.status === 'success' ? 'confirmed' : 'failed',
    timestamp: new Date(Number(block.timestamp) * 1000),
    block: receipt.blockNumber.toString(),
    fee: toCoins([{ denom: INJ.denom, amount: (tx.gas * (tx.maxFeePerGas ?? tx.gasPrice ?? receipt.effectiveGasPrice)).toString() }])[0],
    memo: '',
    transfers,
    otherActions: transfers.length === 0 ? 1 : 0,
  }
}

/** The receipt for a transaction hash, or null if the chain has no such transaction. */
export async function fetchReceipt(hash: string): Promise<Receipt | null> {
  if (!isTxHash(hash)) return null
  return isEvmTxHash(hash) ? evmReceipt(hash as Hash) : cosmosReceipt(hash)
}
