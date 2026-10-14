/**
 * Claim-link bookings, written by the server instead of the browser.
 *
 * Off unless SUPABASE_SERVICE_ROLE_KEY is set. Until then every POST answers
 * 503 UNAVAILABLE and the browser writes with the database's public key as
 * before (lib/claims-client.ts). Once it is set, and the public write policies
 * are dropped (sql/phase2-lock-claim-writes.sql), this route is the only way
 * to create a link, reserve a share or record a payout.
 *
 * A write a link holder asks for must be signed by the link's key
 * (lib/claim-proof.ts). Settling needs no signature: it only does what the
 * chain says about a claim's payout. Nothing is logged: requests carry wallet
 * addresses.
 */

import { NextResponse } from 'next/server'
import { claimRequestSigner, type NewClaimPool, type SignedClaimRequest } from '@/lib/claim-proof'
import { freeStaleShares, settleClaim } from '@/lib/claim-recovery'
import { toInjectiveAddress } from '@/lib/injective/address'
import { payoutOutcome } from '@/lib/injective/link-broadcast'
import type { ClaimShare } from '@/lib/injective/types'
import { serverClaimStore } from '@/lib/supabase-server'
import type { ClaimStore } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
// Settling looks payouts up on the chain, a few at a time.
export const maxDuration = 30

const MAX_BODY_BYTES = 16 * 1024
const MAX_SHARES = 100
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TX_HASH = /^[0-9A-F]{64}$/i
const DECIMAL = /^\d+(\.\d+)?$/
const BASE_UNITS = /^[1-9]\d*$/
const LINK_CODE = /^[0-9a-z]{6,32}$/

export const WRONG_LINK_MESSAGE = "This request wasn't signed by this claim link's key. Open the full link and try again."

const answer = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } })
const refuse = (message: string, status = 400) => answer({ status: 'REFUSED', message }, status)

const text = (value: unknown, max = 200): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= max ? value : null

/** A new pool as the browser sent it, checked field by field; null if anything is off. */
function readPool(value: unknown): NewClaimPool | null {
  if (!value || typeof value !== 'object') return null
  const p = value as Record<string, unknown>
  const creatorAddress = toInjectiveAddress(text(p.creatorAddress))
  const escrowAddress = toInjectiveAddress(text(p.escrowAddress))
  const totalAmount = text(p.totalAmount, 80)
  const linkCode = text(p.linkCode, 32)
  const name = p.name === undefined || p.name === null || p.name === '' ? undefined : text(p.name, 100)
  if (!creatorAddress || !escrowAddress || !totalAmount || !DECIMAL.test(totalAmount) || !linkCode || !LINK_CODE.test(linkCode)) return null
  if (name === null || p.claimType !== 'equal' || (p.token !== 'INJ' && p.token !== 'USDC')) return null
  if (!Array.isArray(p.shares) || p.shares.length === 0 || p.shares.length > MAX_SHARES) return null
  const shares: ClaimShare[] = []
  for (const share of p.shares as unknown[]) {
    const s = (share ?? {}) as Record<string, unknown>
    const amount = text(s.amount, 80)
    const amountBase = text(s.amountBase, 80)
    if (!amount || !DECIMAL.test(amount) || !amountBase || !BASE_UNITS.test(amountBase)) return null
    shares.push({ amount, amountBase })
  }
  return { creatorAddress, name, totalAmount, claimType: 'equal', token: p.token, escrowAddress, shares, linkCode }
}

/** Whether the request was signed by the key of the link at `linkAddress`. */
async function signedByLink(request: SignedClaimRequest, signature: unknown, linkAddress: string | null): Promise<boolean> {
  if (!linkAddress) return false
  return (await claimRequestSigner(request, signature)) === linkAddress
}

async function claimWithPool(store: ClaimStore, claimId: unknown) {
  if (typeof claimId !== 'string' || !UUID.test(claimId)) return null
  const claim = await store.getClaimById(claimId)
  if (!claim) return null
  const pool = await store.getClaimPoolById(claim.poolId)
  return pool ? { claim, pool } : null
}

export async function POST(request: Request) {
  const store = serverClaimStore()
  if (!store) return answer({ status: 'UNAVAILABLE', message: "Claim links aren't booked on the server on this deployment." }, 503)

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return refuse('Request too large.', 413)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return refuse('Not JSON.')
  }

  try {
    switch (body.action) {
      case 'create-pool': {
        const pool = readPool(body.pool)
        if (!pool) return refuse("This claim link's details are incomplete.")
        if (!(await signedByLink({ action: 'create-pool', pool }, body.signature, pool.escrowAddress))) {
          return refuse(WRONG_LINK_MESSAGE, 403)
        }
        return answer({ pool: await store.createClaimPool(pool) })
      }

      case 'reserve': {
        const claimer = toInjectiveAddress(text(body.claimer))
        if (typeof body.poolId !== 'string' || !UUID.test(body.poolId) || !claimer) return refuse('This claim is incomplete.')
        const pool = await store.getClaimPoolById(body.poolId)
        if (!pool) return refuse('This claim link does not exist.', 404)
        if (!(await signedByLink({ action: 'reserve', poolId: pool.id, claimer }, body.signature, pool.escrowAddress))) {
          return refuse(WRONG_LINK_MESSAGE, 403)
        }
        return answer(await store.reserveClaimShare(pool, claimer))
      }

      case 'record-tx': {
        const found = await claimWithPool(store, body.claimId)
        if (!found) return refuse('This claim does not exist.', 404)
        if (typeof body.txHash !== 'string' || !TX_HASH.test(body.txHash)) return refuse('This payout hash is not valid.')
        const signed = { action: 'record-tx' as const, claimId: found.claim.id, txHash: body.txHash }
        if (!(await signedByLink(signed, body.signature, found.pool.escrowAddress))) return refuse(WRONG_LINK_MESSAGE, 403)
        await store.recordClaimTx(found.claim.id, body.txHash)
        return answer({ ok: true })
      }

      case 'release': {
        const found = await claimWithPool(store, body.claimId)
        if (!found) return answer({ settled: 'released' })
        if (!(await signedByLink({ action: 'release', claimId: found.claim.id }, body.signature, found.pool.escrowAddress))) {
          return refuse(WRONG_LINK_MESSAGE, 403)
        }
        const { claim } = found
        // The browser frees a share when its payout failed. If the chain has that payout after all, it stays paid.
        if (claim.status === 'paid') return answer({ settled: 'paid' })
        if (claim.txHash && (await payoutOutcome(claim.txHash, 0, Infinity)) === 'paid') {
          await store.markClaimPaid(claim.id, claim.txHash)
          return answer({ settled: 'paid' })
        }
        await store.releaseClaim(claim.id)
        return answer({ settled: 'released' })
      }

      case 'settle': {
        if (typeof body.claimId !== 'string' || !UUID.test(body.claimId)) return refuse('This claim is incomplete.')
        const claim = await store.getClaimById(body.claimId)
        if (!claim) return answer({ settled: 'released' })
        return answer({ settled: await settleClaim(claim, Date.now(), store) })
      }

      case 'free-stale': {
        if (typeof body.poolId !== 'string' || !UUID.test(body.poolId)) return refuse('This claim link is incomplete.')
        return answer({ freed: await freeStaleShares(body.poolId, Date.now(), store) })
      }

      default:
        return refuse('Unknown action.')
    }
  } catch (error) {
    return answer({ status: 'FAILED', message: error instanceof Error && error.message ? error.message : 'The claim database did not answer. Try again.' }, 502)
  }
}
