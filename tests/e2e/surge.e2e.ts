import { describe, expect, it } from 'vitest'
import { signAndBroadcast } from '@/lib/injective/cosmos-transactions'
import { buildFundingMsg, createEscrowKey, payShareFromEscrow, planEscrow } from '@/lib/injective/claim-escrow'
import { buildGrantMsgs, payShareFromGrant, planGrant } from '@/lib/injective/claim-grant'
import { payoutOutcome } from '@/lib/injective/link-broadcast'
import { INJ, balance, fund, newAccount, useKeplr } from './helpers'

// Everyone who opens a shared claim link pays out from the same account (the
// escrow, or the link's own key), so a crowd claiming together races for that
// account's sequence number.
// Set CROWD to try a bigger crowd: CROWD=25 npm run test:e2e -- surge
const CROWD = Number(process.env.CROWD ?? 8)

describe('a claim link shared with a crowd, on a local chain', () => {
  it('pays every claimer of a link that keeps funds in the creator wallet when they all claim at once', async () => {
    const creator = newAccount()
    await fund([creator], BigInt(20) * INJ)
    await useKeplr(creator)
    const link = createEscrowKey()
    const plan = planGrant('INJ', '4', CROWD, 7)
    await signAndBroadcast(buildGrantMsgs(creator.inj, link.address, plan))

    const claimers = Array.from({ length: CROWD }, () => newAccount())
    const results = await Promise.allSettled(
      claimers.map((claimer, i) => payShareFromGrant(link.privateKeyHex, creator.inj, claimer.inj, 'INJ', plan.shares[i].toString())),
    )

    expect(results.filter(r => r.status === 'rejected').map(r => String((r as PromiseRejectedResult).reason?.message))).toEqual([])
    const paid = await Promise.all(claimers.map(c => balance(c.inj)))
    expect(paid).toEqual(plan.shares)
  })

  it('pays every claimer of an escrow link when they all claim at once', async () => {
    const creator = newAccount()
    await fund([creator], BigInt(20) * INJ)
    await useKeplr(creator)
    const escrow = createEscrowKey()
    const plan = planEscrow('INJ', '4', CROWD)
    await signAndBroadcast(buildFundingMsg(creator.inj, escrow.address, plan))

    const claimers = Array.from({ length: CROWD }, () => newAccount())
    const results = await Promise.allSettled(
      claimers.map((claimer, i) => payShareFromEscrow(escrow.privateKeyHex, claimer.inj, 'INJ', plan.shares[i].toString())),
    )

    expect(results.filter(r => r.status === 'rejected').map(r => String((r as PromiseRejectedResult).reason?.message))).toEqual([])
    const paid = await Promise.all(claimers.map(c => balance(c.inj)))
    expect(paid).toEqual(plan.shares)
  })
})

describe('reading back a payout that was left pending, on a local chain', () => {
  it('tells a payout that landed from one the chain never saw, and waits before calling one lost', async () => {
    const creator = newAccount()
    await fund([creator], BigInt(5) * INJ)
    await useKeplr(creator)
    const escrow = createEscrowKey()
    const plan = planEscrow('INJ', '1', 1)
    await signAndBroadcast(buildFundingMsg(creator.inj, escrow.address, plan))

    const signed: string[] = []
    const paid = await payShareFromEscrow(escrow.privateKeyHex, newAccount().inj, 'INJ', plan.shares[0].toString(), {
      onSigned: hash => { signed.push(hash) },
    })
    // The hash recorded before sending is the one that landed.
    expect(signed).toEqual([paid])
    expect(await payoutOutcome(paid, 0, 60_000)).toBe('paid')

    const neverSent = 'AB'.repeat(32)
    expect(await payoutOutcome(neverSent, 0, 60_000)).toBe('unknown')
    expect(await payoutOutcome(neverSent, 120_000, 60_000)).toBe('failed')
    // An unreachable chain proves nothing, however old the payout.
    expect(await payoutOutcome(neverSent, 120_000, 60_000, 'http://127.0.0.1:9')).toBe('unknown')
  })
})
