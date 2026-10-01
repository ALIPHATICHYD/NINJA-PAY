/**
 * On-chain activity for the connected accounts, from two places:
 *
 * - Injective's indexer (its explorer API) for bank transfers signed on the
 *   Cosmos side, with Keplr, Leap or a claim escrow: MsgSend and MsgMultiSend.
 * - Blockscout for transfers sent from an EVM wallet such as MetaMask: INJ
 *   sent as a transaction's value, and ERC-20 transfers such as USDC (see
 *   evm-activity.ts).
 *
 * Each source is read a page at a time, newest first, and the feed merges
 * them into one list. The chain is the source of truth: nothing here is
 * cached or mocked.
 *
 * Source (checked 2026-10-01):
 * https://docs.injective.network/developers-native/query-indexer/explorer
 * (IndexerRestExplorerApi on `${endpoints.explorer}/api/explorer/v1`,
 * fetchAccountTransactions with limit and skip). Message values are the
 * chain's JSON with snake_case fields, as sdk-ts's own explorer transformer
 * reads them (`message.value.from_address`).
 */

import { IndexerRestExplorerApi } from '@injectivelabs/sdk-ts'
import { ENDPOINTS } from './network'
import { INJ, USDC, sameDenom } from './tokens'
import { labelDenom, type TokenMap } from './token-list'
import { toInjectiveAddress } from './address'

export type ActivityType = 'send' | 'receive' | 'claim-fund' | 'claim-received' | 'claim-reclaim' | 'payroll'

export type ActivityCoin = {
  /** A display name only: see `pricedAs` for what the coin actually is. */
  token: 'INJ' | 'USDC' | string
  denom: string
  amountBase: string
  decimals: number
  /** False when neither NinjaPay nor Injective's verified token list knows the denom. */
  verified: boolean
}

export type ActivityItem = {
  hash: string
  timestamp: Date
  type: ActivityType
  direction: 'out' | 'in'
  /** The other side of the transfer (for payroll, the number of recipients) */
  counterparty: string
  /** For a payroll you sent, everyone it paid. */
  recipients?: string[]
  coins: ActivityCoin[]
  success: boolean
  /** Extra context, e.g. the claim pool name */
  label?: string
}

/** Claim-pool escrow lookup, injected so this module does not depend on Supabase. */
export type EscrowInfo = { poolName: string; creatorAddress: string }
export type EscrowResolver = (addresses: string[]) => Promise<Map<string, EscrowInfo>>

export const MEMO_PAYROLL = 'ninjapay:payroll'

export function toCoins(amount: { denom: string; amount: string }[]): ActivityCoin[] {
  return amount.map(c => ({ denom: c.denom, amountBase: c.amount, ...labelDenom(c.denom) }))
}

/** Names every coin from Injective's token list, once it has loaded. */
export function withTokenNames(items: ActivityItem[], list: TokenMap): ActivityItem[] {
  if (list.size === 0) return items
  return items.map(item => ({ ...item, coins: item.coins.map(c => ({ ...c, ...labelDenom(c.denom, list) })) }))
}

/** Which priced token a coin is, by exact denom only, never by its name. */
export function pricedAs(coin: ActivityCoin): 'INJ' | 'USDC' | null {
  if (sameDenom(coin.denom, INJ.denom)) return 'INJ'
  if (sameDenom(coin.denom, USDC.denom)) return 'USDC'
  return null
}

/** A transfer before it is labelled as a send, payroll or claim. */
export type ActivityDraft = Omit<ActivityItem, 'type' | 'label'> & { memo: string; isMulti: boolean }

/** One page from one source. `reached` is the oldest time the page covered, even if nothing on it was a transfer. */
export type ActivityPage = { drafts: ActivityDraft[]; next: string | null; reached: Date | null }

export const ACTIVITY_PAGE_SIZE = 50

/**
 * A timestamp from the indexer or Blockscout. Accepts ISO 8601 and Go's
 * default format ("2026-10-01 09:55:34.613 +0000 UTC"); null if neither.
 */
export function parseTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  const go = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)? ([+-]\d{2})(\d{2})/.exec(text)
  const date = go ? new Date(`${go[1]}T${go[2]}${(go[3] ?? '').slice(0, 4)}${go[4]}:${go[5]}`) : new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

type Coin = { denom: string; amount: string }
type BankMessage = {
  from_address?: string
  to_address?: string
  amount?: Coin[]
  inputs?: { address: string; coins: Coin[] }[]
  outputs?: { address: string; coins: Coin[] }[]
}

/** A transaction as sdk-ts's IndexerRestExplorerApi returns it. */
export type ExplorerTx = {
  hash: string
  blockTimestamp: string | number
  code: number
  memo?: string
  messages: { type: string; message: unknown }[]
}

/**
 * A Cosmos transaction hash as the chain's REST API and InjScan write it.
 * The indexer returns it as 0x plus lowercase hex (checked on testnet,
 * 2026-10-01), which reads as an EVM hash everywhere else in the app.
 */
export const cosmosTxHash = (hash: string) => hash.replace(/^0x/i, '').toUpperCase()

