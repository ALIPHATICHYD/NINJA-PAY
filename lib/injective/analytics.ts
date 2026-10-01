/**
 * Totals for the Analytics page over whole days: from midnight (local time)
 * at the start of the window up to now.
 *
 * Totals count only what was loaded, so the page keeps reading older history
 * until every source has reached the window's first day (`coveredSince` from
 * `mergeSources`) and says so when it stops short. Amounts per token are
 * exact sums of base units. Dollar values use today's oracle price, are
 * indicative, and leave out tokens Injective has no price for instead of
 * hiding the whole total.
 *
 * Moves between the user's own connected accounts aren't counted as sent or
 * received, and claim reclaims are the user's own funds coming back.
 */

import { eachDayOfInterval, eachWeekOfInterval, format, max, startOfDay, startOfWeek, subDays } from 'date-fns'
import { coinValue, pricedAs, type ActivityCoin, type ActivityItem, type ActivityType } from './activity'
import { toInjectiveAddress } from './address'
import { usdValue, type Prices } from '../prices'

export type Period = '7D' | '30D' | '90D'

export const PERIOD_DAYS: Record<Period, number> = { '7D': 7, '30D': 30, '90D': 90 }

/** Midnight, local time, at the start of the window: today counts as one of its days. */
export const periodStart = (period: Period, now: Date) => startOfDay(subDays(now, PERIOD_DAYS[period] - 1))

export type TokenTotal = {
  token: string
  denom: string
  decimals: number
  verified: boolean
  sentBase: bigint
  receivedBase: bigint
}

export type Bar = { key: number; label: string; usd: number }

export type WindowSummary = {
  start: Date
  /** Dollar value of priced tokens only; see `unpriced`. */
  sentUsd: number
  receivedUsd: number
  /** Tokens moved in the window that have no current price, so are left out of dollar values. */
  unpriced: string[]
  /** Distinct transactions, not transfers: a payroll run is one. */
  transactions: number
  counterparties: number
  tokens: TokenTotal[]
  bars: Bar[]
  breakdown: { type: ActivityType; count: number; pct: number }[]
}

/** One coin with its amount replaced, for formatting a total. */
export const totalCoin = (total: TokenTotal, amountBase: bigint): ActivityCoin => ({
  token: total.token,
  denom: total.denom,
  decimals: total.decimals,
  verified: total.verified,
  amountBase: amountBase.toString(),
})

export function summarizeWindow(
  items: ActivityItem[],
  { period, now, prices, mine }: { period: Period; now: Date; prices: Prices; mine: ReadonlySet<string> },
): WindowSummary {
  const start = periodStart(period, now)
  const isMine = (address: string) => mine.has(toInjectiveAddress(address) ?? address)
  const others = (tx: ActivityItem) => (tx.recipients ?? [tx.counterparty]).filter(a => !isMine(a))

  const inWindow = items.filter(
    tx => tx.success && tx.timestamp >= start && tx.timestamp <= now && others(tx).length > 0,
  )
  // Claim reclaims are listed but aren't money received.
  const counted = inWindow.filter(tx => tx.type !== 'claim-reclaim')

  const tokens = new Map<string, TokenTotal>()
  const unpriced = new Set<string>()
  const usdOf = new Map<ActivityItem, number>()
  let sentUsd = 0
  let receivedUsd = 0

  for (const tx of counted) {
    let usd = 0
    for (const coin of tx.coins) {
      const key = coin.denom.toLowerCase()
      const total = tokens.get(key) ?? { token: coin.token, denom: coin.denom, decimals: coin.decimals, verified: coin.verified, sentBase: BigInt(0), receivedBase: BigInt(0) }
      if (tx.direction === 'out') total.sentBase += BigInt(coin.amountBase)
      else total.receivedBase += BigInt(coin.amountBase)
      tokens.set(key, total)
      const value = usdValue(coinValue(coin), pricedAs(coin), prices)
      if (value === null) unpriced.add(coin.verified ? coin.token : `${coin.token} (unverified)`)
      else usd += value
    }
    usdOf.set(tx, usd)
    if (tx.direction === 'out') sentUsd += usd
    else receivedUsd += usd
  }

  // A bar per day for a week, otherwise per week starting Monday. The first
  // week can start before the window, so it is labelled from the window's start.
  const weekly = period !== '7D'
  const bucketOf = (date: Date) => (weekly ? startOfWeek(date, { weekStartsOn: 1 }) : startOfDay(date))
  const bars: Bar[] = (weekly ? eachWeekOfInterval({ start, end: now }, { weekStartsOn: 1 }) : eachDayOfInterval({ start, end: now })).map(
    bucket => ({ key: bucket.getTime(), label: format(max([bucket, start]), weekly ? 'd MMM' : 'EEE'), usd: 0 }),
  )
  for (const tx of counted) {
    const bar = bars.find(b => b.key === bucketOf(tx.timestamp).getTime())
    if (bar) bar.usd += usdOf.get(tx) ?? 0
  }

  // Counted once per transaction and kind, so a payroll run or a transaction
  // with two sends to different people is one.
  const kinds = new Map<ActivityType, Set<string>>()
  inWindow.forEach(tx => kinds.set(tx.type, (kinds.get(tx.type) ?? new Set()).add(tx.hash)))
  const pairs = [...kinds.values()].reduce((n, hashes) => n + hashes.size, 0) || 1
  const breakdown = [...kinds.entries()]
    .map(([type, hashes]) => ({ type, count: hashes.size, pct: Math.round((hashes.size / pairs) * 100) }))
    .sort((a, b) => b.count - a.count)

  const rank = (t: TokenTotal) => (pricedAs(totalCoin(t, BigInt(0))) ? 0 : t.verified ? 1 : 2)
  return {
    start,
    sentUsd,
    receivedUsd,
    unpriced: [...unpriced].sort(),
    transactions: new Set(inWindow.map(tx => tx.hash)).size,
    counterparties: new Set(inWindow.flatMap(tx => others(tx).map(a => toInjectiveAddress(a) ?? a))).size,
    tokens: [...tokens.values()].sort((a, b) => rank(a) - rank(b) || a.token.localeCompare(b.token)),
    bars,
    breakdown,
  }
}
