/**
 * Claim-link bookings from the browser. Each write goes to /api/claims,
 * signed by the link's key (lib/claim-proof.ts), and the server writes it.
 *
 * On a deployment where the server isn't set up for this, /api/claims answers
 * 503 UNAVAILABLE. Then the browser writes with the database's public key, as
 * NinjaPay did before, and doesn't ask the server again during this visit.
 * Reads always use the public key (lib/supabase.ts).
 */

import { signClaimRequest, type NewClaimPool } from './claim-proof'
import { freeStaleShares as freeLocally, settleClaim as settleLocally, type Settled } from './claim-recovery'
import { toInjectiveAddress } from './injective/address'
import type { ClaimPool, ClaimRecord } from './injective/types'
import * as publicDb from './supabase'

const OFF = Symbol('server not set up')
let serverOff = false

/** Forget that the server was off, so the next write asks it again. For tests. */
export function resetClaimsClient(): void {
  serverOff = false
}

async function post<T>(body: Record<string, unknown>): Promise<T | typeof OFF> {
  if (serverOff) return OFF
  let response: Response
  try {
    response = await fetch('/api/claims', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error("Couldn't reach NinjaPay. Check your connection and try again.")
  }
  const data = (await response.json().catch(() => ({}))) as { status?: string; message?: string }
  if (response.status === 503 && data.status === 'UNAVAILABLE') {
    serverOff = true
    return OFF
  }
  if (!response.ok) throw new Error(data.message || "NinjaPay couldn't save this claim. Try again.")
  return data as T
}

type PoolJson = Omit<ClaimPool, 'createdAt'> & { createdAt: string }
type ClaimJson = Omit<ClaimRecord, 'createdAt'> & { createdAt?: string }
const toPool = (p: PoolJson): ClaimPool => ({ ...p, createdAt: new Date(p.createdAt) })
const toClaim = (c: ClaimJson): ClaimRecord => ({ ...c, createdAt: c.createdAt ? new Date(c.createdAt) : undefined })

/** Save a new link, signed by its key. */
export async function createPool(newPool: NewClaimPool, linkKeyHex: string): Promise<ClaimPool> {
  // Sign the addresses in the inj1 form the server checks them in.
  const pool = {
    ...newPool,
    creatorAddress: toInjectiveAddress(newPool.creatorAddress) ?? newPool.creatorAddress,
    escrowAddress: toInjectiveAddress(newPool.escrowAddress) ?? newPool.escrowAddress,
  }
  const signature = await signClaimRequest(linkKeyHex, { action: 'create-pool', pool })
  const result = await post<{ pool: PoolJson }>({ action: 'create-pool', pool, signature })
  return result === OFF ? publicDb.createClaimPool(pool) : toPool(result.pool)
}

/** Reserve a free share of the pool for `claimer`. */
export async function reserveShare(
  pool: ClaimPool,
  claimer: string,
  linkKeyHex: string,
): Promise<{ record: ClaimRecord } | { error: 'already-claimed' | 'fully-claimed' }> {
  const address = toInjectiveAddress(claimer) ?? claimer
  const signature = await signClaimRequest(linkKeyHex, { action: 'reserve', poolId: pool.id, claimer: address })
  const result = await post<{ record: ClaimJson } | { error: 'already-claimed' | 'fully-claimed' }>({
    action: 'reserve',
    poolId: pool.id,
    claimer: address,
    signature,
  })
  if (result === OFF) return publicDb.reserveClaimShare(pool, address)
  return 'record' in result ? { record: toClaim(result.record) } : result
}

/** Save a payout's hash on its reservation before it is sent. Throws if it can't be saved. */
export async function recordPayout(claimId: string, txHash: string, linkKeyHex: string): Promise<void> {
  const signature = await signClaimRequest(linkKeyHex, { action: 'record-tx', claimId, txHash })
  const result = await post({ action: 'record-tx', claimId, txHash, signature })
  if (result === OFF) await publicDb.recordClaimTx(claimId, txHash)
}

/** Settle a pending claim against the chain: paid, still pending, or released. */
export async function settle(claim: ClaimRecord): Promise<Settled> {
  if (claim.status === 'paid') return 'paid'
  const result = await post<{ settled: Settled }>({ action: 'settle', claimId: claim.id })
  return result === OFF ? settleLocally(claim) : result.settled
}

/** Mark a claim paid once its payout landed. The server checks the chain first. */
export async function confirmPaid(claim: ClaimRecord, txHash: string): Promise<void> {
  const result = await post<{ settled: Settled }>({ action: 'settle', claimId: claim.id })
  if (result === OFF) await publicDb.markClaimPaid(claim.id, txHash)
}

/** Free a share after its payout failed. The server keeps it paid if the chain has the payout after all. */
export async function release(claimId: string, linkKeyHex: string): Promise<Settled> {
  const signature = await signClaimRequest(linkKeyHex, { action: 'release', claimId })
  const result = await post<{ settled: Settled }>({ action: 'release', claimId, signature })
  if (result !== OFF) return result.settled
  await publicDb.releaseClaim(claimId)
  return 'released'
}

/** Settle a pool's reservations older than 10 minutes. Returns how many shares were freed. */
export async function freeStale(poolId: string): Promise<number> {
  const result = await post<{ freed: number }>({ action: 'free-stale', poolId })
  return result === OFF ? freeLocally(poolId) : result.freed
}
