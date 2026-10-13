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
import { getPendingClaims, markClaimPaid, releaseClaim } from './supabase'

/**
 * How old a pending reservation must be before it can be freed: much longer
 * than a claim takes (including waiting behind a crowd), and than a payout
 * stays valid (LINK_TX_TIMEOUT_BLOCKS of blocks).
 */
export const STALE_CLAIM_MS = 10 * 60_000

export type Settled = 'paid' | 'released' | 'pending'

export const CLAIM_IN_PROGRESS_MESSAGE =
  'A claim from this address is already under way, maybe in another tab. If you closed the page while claiming, try again in 10 minutes.'

/** Settle one pending reservation against the chain. A paid one is left as it is. */
export async function settleClaim(claim: ClaimRecord, now: number = Date.now()): Promise<Settled> {
  if (claim.status === 'paid') return 'paid'
  const age = claim.createdAt ? now - claim.createdAt.getTime() : 0

  if (claim.txHash) {
    // A chain that's stalled can't say a payout is lost, only that it hasn't seen it yet.
    const live = (await checkCosmosHealth(new Date(now))).ok
    const outcome = await payoutOutcome(claim.txHash, age, live ? STALE_CLAIM_MS : Infinity)
    if (outcome === 'paid') {
      await markClaimPaid(claim.id, claim.txHash)
      return 'paid'
    }
    if (outcome === 'unknown') return 'pending'
  } else if (age <= STALE_CLAIM_MS) {
    // No payout was recorded, so none went out. It may still be on its way in another tab.
    return 'pending'
  }
  await releaseClaim(claim.id)
  return 'released'
}

/** Settle a pool's stale reservations. Returns how many shares were freed. */
export async function freeStaleShares(poolId: string, now: number = Date.now()): Promise<number> {
  const stale = (await getPendingClaims(poolId)).filter(c => c.createdAt && now - c.createdAt.getTime() > STALE_CLAIM_MS)
  const settled = await Promise.all(stale.map(c => settleClaim(c, now).catch((): Settled => 'pending')))
  return settled.filter(s => s === 'released').length
}
