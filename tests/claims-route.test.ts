import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { signClaimRequest, type NewClaimPool } from '@/lib/claim-proof'
import { createEscrowKey } from '@/lib/injective/claim-escrow'
import { toInjectiveAddress } from '@/lib/injective/address'
import type { ClaimPool, ClaimRecord } from '@/lib/injective/types'

// An in-memory stand-in for the service-role database, and a scripted chain.
const state = vi.hoisted(() => ({
  configured: true,
  pools: [] as ClaimPool[],
  claims: [] as ClaimRecord[],
  outcomes: new Map<string, 'paid' | 'failed' | 'unknown'>(),
}))

vi.mock('@/lib/supabase-server', () => ({
  serviceSupabase: () => null,
  serverClaimStore: () =>
    state.configured
      ? {
          async createClaimPool(pool: Omit<ClaimPool, 'id' | 'createdAt'>) {
            const row = { ...pool, id: randomUUID(), createdAt: new Date() }
            state.pools.push(row)
            return row
          },
          getClaimPoolById: async (id: string) => state.pools.find(p => p.id === id) ?? null,
          getClaimById: async (id: string) => state.claims.find(c => c.id === id) ?? null,
          async reserveClaimShare(pool: ClaimPool, claimer: string) {
            if (state.claims.some(c => c.poolId === pool.id && c.claimerAddress === claimer)) return { error: 'already-claimed' }
            const free = pool.shares.findIndex((_, i) => !state.claims.some(c => c.poolId === pool.id && c.shareIndex === i))
            if (free < 0) return { error: 'fully-claimed' }
            const record: ClaimRecord = { id: randomUUID(), poolId: pool.id, shareIndex: free, claimerAddress: claimer, txHash: null, status: 'pending', createdAt: new Date() }
            state.claims.push(record)
            return { record }
          },
          async recordClaimTx(id: string, txHash: string) {
            const claim = state.claims.find(c => c.id === id && c.status === 'pending')
            if (claim) claim.txHash = txHash
          },
          getPendingClaims: async (poolId: string) => state.claims.filter(c => c.poolId === poolId && c.status === 'pending'),
          async markClaimPaid(id: string, txHash: string) {
            Object.assign(state.claims.find(c => c.id === id)!, { status: 'paid', txHash })
          },
          async releaseClaim(id: string) {
            state.claims = state.claims.filter(c => !(c.id === id && c.status === 'pending'))
          },
        }
      : null,
}))
vi.mock('@/lib/injective/link-broadcast', () => ({
  payoutOutcome: async (hash: string, ageMs: number, staleAfterMs: number) => {
    const outcome = state.outcomes.get(hash) ?? 'unknown'
    return outcome === 'unknown' && ageMs > staleAfterMs ? 'failed' : outcome
  },
}))
vi.mock('@/lib/injective/health', () => ({ checkCosmosHealth: async () => ({ ok: true }) }))

const { POST, WRONG_LINK_MESSAGE, BUSY_MESSAGE } = await import('@/app/api/claims/route')

// Each test calls from its own address, so the per-network limit starts fresh.
let ip = 0
beforeEach(() => { ip += 1 })
const call = async (body: unknown) => {
  const response = await POST(new Request('http://localhost/api/claims', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'x-forwarded-for': `203.0.113.${ip}, 10.0.0.1` },
  }))
  return { status: response.status, body: await response.json() }
}

const link = createEscrowKey()
const stranger = createEscrowKey()
const HASH = 'AB'.repeat(32)
const A = createEscrowKey().address
const B = createEscrowKey().address
const newPool = (escrowAddress = link.address): NewClaimPool => ({
  creatorAddress: createEscrowKey().address,
  name: 'Team bonus',
  totalAmount: '2',
  claimType: 'equal',
  token: 'INJ',
  escrowAddress,
  shares: [{ amount: '1', amountBase: '1000000000000000000' }, { amount: '1', amountBase: '1000000000000000000' }],
  linkCode: 'abc123def456',
})

async function seedPool(): Promise<ClaimPool> {
  const pool = { ...newPool(), id: randomUUID(), createdAt: new Date() }
  state.pools.push(pool)
  return pool
}
async function reserve(pool: ClaimPool, claimer: string, key = link.privateKeyHex) {
  return call({ action: 'reserve', poolId: pool.id, claimer, signature: await signClaimRequest(key, { action: 'reserve', poolId: pool.id, claimer }) })
}

beforeEach(() => {
  state.configured = true
  state.pools = []
  state.claims = []
  state.outcomes = new Map()
})

