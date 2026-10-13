import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { claimRequestSigner } from '@/lib/claim-proof'
import { createEscrowKey } from '@/lib/injective/claim-escrow'
import type { ClaimPool, ClaimRecord } from '@/lib/injective/types'

const publicDb = vi.hoisted(() => ({
  reserveClaimShare: vi.fn(),
  recordClaimTx: vi.fn(),
  releaseClaim: vi.fn(),
  markClaimPaid: vi.fn(),
  createClaimPool: vi.fn(),
}))
vi.mock('@/lib/supabase', () => publicDb)
const recovery = vi.hoisted(() => ({ settleClaim: vi.fn(), freeStaleShares: vi.fn() }))
vi.mock('@/lib/claim-recovery', () => recovery)

const client = await import('@/lib/claims-client')

const link = createEscrowKey()
const claimer = createEscrowKey().address
const pool: ClaimPool = {
  id: 'f0f0f0f0-0000-4000-8000-000000000001', creatorAddress: claimer, totalAmount: '1', claimType: 'equal', token: 'INJ',
  escrowAddress: link.address, shares: [{ amount: '1', amountBase: '1' }], linkCode: 'abc123def456', createdAt: new Date(),
}
const claim: ClaimRecord = { id: 'c1', poolId: pool.id, shareIndex: 0, claimerAddress: claimer, txHash: null, status: 'pending' }

let sent: Record<string, unknown>[] = []
const serve = (answer: (body: Record<string, unknown>) => [number, unknown]) =>
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    sent.push(body)
    const [status, json] = answer(body)
    return new Response(JSON.stringify(json), { status })
  }))

beforeEach(() => {
  sent = []
  client.resetClaimsClient()
  for (const fn of [...Object.values(publicDb), ...Object.values(recovery)]) fn.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('the claims client, with the server set up', () => {
  it('sends each write signed by the link, and never writes with the public key', async () => {
    serve(body => body.action === 'reserve'
      ? [200, { record: { ...claim, createdAt: '2026-10-13T12:00:00.000Z' } }]
      : [200, { ok: true }])
    const reserved = await client.reserveShare(pool, claimer, link.privateKeyHex)
    expect('record' in reserved && reserved.record.createdAt).toEqual(new Date('2026-10-13T12:00:00.000Z'))
    await client.recordPayout('c1', 'AB'.repeat(32), link.privateKeyHex)

    expect(sent.map(b => b.action)).toEqual(['reserve', 'record-tx'])
    expect(await claimRequestSigner({ action: 'reserve', poolId: pool.id, claimer }, sent[0].signature)).toBe(link.address)
    expect(await claimRequestSigner({ action: 'record-tx', claimId: 'c1', txHash: 'AB'.repeat(32) }, sent[1].signature)).toBe(link.address)
    expect(publicDb.reserveClaimShare).not.toHaveBeenCalled()
    expect(publicDb.recordClaimTx).not.toHaveBeenCalled()
  })

  it("passes on the server's refusal, so a payout isn't sent unrecorded", async () => {
    serve(() => [502, { status: 'FAILED', message: "Couldn't save your claim before sending it, so nothing was sent. Try again." }])
    await expect(client.recordPayout('c1', 'AB'.repeat(32), link.privateKeyHex)).rejects.toThrow(/nothing was sent/)
    expect(publicDb.recordClaimTx).not.toHaveBeenCalled()
  })

  it('lets the server settle claims and free stale shares', async () => {
    serve(body => [200, body.action === 'settle' ? { settled: 'paid' } : { freed: 2 }])
    expect(await client.settle(claim)).toBe('paid')
    expect(await client.freeStale(pool.id)).toBe(2)
    expect(recovery.settleClaim).not.toHaveBeenCalled()
  })
})

describe('the claims client, before the server is set up', () => {
  it('writes with the public key, as before, and stops asking the server', async () => {
    serve(() => [503, { status: 'UNAVAILABLE', message: 'off' }])
    publicDb.reserveClaimShare.mockResolvedValue({ record: claim })
    publicDb.releaseClaim.mockResolvedValue(undefined)
    recovery.settleClaim.mockResolvedValue('pending')

    expect(await client.reserveShare(pool, claimer, link.privateKeyHex)).toEqual({ record: claim })
    expect(await client.release('c1', link.privateKeyHex)).toBe('released')
    expect(await client.settle(claim)).toBe('pending')
    await client.confirmPaid(claim, 'AB'.repeat(32))

    expect(sent).toHaveLength(1)
    expect(publicDb.reserveClaimShare).toHaveBeenCalledWith(pool, claimer)
    expect(publicDb.releaseClaim).toHaveBeenCalledWith('c1')
    expect(publicDb.markClaimPaid).toHaveBeenCalledWith('c1', 'AB'.repeat(32))
  })
})
