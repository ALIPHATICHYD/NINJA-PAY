/**
 * Transfers sent from EVM wallets, read from Blockscout.
 *
 * Injective's indexer covers bank messages; a MetaMask transfer is an EVM
 * transaction instead, so it is read from Blockscout's API:
 * - /addresses/{0x}/transactions for INJ sent as a transaction's value.
 * - /addresses/{0x}/token-transfers?type=ERC-20 for ERC-20 transfers such
 *   as USDC, in either direction.
 *
 * Pending transactions are left out until they are in a block. Zero-value
 * token transfers are left out too: they are how address-poisoning spam puts
 * a look-alike address in someone's history.
 *
 * Field names follow Blockscout's API v2 views (transaction_view.ex,
 * token_transfer_view.ex and token_view.ex in blockscout/blockscout, checked
 * 2026-10-01). Older Blockscout releases named two fields differently
 * (`tx_hash`, `token.address`), so both are read.
 */

import { getAddress } from 'viem'
import { BLOCKSCOUT_API } from './network'
import { INJ } from './tokens'
import { toInjectiveAddress } from './address'
import { parseTimestamp, toCoins, type ActivityDraft, type ActivityPage } from './activity'

type BlockscoutAddress = { hash?: string | null } | null | undefined

export type BlockscoutTx = {
  hash: string
  timestamp: string | null
  status: 'ok' | 'error' | null
  value: string | null
  from: BlockscoutAddress
  to: BlockscoutAddress
}

export type BlockscoutTokenTransfer = {
  transaction_hash?: string
  tx_hash?: string
  timestamp: string | null
  from: BlockscoutAddress
  to: BlockscoutAddress
  total?: { value?: string | null } | null
  token?: { address_hash?: string | null; address?: string | null } | null
  token_type?: string | null
}

type BlockscoutPage<T> = { items?: T[]; next_page_params?: Record<string, string | number | null> | null }

/** Our side and the other side of a transfer, or null if it isn't ours. */
function sides(from: BlockscoutAddress, to: BlockscoutAddress, mine: ReadonlySet<string>) {
  const fromHash = from?.hash ?? ''
  const toHash = to?.hash ?? ''
  if (mine.has(toInjectiveAddress(fromHash) ?? '')) return { direction: 'out' as const, counterparty: toHash }
  if (mine.has(toInjectiveAddress(toHash) ?? '')) return { direction: 'in' as const, counterparty: fromHash }
  return null
}

const checksum = (address: string) => {
  try { return getAddress(address) } catch { return address }
}

const isPositive = (value: string | null | undefined) => /^\d+$/.test(value ?? '') && BigInt(value!) > BigInt(0)

/** INJ sent as an EVM transaction's value, if the transaction moved any. */
export function parseEvmTx(tx: BlockscoutTx, mine: ReadonlySet<string>): ActivityDraft | null {
  const timestamp = parseTimestamp(tx.timestamp)
  if (!timestamp || tx.status === null || !isPositive(tx.value)) return null
  const side = sides(tx.from, tx.to, mine)
  if (!side) return null
  return {
    hash: tx.hash,
    timestamp,
    success: tx.status === 'ok',
    direction: side.direction,
    counterparty: checksum(side.counterparty),
    coins: toCoins([{ denom: INJ.denom, amount: tx.value! }]),
    memo: '',
    isMulti: false,
  }
}

/** An ERC-20 transfer, named by its `erc20:` denom like the bank side does. */
export function parseTokenTransfer(transfer: BlockscoutTokenTransfer, mine: ReadonlySet<string>): ActivityDraft | null {
  const timestamp = parseTimestamp(transfer.timestamp)
  const hash = transfer.transaction_hash ?? transfer.tx_hash
  const token = transfer.token?.address_hash ?? transfer.token?.address
  const value = transfer.total?.value
  if (!timestamp || !hash || !token || !isPositive(value)) return null
  if (transfer.token_type && transfer.token_type !== 'ERC-20') return null
  const side = sides(transfer.from, transfer.to, mine)
  if (!side) return null
  return {
    hash,
    timestamp,
    success: true, // Blockscout only has token transfers from transactions that succeeded.
    direction: side.direction,
    counterparty: checksum(side.counterparty),
    coins: toCoins([{ denom: `erc20:${checksum(token)}`, amount: value! }]),
    memo: '',
    isMulti: false,
  }
}

async function getPage<T>(path: string, cursor: string | null): Promise<BlockscoutPage<T>> {
  const response = await fetch(`${BLOCKSCOUT_API}${path}${cursor ? `${path.includes('?') ? '&' : '?'}${cursor}` : ''}`, {
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Blockscout returned HTTP ${response.status}`)
  return response.json() as Promise<BlockscoutPage<T>>
}

/** Blockscout's next_page_params as a query string, or null on the last page. */
function nextCursor(params: BlockscoutPage<unknown>['next_page_params']): string | null {
  if (!params) return null
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value !== null && value !== undefined) query.set(key, String(value)) })
  return query.toString() || null
}

const oldest = (timestamps: (string | null)[]) => {
  const times = timestamps.map(parseTimestamp).filter((t): t is Date => t !== null)
  return times.length ? new Date(Math.min(...times.map(t => t.getTime()))) : null
}

/** One page of INJ value transfers to or from an EVM address. */
export async function fetchEvmTxPage(evmAddress: string, mine: ReadonlySet<string>, cursor: string | null): Promise<ActivityPage> {
  const page = await getPage<BlockscoutTx>(`/addresses/${evmAddress}/transactions`, cursor)
  const items = page.items ?? []
  return {
    drafts: items.map(tx => parseEvmTx(tx, mine)).filter((d): d is ActivityDraft => d !== null),
    next: nextCursor(page.next_page_params),
    reached: oldest(items.map(tx => tx.timestamp)),
  }
}

/** One page of ERC-20 transfers to or from an EVM address. */
export async function fetchEvmTokenPage(evmAddress: string, mine: ReadonlySet<string>, cursor: string | null): Promise<ActivityPage> {
  const page = await getPage<BlockscoutTokenTransfer>(`/addresses/${evmAddress}/token-transfers?type=ERC-20`, cursor)
  const items = page.items ?? []
  return {
    drafts: items.map(t => parseTokenTransfer(t, mine)).filter((d): d is ActivityDraft => d !== null),
    next: nextCursor(page.next_page_params),
    reached: oldest(items.map(t => t.timestamp)),
  }
}
