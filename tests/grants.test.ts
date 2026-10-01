import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeAllowance, describeAuthorization, describePeriod, fetchApprovals, revokeMessage } from '@/lib/injective/grants'
import { USDC } from '@/lib/injective/tokens'

const ME = 'inj1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3t5qxqh'
const OTHER = 'inj1yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyf9qgq'

afterEach(() => vi.unstubAllGlobals())

describe('authz grants in plain words', () => {
  it('flags a generic send grant as unlimited and knows how to revoke it', () => {
    expect(describeAuthorization({ '@type': '/cosmos.authz.v1beta1.GenericAuthorization', msg: '/cosmos.bank.v1beta1.MsgSend' })).toMatchObject({
      action: 'send any amount of any token',
      unlimited: true,
      revokeType: '/cosmos.bank.v1beta1.MsgSend',
    })
    expect(describeAuthorization({ '@type': '/cosmos.authz.v1beta1.GenericAuthorization', msg: '/injective.exchange.v1beta1.MsgCreateSpotLimitOrder' })).toMatchObject({
      action: 'submit create spot limit order messages',
      unlimited: false,
      revokeType: '/injective.exchange.v1beta1.MsgCreateSpotLimitOrder',
    })
  })

  it('reads send limits, allow lists and staking grants', () => {
    expect(
      describeAuthorization({
        '@type': '/cosmos.bank.v1beta1.SendAuthorization',
        spend_limit: [{ denom: USDC.denom, amount: '5000000' }],
        allow_list: [OTHER],
      }),
    ).toMatchObject({ action: 'send up to 5 USDC', limits: [`Only to ${OTHER}`], unlimited: false, revokeType: '/cosmos.bank.v1beta1.MsgSend' })
    expect(
      describeAuthorization({
        '@type': '/cosmos.staking.v1beta1.StakeAuthorization',
        max_tokens: null,
        allow_list: { address: ['injvaloper1x'] },
        authorization_type: 'AUTHORIZATION_TYPE_DELEGATE',
      }),
    ).toMatchObject({ action: 'stake any amount of INJ', limits: ['Only with validators injvaloper1x'], revokeType: '/cosmos.staking.v1beta1.MsgDelegate' })
  })

  it('shows unknown permission types without guessing how to revoke them', () => {
    expect(describeAuthorization({ '@type': '/injective.exchange.v1beta1.CreateSpotLimitOrderAuthz' })).toMatchObject({
      revokeType: null,
      limits: ['Permission type: /injective.exchange.v1beta1.CreateSpotLimitOrderAuthz'],
    })
  })
})

describe('fee allowances in plain words', () => {
  it('reads caps, periods, expiry and message limits', () => {
    expect(
      describeAllowance({ '@type': '/cosmos.feegrant.v1beta1.BasicAllowance', spend_limit: [{ denom: 'inj', amount: '500000000000000000' }], expiration: '2026-11-01T00:00:00Z' }),
    ).toMatchObject({ action: 'pay network fees', limits: ['Up to 0.5 INJ in total'], unlimited: false, expiration: new Date('2026-11-01T00:00:00Z') })
    expect(
      describeAllowance({
        '@type': '/cosmos.feegrant.v1beta1.PeriodicAllowance',
        basic: { spend_limit: [], expiration: null },
        period: '86400s',
        period_spend_limit: [{ denom: 'inj', amount: '100000000000000000' }],
      }),
    ).toMatchObject({ limits: ['No total limit', 'At most 0.1 INJ each day'], unlimited: false, expiration: null })
    expect(
      describeAllowance({
        '@type': '/cosmos.feegrant.v1beta1.AllowedMsgAllowance',
        allowance: { '@type': '/cosmos.feegrant.v1beta1.BasicAllowance', spend_limit: [], expiration: null },
        allowed_messages: ['/cosmos.bank.v1beta1.MsgSend'],
      }),
    ).toMatchObject({ unlimited: true, limits: ['No total limit', 'Only for MsgSend'] })
    expect(describePeriod('3600s')).toBe('hour')
    expect(describePeriod('604800s')).toBe('7 days')
  })
})

describe('reading and revoking approvals', () => {
  it('reads all four lists, following pagination', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      const path = new URL(url).pathname
      if (path.endsWith(`/grants/granter/${ME}`)) {
        const second = url.includes('pagination.key=')
        return Response.json({
          grants: [{ granter: ME, grantee: OTHER, authorization: { '@type': '/cosmos.authz.v1beta1.GenericAuthorization', msg: second ? '/cosmos.bank.v1beta1.MsgMultiSend' : '/cosmos.bank.v1beta1.MsgSend' }, expiration: null }],
          pagination: { next_key: second ? null : 'a2V5Kz0=' },
        })
      }
      if (path.endsWith(`/issued/${ME}`)) {
        return Response.json({ allowances: [{ granter: ME, grantee: OTHER, allowance: { '@type': '/cosmos.feegrant.v1beta1.BasicAllowance', spend_limit: [], expiration: null } }], pagination: { next_key: null } })
      }
      return Response.json({ grants: [], allowances: [], pagination: { next_key: null } })
    }))
    const { given, received } = await fetchApprovals(ME)
    expect(given.map(a => [a.kind, a.revokeType])).toEqual([
      ['authz', '/cosmos.bank.v1beta1.MsgSend'],
      ['authz', '/cosmos.bank.v1beta1.MsgMultiSend'],
      ['feegrant', null],
    ])
    expect(received).toEqual([])
    expect(calls.some(c => c.includes('pagination.key=a2V5Kz0%3D'))).toBe(true)

    expect(revokeMessage(given[0])?.toData()).toMatchObject({ '@type': '/cosmos.authz.v1beta1.MsgRevoke', granter: ME, grantee: OTHER, msgTypeUrl: '/cosmos.bank.v1beta1.MsgSend' })
    expect(revokeMessage(given[2])?.toData()).toMatchObject({ '@type': '/cosmos.feegrant.v1beta1.MsgRevokeAllowance', granter: ME, grantee: OTHER })
    expect(revokeMessage({ ...given[0], revokeType: null })).toBeNull()
  })

  it('fails when the chain cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    await expect(fetchApprovals(ME)).rejects.toThrow('HTTP 503')
  })
})
