import { describe, expect, it } from 'vitest'
import { MsgSend } from '@injectivelabs/sdk-ts'
import { signAndBroadcast } from '@/lib/injective/cosmos-transactions'
import { createEscrowKey } from '@/lib/injective/claim-escrow'
import {
  LINK_CANCELLED_MESSAGE,
  buildGrantMsgs,
  cancelMessages,
  fetchGrantLinkState,
  payShareFromGrant,
  planGrant,
} from '@/lib/injective/claim-grant'
import { fetchApprovals } from '@/lib/injective/grants'
import { INJ, balance, feeOf, fund, getTx, newAccount, useKeplr } from './helpers'

type FeeWithGranter = { fee: { granter: string; payer: string } }

describe('claim links that keep funds in the creator wallet, on a local chain', () => {
  it("pays each claimer from the creator's wallet, which also pays the fees", async () => {
    const creator = newAccount()
    await fund([creator], BigInt(10) * INJ)
    await useKeplr(creator)
    const start = await balance(creator.inj)

    const link = createEscrowKey()
    const plan = planGrant('INJ', '3', 3, 7)
    const grantFee = feeOf(await getTx(await signAndBroadcast(buildGrantMsgs(creator.inj, link.address, plan))))

    // Opening the link moves nothing: only the approval's fee left the wallet.
    expect(await balance(creator.inj)).toBe(start - grantFee)
    expect(await balance(link.address)).toBe(BigInt(0))
    const opened = await fetchGrantLinkState(creator.inj, link.address, 'INJ')
    expect(opened.remaining).toEqual({ denom: 'inj', amount: plan.totalBase })
    expect(opened.fee).toEqual({ left: plan.feeAllowance })
    expect(opened.expiresAt?.getTime()).toBe(plan.expiresAt.getTime())

    // Claimers hold no INJ at all.
    const [alice, bob] = [newAccount(), newAccount()]
    const claims = [
      await payShareFromGrant(link.privateKeyHex, creator.inj, alice.inj, 'INJ', plan.shares[0].toString()),
      await payShareFromGrant(link.privateKeyHex, creator.inj, bob.inj, 'INJ', plan.shares[1].toString()),
    ]
    expect(await balance(alice.inj)).toBe(plan.shares[0])
    expect(await balance(bob.inj)).toBe(plan.shares[1])
    expect(await balance(link.address)).toBe(BigInt(0))

    const txs = await Promise.all(claims.map(getTx))
    for (const tx of txs) {
      expect((tx.tx.auth_info as unknown as FeeWithGranter).fee.granter).toBe(creator.inj)
      expect(tx.tx.body.messages[0]['@type']).toBe('/cosmos.authz.v1beta1.MsgExec')
    }
    const claimFees = txs.map(feeOf).reduce((sum, fee) => sum + fee, BigInt(0))
    expect(await balance(creator.inj)).toBe(start - grantFee - plan.shares[0] - plan.shares[1] - claimFees)

    const after = await fetchGrantLinkState(creator.inj, link.address, 'INJ')
    expect(after.remaining).toEqual({ denom: 'inj', amount: plan.shares[2] })
    expect(after.fee).toEqual({ left: plan.feeAllowance - claimFees })
  })

  it('refuses a claim over what is left, and stops paying once cancelled, without charging for either', async () => {
    const creator = newAccount()
    await fund([creator], BigInt(10) * INJ)
    await useKeplr(creator)
    const link = createEscrowKey()
    const plan = planGrant('INJ', '1', 2, 1)
    await signAndBroadcast(buildGrantMsgs(creator.inj, link.address, plan))
    const opened = await balance(creator.inj)

    await expect(
      payShareFromGrant(link.privateKeyHex, creator.inj, newAccount().inj, 'INJ', (plan.totalBase * BigInt(2)).toString()),
    ).rejects.toThrow("This claim link doesn't have enough left for your share.")
    expect(await balance(creator.inj)).toBe(opened)

    const msgs = cancelMessages((await fetchApprovals(creator.inj)).given, link.address)
    expect(msgs.map(m => m.toData()['@type'])).toEqual([
      '/cosmos.authz.v1beta1.MsgRevoke',
      '/cosmos.feegrant.v1beta1.MsgRevokeAllowance',
    ])
    const cancelFee = feeOf(await getTx(await signAndBroadcast(msgs)))
    expect(await fetchApprovals(creator.inj)).toEqual({ given: [], received: [] })

    await expect(
      payShareFromGrant(link.privateKeyHex, creator.inj, newAccount().inj, 'INJ', plan.shares[0].toString()),
    ).rejects.toThrow(LINK_CANCELLED_MESSAGE)
    expect(await balance(creator.inj)).toBe(opened - cancelFee)
  })

  it("refuses a claim the creator's wallet can no longer cover, without charging for it", async () => {
    const creator = newAccount()
    await fund([creator], BigInt(10) * INJ)
    await useKeplr(creator)
    const link = createEscrowKey()
    const plan = planGrant('INJ', '4', 1, 7)
    await signAndBroadcast(buildGrantMsgs(creator.inj, link.address, plan))

    // The creator spends most of their INJ after sharing the link.
    await signAndBroadcast(
      MsgSend.fromJSON({ srcInjectiveAddress: creator.inj, dstInjectiveAddress: newAccount().inj, amount: { denom: 'inj', amount: (BigInt(8) * INJ).toString() } }),
    )
    const held = await balance(creator.inj)

    const claimer = newAccount()
    await expect(
      payShareFromGrant(link.privateKeyHex, creator.inj, claimer.inj, 'INJ', plan.shares[0].toString()),
    ).rejects.toThrow("The sender's wallet no longer holds enough INJ for your share.")
    expect(await balance(creator.inj)).toBe(held)
    expect(await balance(claimer.inj)).toBe(BigInt(0))
  })
})