describe('the claims route', () => {
  it('answers UNAVAILABLE until the server has its database key', async () => {
    state.configured = false
    const { status, body } = await call({ action: 'settle', claimId: randomUUID() })
    expect(status).toBe(503)
    expect(body.status).toBe('UNAVAILABLE')
  })

  it("saves a new link only when the link's own key signed it", async () => {
    const pool = newPool()
    const signed = await call({ action: 'create-pool', pool, signature: await signClaimRequest(link.privateKeyHex, { action: 'create-pool', pool }) })
    expect(signed.status).toBe(200)
    expect(signed.body.pool.escrowAddress).toBe(link.address)
    expect(state.pools).toHaveLength(1)

    const forged = await call({ action: 'create-pool', pool, signature: await signClaimRequest(stranger.privateKeyHex, { action: 'create-pool', pool }) })
    expect(forged).toEqual({ status: 403, body: { status: 'REFUSED', message: WRONG_LINK_MESSAGE } })
    expect(state.pools).toHaveLength(1)
  })

  it("turns down a link whose details don't add up", async () => {
    for (const pool of [
      { ...newPool(), token: 'DOGE' },
      { ...newPool(), shares: [] },
      { ...newPool(), shares: [{ amount: '1', amountBase: '0' }] },
      { ...newPool(), linkCode: '../x' },
      { ...newPool(), escrowAddress: 'nope' },
    ]) {
      const { status } = await call({ action: 'create-pool', pool, signature: `0x${'00'.repeat(65)}` })
      expect(status).toBe(400)
    }
  })

  it('reserves a share for a request signed by the link, and refuses one signed by any other key', async () => {
    const pool = await seedPool()
    const claimer = A
    expect((await reserve(pool, claimer, stranger.privateKeyHex)).status).toBe(403)
    expect(state.claims).toHaveLength(0)

    const { status, body } = await reserve(pool, claimer)
    expect(status).toBe(200)
    expect(body.record).toMatchObject({ poolId: pool.id, claimerAddress: claimer, status: 'pending' })
    expect((await reserve(pool, claimer)).body).toEqual({ error: 'already-claimed' })
  })

  it('stores an EVM claimer under its inj1 address', async () => {
    const pool = await seedPool()
    const evm = privateKeyToAccount(generatePrivateKey()).address
    const inj = toInjectiveAddress(evm)!
    // The browser signs the inj1 form; the server checks the same text.
    const { body } = await call({ action: 'reserve', poolId: pool.id, claimer: evm, signature: await signClaimRequest(link.privateKeyHex, { action: 'reserve', poolId: pool.id, claimer: inj }) })
    expect(body.record.claimerAddress).toBe(inj)
  })

  it("records a payout's hash only with the link's signature", async () => {
    const pool = await seedPool()
    const { body } = await reserve(pool, A)
    const claimId = body.record.id
    const sign = (key: string) => signClaimRequest(key, { action: 'record-tx', claimId, txHash: HASH })
    expect((await call({ action: 'record-tx', claimId, txHash: HASH, signature: await sign(stranger.privateKeyHex) })).status).toBe(403)
    expect((await call({ action: 'record-tx', claimId, txHash: 'not-a-hash', signature: await sign(link.privateKeyHex) })).status).toBe(400)
    expect((await call({ action: 'record-tx', claimId, txHash: HASH, signature: await sign(link.privateKeyHex) })).body).toEqual({ ok: true })
    expect(state.claims[0].txHash).toBe(HASH)
  })

  it('marks a claim paid only once the chain has its payout', async () => {
    const pool = await seedPool()
    const claimId = (await reserve(pool, A)).body.record.id
    state.claims[0].txHash = HASH
    expect((await call({ action: 'settle', claimId })).body).toEqual({ settled: 'pending' })
    state.outcomes.set(HASH, 'paid')
    expect((await call({ action: 'settle', claimId })).body).toEqual({ settled: 'paid' })
    expect(state.claims[0].status).toBe('paid')
  })

  it('frees a share when the link says its payout failed, unless the chain has that payout', async () => {
    const pool = await seedPool()
    const claimId = (await reserve(pool, A)).body.record.id
    const release = async (key = link.privateKeyHex) =>
      call({ action: 'release', claimId, signature: await signClaimRequest(key, { action: 'release', claimId }) })

    expect((await release(stranger.privateKeyHex)).status).toBe(403)
    state.claims[0].txHash = HASH
    state.outcomes.set(HASH, 'paid')
    expect((await release()).body).toEqual({ settled: 'paid' })
    expect(state.claims[0].status).toBe('paid')

    const otherId = (await reserve(pool, B)).body.record.id
    const releaseOther = await call({ action: 'release', claimId: otherId, signature: await signClaimRequest(link.privateKeyHex, { action: 'release', claimId: otherId }) })
    expect(releaseOther.body).toEqual({ settled: 'released' })
    expect(state.claims.map(c => c.id)).toEqual([claimId])
  })

  it('frees stale shares in a pool for anyone, by asking the chain', async () => {
    const pool = await seedPool()
    const old = new Date(Date.now() - 11 * 60_000)
    state.claims.push(
      { id: randomUUID(), poolId: pool.id, shareIndex: 0, claimerAddress: 'inj1a', txHash: null, status: 'pending', createdAt: old },
      { id: randomUUID(), poolId: pool.id, shareIndex: 1, claimerAddress: 'inj1b', txHash: HASH, status: 'pending', createdAt: old },
    )
    state.outcomes.set(HASH, 'paid')
    expect((await call({ action: 'free-stale', poolId: pool.id })).body).toEqual({ freed: 1 })
    expect(state.claims.map(c => [c.shareIndex, c.status])).toEqual([[1, 'paid']])
  })

  it('slows down one network that floods it, and no one else', async () => {
    for (let i = 0; i < 200; i++) await call({ action: 'settle', claimId: randomUUID() })
    expect(await call({ action: 'settle', claimId: randomUUID() })).toEqual({ status: 429, body: { status: 'REFUSED', message: BUSY_MESSAGE } })
    ip += 1
    expect((await call({ action: 'settle', claimId: randomUUID() })).status).toBe(200)
  })

  it('refuses requests it cannot read', async () => {
    expect((await POST(new Request('http://localhost/api/claims', { method: 'POST', body: '{' }))).status).toBe(400)
    expect((await call({ action: 'drop-table' })).status).toBe(400)
    expect((await call({ action: 'settle', claimId: "1' or '1'='1" })).status).toBe(400)
    expect((await call({ action: 'reserve', poolId: randomUUID(), claimer: 'inj1a' })).status).toBe(400)
  })
})
