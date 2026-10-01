import { describe, expect, it } from 'vitest'
import { signAndBroadcast } from '@/lib/injective/cosmos-transactions'
import { buildFundingMsg, createEscrowKey, payShareFromEscrow, planEscrow, sweepEscrow } from '@/lib/injective/claim-escrow'
import { INJ, balance, feeOf, fund, getTx, newAccount, useKeplr } from './helpers'

describe('claim links on a local chain', () => {
  it('funds a pool, pays each claimer a full share and returns the rest to the creator', async () => {
    const creator = newAccount()
    await fund([creator], BigInt(10) * INJ)
    await useKeplr(creator)

    const escrow = createEscrowKey()
    const plan = planEscrow('INJ', '3', 3)
    await signAndBroadcast(buildFundingMsg(creator.inj, escrow.address, plan))
    expect(await balance(escrow.address)).toBe(plan.totalBase + plan.feeReserve)

    const [alice, bob] = [newAccount(), newAccount()]
    const paid = [
      await payShareFromEscrow(escrow.privateKeyHex, alice.inj, 'INJ', plan.shares[0].toString()),
      await payShareFromEscrow(escrow.privateKeyHex, bob.inj, 'INJ', plan.shares[1].toString()),
    ]
    // Fees come out of the pool's reserve, never out of a share.
    expect(await balance(alice.inj)).toBe(plan.shares[0])
    expect(await balance(bob.inj)).toBe(plan.shares[1])

    const left = await balance(escrow.address)
    const creatorBefore = await balance(creator.inj)
    const sweep = await sweepEscrow(escrow.privateKeyHex, creator.inj)
    const sweepFee = feeOf(await getTx(sweep))

    expect(await balance(escrow.address)).toBe(BigInt(0))
    expect((await balance(creator.inj)) - creatorBefore).toBe(left - sweepFee)

    // The reserve planned for three payouts and a sweep covered the three transactions that ran.
    const fees = [...(await Promise.all(paid.map(getTx))).map(feeOf), sweepFee]
    expect(fees.reduce((sum, fee) => sum + fee, BigInt(0))).toBeLessThanOrEqual(plan.feeReserve)
  })

  it("refuses a claim the pool can't cover, without spending its fee reserve", async () => {
    const creator = newAccount()
    await fund([creator], BigInt(10) * INJ)
    await useKeplr(creator)
    const escrow = createEscrowKey()
    const plan = planEscrow('INJ', '1', 2)
    await signAndBroadcast(buildFundingMsg(creator.inj, escrow.address, plan))
    const held = await balance(escrow.address)

    await expect(payShareFromEscrow(escrow.privateKeyHex, newAccount().inj, 'INJ', (plan.totalBase * BigInt(2)).toString())).rejects.toThrow(
      'This claim pool does not have enough funds left for your share.',
    )
    expect(await balance(escrow.address)).toBe(held)
  })
})
