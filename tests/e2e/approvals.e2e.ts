import { describe, expect, it } from 'vitest'
import { MsgGrant, MsgGrantAllowance } from '@injectivelabs/sdk-ts'
import { signAndBroadcast } from '@/lib/injective/cosmos-transactions'
import { fetchApprovals, revokeMessage } from '@/lib/injective/grants'
import { INJ, fund, newAccount, useKeplr } from './helpers'

describe('approvals on a local chain', () => {
  it('lists what an account allowed another to do, and revokes it', async () => {
    const owner = newAccount()
    const app = newAccount()
    await fund([owner], BigInt(10) * INJ)
    await useKeplr(owner)

    const expiration = Math.floor(Date.now() / 1000) + 30 * 86_400
    await signAndBroadcast([
      MsgGrant.fromJSON({ granter: owner.inj, grantee: app.inj, messageType: '/cosmos.bank.v1beta1.MsgSend', expiration }),
      MsgGrantAllowance.fromJSON({
        granter: owner.inj,
        grantee: app.inj,
        allowance: { spendLimit: [{ denom: 'inj', amount: '500000000000000000' }], expiration },
      }),
    ])

    const { given } = await fetchApprovals(owner.inj)
    expect(given).toMatchObject([
      { kind: 'authz', grantee: app.inj, action: 'send any amount of any token', unlimited: true, revokeType: '/cosmos.bank.v1beta1.MsgSend' },
      { kind: 'feegrant', grantee: app.inj, action: 'pay network fees', limits: ['Up to 0.5 INJ in total'], unlimited: false },
    ])
    expect(given.map(a => a.expiration?.getTime())).toEqual([expiration * 1000, expiration * 1000])
    expect((await fetchApprovals(app.inj)).received.map(a => a.kind)).toEqual(['authz', 'feegrant'])

    for (const approval of given) await signAndBroadcast(revokeMessage(approval)!)

    expect(await fetchApprovals(owner.inj)).toEqual({ given: [], received: [] })
    expect(await fetchApprovals(app.inj)).toEqual({ given: [], received: [] })
  })
})
