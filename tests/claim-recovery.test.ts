import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaimRecord } from '@/lib/injective/types'

const state = vi.hoisted(() => ({
  pending: [] as ClaimRecord[],
  outcomes: new Map<string, 'paid' | 'failed' | 'unknown'>(),
  live: true,
  staleAfter: [] as number[],
  paid: [] as [string, string][],
  released: [] as string[],
}))

vi.mock('@/lib/supabase', () => ({
  getPendingClaims: async () => state.pending,
  markClaimPaid: async (id: string, hash: string) => { state.paid.push([id, hash]) },
  releaseClaim: async (id: string) => { state.released.push(id) },
}))
vi.mock('@/lib/injective/health', () => ({
  checkCosmosHealth: async () => (state.live ? { ok: true } : { ok: false, reason: 'stalled' }),
}))
vi.mock('@/lib/injective/link-broadcast', () => ({
  payoutOutcome: async (hash: string, ageMs: number, staleAfterMs: number) => {
    state.staleAfter.push(staleAfterMs)
    const outcome = state.outcomes.get(hash) ?? 'unknown'
    return outcome === 'unknown' && ageMs > staleAfterMs ? 'failed' : outcome
  },
}))

const { STALE_CLAIM_MS, freeStaleShares, settleClaim } = await import('@/lib/claim-recovery')

const NOW = Date.UTC(2026, 9, 13, 12)
const claim = (id: string, ageMs: number, txHash: string | null = null): ClaimRecord => ({
  id, poolId: 'pool', shareIndex: 0, claimerAddress: 'inj1x', txHash, status: 'pending', createdAt: new Date(NOW - ageMs),
})

beforeEach(() => {
  state.pending = []
  state.outcomes = new Map()
  state.live = true
  state.staleAfter = []
  state.paid = []
  state.released = []
})

describe('settling a pending claim', () => {
  it('marks it paid when its payout landed, at any age', async () => {
    state.outcomes.set('H', 'paid')
    expect(await settleClaim(claim('c1', 1_000, 'H'), NOW)).toBe('paid')
    expect(state.paid).toEqual([['c1', 'H']])
  })

  it('frees it when its payout ran and failed', async () => {
    state.outcomes.set('H', 'failed')
    expect(await settleClaim(claim('c1', 1_000, 'H'), NOW)).toBe('released')
    expect(state.released).toEqual(['c1'])
  })

  it('keeps it while its payout could still land', async () => {
    expect(await settleClaim(claim('c1', 60_000, 'H'), NOW)).toBe('pending')
    expect(state.released).toEqual([])
  })

  it('frees it once the chain says its payout never landed, long after it could', async () => {
    expect(await settleClaim(claim('c1', STALE_CLAIM_MS + 1, 'H'), NOW)).toBe('released')
  })

  it("never calls a payout lost while the chain is stalled", async () => {
    state.live = false
    expect(await settleClaim(claim('c1', 10 * STALE_CLAIM_MS, 'H'), NOW)).toBe('pending')
    expect(state.staleAfter).toEqual([Infinity])
  })

  it('frees a reservation that never sent a payout, but only once it is stale', async () => {
    expect(await settleClaim(claim('c1', 60_000), NOW)).toBe('pending')
    expect(await settleClaim(claim('c2', STALE_CLAIM_MS + 1), NOW)).toBe('released')
    expect(state.released).toEqual(['c2'])
  })
})

describe('freeing stale shares when a link looks full', () => {
  it('settles only stale reservations and counts the freed ones', async () => {
    state.outcomes.set('LANDED', 'paid')
    state.pending = [
      claim('fresh', 60_000),
      claim('abandoned', STALE_CLAIM_MS + 1),
      claim('landed', STALE_CLAIM_MS + 1, 'LANDED'),
      claim('lost', STALE_CLAIM_MS + 1, 'LOST'),
    ]
    expect(await freeStaleShares('pool', NOW)).toBe(2)
    expect(state.released.sort()).toEqual(['abandoned', 'lost'])
    expect(state.paid).toEqual([['landed', 'LANDED']])
  })
})