/** The bank transfers in an indexer transaction that touch one of `mine` (inj1 addresses). */
export function parseExplorerTx(tx: ExplorerTx, mine: ReadonlySet<string>): ActivityDraft[] {
  const timestamp = parseTimestamp(tx.blockTimestamp)
  if (!timestamp) return []
  const base = { hash: cosmosTxHash(tx.hash), timestamp, success: tx.code === 0, memo: tx.memo ?? '' }
  const drafts: ActivityDraft[] = []
  for (const { type, message } of tx.messages ?? []) {
    const kind = String(type).split('.').pop()
    const msg = (message ?? {}) as BankMessage
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
        const recipients = outputs.map(o => o.address)
        drafts.push({ ...base, direction: 'out', counterparty: `${outputs.length} recipients`, recipients, coins: toCoins(input.coins), isMulti: true })
      } else {
        outputs.filter(o => mine.has(o.address)).forEach(o =>
          drafts.push({ ...base, direction: 'in', counterparty: inputs[0]?.address ?? 'unknown', coins: toCoins(o.coins), isMulti: true }),
        )
      }
    }
  }
  return drafts
}

/** One page of an account's Cosmos transactions from Injective's indexer. `cursor` is the number to skip. */
export async function fetchCosmosPage(address: string, mine: ReadonlySet<string>, cursor: string | null): Promise<ActivityPage> {
  const skip = Number(cursor ?? 0)
  const api = new IndexerRestExplorerApi(`${ENDPOINTS.explorer}/api/explorer/v1`)
  const { transactions } = await api.fetchAccountTransactions({ account: address, params: { skip, limit: ACTIVITY_PAGE_SIZE } })
  const txs = transactions as ExplorerTx[]
  const times = txs.map(tx => parseTimestamp(tx.blockTimestamp)).filter((t): t is Date => t !== null)
  return {
    drafts: txs.flatMap(tx => parseExplorerTx(tx, mine)),
    next: txs.length < ACTIVITY_PAGE_SIZE ? null : String(skip + txs.length),
    reached: times.length ? new Date(Math.min(...times.map(t => t.getTime()))) : null,
  }
}

/** Where a source has got to: what it has loaded and where to continue. */
export type SourceState = { drafts: ActivityDraft[]; next: string | null; reached: Date | null }

const coinKey = (coins: ActivityCoin[]) => coins.map(c => `${c.denom.toLowerCase()}:${c.amountBase}`).join('+')

// The docs don't say whether a bank send of an erc20: denom also appears in
// Blockscout as a token transfer, so a transfer seen on both sides within a
// minute, between the same accounts, for the same amount is listed once.
const SAME_TRANSFER_MS = 60_000

/**
 * The transfers that can be shown so far, newest first. A source with more
 * pages holds back anything older than the oldest point it has reached, so
 * pages from different sources never show out of order.
 *
 * `coveredSince` is the time from which the list is complete: null when
 * every source has been read to its first transaction.
 */
export function mergeSources(sources: SourceState[]): { drafts: ActivityDraft[]; hasMore: boolean; coveredSince: Date | null } {
  const pending = sources.filter(s => s.next !== null && s.reached !== null)
  const frontier = pending.length ? Math.max(...pending.map(s => s.reached!.getTime())) : -Infinity

  const seen = new Set<string>()
  const all: ActivityDraft[] = []
  for (const draft of sources.flatMap(s => s.drafts)) {
    // The same Cosmos transaction comes back once per connected account.
    const key = `${draft.hash}|${draft.direction}|${draft.counterparty}|${coinKey(draft.coins)}`
    if (seen.has(key)) continue
    seen.add(key)
    all.push(draft)
  }
  const cosmos = all.filter(d => !d.hash.startsWith('0x'))
  const merged = all.filter(d => {
    if (!d.hash.startsWith('0x')) return true
    const other = toInjectiveAddress(d.counterparty)
    return !cosmos.some(c =>
      c.direction === d.direction &&
      toInjectiveAddress(c.counterparty) === other &&
      coinKey(c.coins) === coinKey(d.coins) &&
      Math.abs(c.timestamp.getTime() - d.timestamp.getTime()) <= SAME_TRANSFER_MS,
    )
  })

  return {
    drafts: merged.filter(d => d.timestamp.getTime() >= frontier).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    hasMore: sources.some(s => s.next !== null),
    coveredSince: pending.length ? new Date(frontier) : null,
  }
}

/** Labels transfers as sends, payroll or claims. Claim escrows are matched by counterparty. */
export function classifyActivity(drafts: ActivityDraft[], mine: ReadonlySet<string>, escrows: ReadonlyMap<string, EscrowInfo>): ActivityItem[] {
  return drafts.map(({ memo, isMulti, ...d }) => {
    const escrow = escrows.get(d.counterparty)
    let type: ActivityType = d.direction === 'out' ? 'send' : 'receive'
    if (escrow && d.direction === 'out') type = 'claim-fund'
    else if (escrow && d.direction === 'in') type = mine.has(escrow.creatorAddress) ? 'claim-reclaim' : 'claim-received'
    else if (d.direction === 'out' && (isMulti || memo === MEMO_PAYROLL)) type = 'payroll'
    return { ...d, type, label: escrow?.poolName }
  })
}

/** Base units to a human-readable string, without floating point. */
export function formatCoinAmount(coin: ActivityCoin, maxFractionDigits = 6): string {
  if (coin.decimals === 0) return coin.amountBase
  const digits = coin.amountBase.padStart(coin.decimals + 1, '0')
  const whole = digits.slice(0, -coin.decimals)
  const frac = digits.slice(-coin.decimals).slice(0, maxFractionDigits).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

/** "1.5 INJ", or a raw amount and short denom marked unverified. */
export function formatCoin(coin: ActivityCoin, maxFractionDigits = 6): string {
  return `${formatCoinAmount(coin, maxFractionDigits)} ${coin.token}${coin.verified ? '' : ' (unverified)'}`
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
