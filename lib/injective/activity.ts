/**
 * On-chain activity for Injective (Cosmos) accounts, read from the chain's
 * REST API. The chain is the source of truth: nothing here is cached or mocked.
 *
 * Covers bank transfers (MsgSend, MsgMultiSend) on the network in network.ts.
 * Transfers sent from an EVM wallet (MetaMask) are EVM transactions on the
 * same chain and are not parsed here yet.
 */

import { getNetworkEndpoints } from '@injectivelabs/networks'
import { NETWORK } from './constants'
import { INJ, USDC, LEGACY_PEGGY_USDC_DENOM } from './tokens'

export type ActivityType = 'send' | 'receive' | 'claim-fund' | 'claim-received' | 'claim-reclaim' | 'payroll'

export type ActivityCoin = { token: 'INJ' | 'USDC' | string; denom: string; amountBase: string; decimals: number }

export type ActivityItem = {
  hash: string
  timestamp: Date
  type: ActivityType
  direction: 'out' | 'in'
  /** The other side of the transfer (for payroll, the number of recipients) */
  counterparty: string
  coins: ActivityCoin[]
  success: boolean
  /** Extra context, e.g. the claim pool name */
  label?: string
}

/** Claim-pool escrow lookup, injected so this module does not depend on Supabase. */
export type EscrowInfo = { poolName: string; creatorAddress: string }
export type EscrowResolver = (addresses: string[]) => Promise<Map<string, EscrowInfo>>

export const MEMO_PAYROLL = 'ninjapay:payroll'

// Keyed by lowercase denom: erc20: denoms may arrive checksummed or not.
const KNOWN_DENOMS: Record<string, { token: string; decimals: number }> = {
  [INJ.denom.toLowerCase()]: { token: INJ.symbol, decimals: INJ.decimals },
  [USDC.denom.toLowerCase()]: { token: USDC.symbol, decimals: USDC.decimals },
  // Polygon USDC.e used before the move to native USDC. Not Circle's native USDC.
  [LEGACY_PEGGY_USDC_DENOM.toLowerCase()]: { token: 'USDC.e (legacy)', decimals: 6 },
  // Peggy-bridged USDT handed out by the Injective testnet faucet
  peggy0x87ab3b4c8661e07d6372361211b96ed4dc36b1b5: { token: 'USDT', decimals: 6 },
}

function toCoins(amount: { denom: string; amount: string }[]): ActivityCoin[] {
  return amount.map(c => {
    const known = KNOWN_DENOMS[c.denom.toLowerCase()]
    return {
      denom: c.denom,
      amountBase: c.amount,
      token: known?.token ?? (c.denom.length > 12 ? `${c.denom.slice(0, 10)}…` : c.denom),
      decimals: known?.decimals ?? 0,
    }
  })
}

type RestCoin = { denom: string; amount: string }

type RestMsg = {
  '@type': string
  from_address?: string
  to_address?: string
  amount?: RestCoin[]
  inputs?: { address: string; coins: RestCoin[] }[]
  outputs?: { address: string; coins: RestCoin[] }[]
}

type RestTx = {
  txhash: string
  timestamp: string
  code: number
  tx: { body: { memo?: string; messages: RestMsg[] } }
}

async function searchTxs(query: string, limit: number): Promise<RestTx[]> {
  const { rest } = getNetworkEndpoints(NETWORK)
  const params = new URLSearchParams({
    query,
    order_by: 'ORDER_BY_DESC',
    'pagination.limit': String(limit),
  })
  const response = await fetch(`${rest}/cosmos/tx/v1beta1/txs?${params}`)
  if (!response.ok) throw new Error(`Could not load transaction history (HTTP ${response.status}).`)
  const data: { tx_responses?: RestTx[] } = await response.json()
  return data.tx_responses ?? []
}

/**
 * Load bank-transfer activity for the given Injective addresses (inj1...).
 * Returns newest first, de-duplicated across addresses.
 */
