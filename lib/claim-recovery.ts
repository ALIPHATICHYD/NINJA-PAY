/**
 * Recovering claims that were left pending.
 *
 * A claim reserves a share in Supabase, records the payout's hash there, then
 * sends the payout. If the claimer's tab closes, their connection drops or
 * the chain is slow, the reservation can be left `pending`. Nothing runs on a
 * schedule to clean these up: NinjaPay has no server watching claims. They
 * are settled when someone next needs them instead:
 * - the same claimer opening the link again settles their own, and
 * - a claimer who finds the link full settles everyone's stale ones.
 *
 * Once the server is set up for claim writes (SUPABASE_SERVICE_ROLE_KEY),
 * /api/claims runs the same settling with the server's database access, and a
 * daily job (/api/cron/settle-claims) settles reservations nobody came back to.
 *
 * Settling asks the chain, never guesses. A recorded payout that landed is
 * marked paid. A reservation is only freed when its payout never went out,
 * or the chain says it doesn't have it long after it could still be included.
 * Even if a freed share's payout did land late (a chain halted with its
 * mempool kept), the link can't pay out more than it holds or was approved
 * for: one claimer would be left unpaid, nothing more.
 */

import type { ClaimRecord } from './injective/types'
import { checkCosmosHealth } from './injective/health'
import { payoutOutcome } from './injective/link-broadcast'
import { getPendingClaims, markClaimPaid, markClaimsPaid, releaseClaim, releaseClaims, type ClaimStore } from './supabase'

/** The database calls settling needs. The browser's public ones unless a server store is passed. */
export type RecoveryStore = Pick<ClaimStore, 'getPendingClaims' | 'markClaimPaid' | 'markClaimsPaid' | 'releaseClaim' | 'releaseClaims'>
const browserStore: RecoveryStore = { getPendingClaims, markClaimPaid, markClaimsPaid, releaseClaim, releaseClaims }

/**
 * How old a pending reservation must be before it can be freed: much longer
 * than a claim takes (including waiting behind a crowd), and than a payout
 * stays valid (LINK_TX_TIMEOUT_BLOCKS of blocks).
 */
export const STALE_CLAIM_MS = 10 * 60_000

export type Settled = 'paid' | 'released' | 'pending'

export const CLAIM_IN_PROGRESS_MESSAGE =
  'A claim from this address is already under way, maybe in another tab. If you closed the page while claiming, try again in 10 minutes.'

/** Whether the chain is making blocks, so a payout it hasn't seen can be called lost. */
async function chainLive(now: number): Promise<boolean> {
  return (await checkCosmosHealth(new Date(now))).ok
}

/** How a pending reservation stands on the chain. Writes nothing. */
async function outcomeOf(claim: ClaimRecord, now: number, isLive: () => Promise<boolean>): Promise<Settled> {
  if (claim.status === 'paid') return 'paid'
  const age = claim.createdAt ? now - claim.createdAt.getTime() : 0

  if (claim.txHash) {
    // A chain that's stalled can't say a payout is lost, only that it hasn't seen it yet.
    const outcome = await payoutOutcome(claim.txHash, age, (await isLive()) ? STALE_CLAIM_MS : Infinity)
    if (outcome === 'paid') return 'paid'
    if (outcome === 'unknown') return 'pending'
  } else if (age <= STALE_CLAIM_MS) {
    // No payout was recorded, so none went out. It may still be on its way in another tab.
    return 'pending'
  }
  return 'released'
}

/** Settle one pending reservation against the chain. A paid one is left as it is. */
export async function settleClaim(claim: ClaimRecord, now: number = Date.now(), store: RecoveryStore = browserStore): Promise<Settled> {
  const settled = await outcomeOf(claim, now, () => chainLive(now))
  if (settled === 'paid' && claim.status !== 'paid' && claim.txHash) await store.markClaimPaid(claim.id, claim.txHash)
  if (settled === 'released') await store.releaseClaim(claim.id)
  return settled
}

/** Settle a pool's stale reservations. Returns how many shares were freed. */
export async function freeStaleShares(poolId: string, now: number = Date.now(), store: RecoveryStore = browserStore): Promise<number> {
  const stale = (await store.getPendingClaims(poolId)).filter(c => c.createdAt && now - c.createdAt.getTime() > STALE_CLAIM_MS)
  return settleAll(stale, now, store)
}

/**
 * Settle claims a few at a time, so a long list doesn't flood the chain's API.
 * The chain's health is asked once for the whole list, and the results are
 * written in one update and one delete rather than one write per claim.
 * Returns how many were freed.
 */
export async function settleAll(claims: ClaimRecord[], now: number, store: RecoveryStore, batch = 5): Promise<number> {
  let live: Promise<boolean> | undefined
  const isLive = () => (live ??= chainLive(now))
  const paid: string[] = []
  const released: string[] = []
  for (let i = 0; i < claims.length; i += batch) {
    const slice = claims.slice(i, i + batch)
    const settled = await Promise.all(slice.map(c => outcomeOf(c, now, isLive).catch((): Settled => 'pending')))
    slice.forEach((claim, j) => {
      if (settled[j] === 'paid' && claim.status !== 'paid') paid.push(claim.id)
      if (settled[j] === 'released') released.push(claim.id)
    })
  }
  await store.markClaimsPaid(paid)
  await store.releaseClaims(released)
  return released.length
}
