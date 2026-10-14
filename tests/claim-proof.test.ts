import { describe, expect, it } from 'vitest'
import { claimProofMessage, claimRequestSigner, signClaimRequest, type NewClaimPool } from '@/lib/claim-proof'
import { createEscrowKey } from '@/lib/injective/claim-escrow'

const link = createEscrowKey()
const pool: NewClaimPool = {
  creatorAddress: 'inj1creator',
  name: 'Team bonus',
  totalAmount: '3',
  claimType: 'equal',
  token: 'INJ',
  escrowAddress: link.address,
  shares: [{ amount: '1.5', amountBase: '1500000000000000000' }, { amount: '1.5', amountBase: '1500000000000000000' }],
  linkCode: 'abc123def456',
}

describe('claim link proofs', () => {
  it("names the link's own address as the signer", async () => {
    const request = { action: 'reserve' as const, poolId: 'pool-1', claimer: 'inj1claimer' }
    const signature = await signClaimRequest(link.privateKeyHex, request)
    expect(await claimRequestSigner(request, signature)).toBe(link.address)
  })

  it('binds the signature to everything the request acts on', async () => {
    const signature = await signClaimRequest(link.privateKeyHex, { action: 'reserve', poolId: 'pool-1', claimer: 'inj1claimer' })
    expect(await claimRequestSigner({ action: 'reserve', poolId: 'pool-2', claimer: 'inj1claimer' }, signature)).not.toBe(link.address)
    expect(await claimRequestSigner({ action: 'reserve', poolId: 'pool-1', claimer: 'inj1someoneelse' }, signature)).not.toBe(link.address)

    const poolSignature = await signClaimRequest(link.privateKeyHex, { action: 'create-pool', pool })
    expect(await claimRequestSigner({ action: 'create-pool', pool }, poolSignature)).toBe(link.address)
    const richer = { ...pool, shares: [{ amount: '3', amountBase: '3000000000000000000' }] }
    expect(await claimRequestSigner({ action: 'create-pool', pool: richer }, poolSignature)).not.toBe(link.address)
  })

  it("can't be moved from one action to another", async () => {
    const signature = await signClaimRequest(link.privateKeyHex, { action: 'release', claimId: 'c1' })
    expect(await claimRequestSigner({ action: 'record-tx', claimId: 'c1', txHash: 'AB'.repeat(32) }, signature)).not.toBe(link.address)
  })

  it('reads a missing or malformed signature as no signer', async () => {
    const request = { action: 'release' as const, claimId: 'c1' }
    expect(await claimRequestSigner(request, undefined)).toBeNull()
    expect(await claimRequestSigner(request, '0x1234')).toBeNull()
    expect(await claimRequestSigner(request, `0x${'00'.repeat(65)}`)).toBeNull()
  })

  it('signs readable text that says what it does', () => {
    expect(claimProofMessage({ action: 'record-tx', claimId: 'c1', txHash: 'FF' })).toBe('NinjaPay claim link\naction: record-tx\nclaim: c1\ntx: FF')
    // An empty name reads the same as none, on both sides.
    expect(claimProofMessage({ action: 'create-pool', pool: { ...pool, name: '' } })).toBe(
      claimProofMessage({ action: 'create-pool', pool: { ...pool, name: undefined } }),
    )
  })
})