export async function fetchActivity(
  addresses: string[],
  { limit = 100, resolveEscrows }: { limit?: number; resolveEscrows?: EscrowResolver } = {},
): Promise<ActivityItem[]> {
  const mine = new Set(addresses.filter(a => a?.startsWith('inj1')))
  if (mine.size === 0) return []

  const batches = await Promise.all(
    [...mine].flatMap(address => [
      searchTxs(`message.sender='${address}'`, limit),
      searchTxs(`transfer.recipient='${address}'`, limit),
    ]),
  )
  const txs = new Map<string, RestTx>()
  batches.flat().forEach(tx => txs.set(tx.txhash, tx))

  // Parse bank transfers that touch one of our addresses.
  type Draft = Omit<ActivityItem, 'type'> & { memo: string; isMulti: boolean }
  const drafts: Draft[] = []
  for (const tx of txs.values()) {
    const memo = tx.tx.body.memo ?? ''
    for (const msg of tx.tx.body.messages) {
      const kind = String(msg['@type']).split('.').pop()
      const base = { hash: tx.txhash, timestamp: new Date(tx.timestamp), success: tx.code === 0, memo }

      if (kind === 'MsgSend') {
        const from = msg.from_address ?? ''
        const to = msg.to_address ?? ''
        const coins = toCoins(msg.amount ?? [])
        if (mine.has(from)) drafts.push({ ...base, direction: 'out', counterparty: to, coins, isMulti: false })
        else if (mine.has(to)) drafts.push({ ...base, direction: 'in', counterparty: from, coins, isMulti: false })
      } else if (kind === 'MsgMultiSend') {
        const inputs = msg.inputs ?? []
        const outputs = msg.outputs ?? []
        const input = inputs.find(i => mine.has(i.address))
        if (input) {
          drafts.push({ ...base, direction: 'out', counterparty: `${outputs.length} recipients`, coins: toCoins(input.coins), isMulti: true })
        } else {
          outputs.filter(o => mine.has(o.address)).forEach(o =>
            drafts.push({ ...base, direction: 'in', counterparty: inputs[0]?.address ?? 'unknown', coins: toCoins(o.coins), isMulti: true }),
          )
        }
      }
    }
  }

  // Identify claim-escrow counterparties so claim activity is labelled as such.
  const escrows = resolveEscrows
    ? await resolveEscrows([...new Set(drafts.map(d => d.counterparty).filter(a => a.startsWith('inj1')))]).catch(() => new Map<string, EscrowInfo>())
    : new Map<string, EscrowInfo>()

  const items: ActivityItem[] = drafts.map(({ memo, isMulti, ...d }) => {
    const escrow = escrows.get(d.counterparty)
    let type: ActivityType = d.direction === 'out' ? 'send' : 'receive'
    if (escrow && d.direction === 'out') type = 'claim-fund'
    else if (escrow && d.direction === 'in') type = mine.has(escrow.creatorAddress) ? 'claim-reclaim' : 'claim-received'
    else if (d.direction === 'out' && (isMulti || memo === MEMO_PAYROLL)) type = 'payroll'
    return { ...d, type, label: escrow?.poolName }
  })

  return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

/** Base units to a human-readable string, without floating point. */
export function formatCoinAmount(coin: ActivityCoin, maxFractionDigits = 6): string {
  if (coin.decimals === 0) return coin.amountBase
  const digits = coin.amountBase.padStart(coin.decimals + 1, '0')
  const whole = digits.slice(0, -coin.decimals)
  const frac = digits.slice(-coin.decimals).slice(0, maxFractionDigits).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

/** Numeric value of a coin, for charts and USD totals (float is fine for display). */
export function coinValue(coin: ActivityCoin): number {
  return coin.decimals === 0 ? 0 : Number(coin.amountBase) / 10 ** coin.decimals
}

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  send: 'Sent',
  receive: 'Received',
  'claim-fund': 'Claim funded',
  'claim-received': 'Claim received',
  'claim-reclaim': 'Claim reclaimed',
  payroll: 'Payroll',
}
