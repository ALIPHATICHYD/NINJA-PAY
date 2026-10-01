import { afterEach, describe, expect, it, vi } from 'vitest'
import { SendAuthorization } from '@injectivelabs/core-proto-ts-v2/generated/cosmos/bank/v1beta1/authz_pb'
import { BasicAllowance } from '@injectivelabs/core-proto-ts-v2/generated/cosmos/feegrant/v1beta1/feegrant_pb'
import { buildClaimLink, readKeyFromFragment, readKindFromFragment } from '@/lib/injective/claim-escrow'
import { buildGrantMsgs, cancelMessages, fetchGrantLinkState, planGrant } from '@/lib/injective/claim-grant'
import type { Approval } from '@/lib/injective/grants'
import { USDC } from '@/lib/injective/tokens'

const CREATOR = 'inj1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3t5qxqh'
const LINK = 'inj1yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyf9qgq'
const KEY = 'ab'.repeat(32)
const NOW = new Date('2026-10-01T12:00:00.500Z')

afterEach(() => vi.unstubAllGlobals())

describe('planGrant', () => {
  it('splits the total, sets aside one maximum fee per share and expires in whole seconds', () => {
    const plan = planGrant('USDC', '10', 4, 7, USDC.denom, NOW)
    expect(plan.totalBase).toBe(BigInt(10_000_000))
    expect(plan.shares).toEqual(Array(4).fill(BigInt(2_500_000)))
    expect(plan.feeAllowance).toBe(BigInt(4) * BigInt(600_000) * BigInt(160_000_000))
    expect(plan.expiresAt.toISOString()).toBe('2026-10-08T12:00:00.000Z')
  })
})

describe('buildGrantMsgs', () => {
  it('caps the send approval at the total of one token and the fee allowance at the plan, both expiring together', () => {
    const plan = planGrant('USDC', '10', 4, 1, USDC.denom.toLowerCase(), NOW)
    const [grant, allowance] = buildGrantMsgs(CREATOR, LINK, plan)

    const grantProto = grant.toProto()
    expect(grantProto).toMatchObject({ granter: CREATOR, grantee: LINK })
    expect(grantProto.grant?.authorization?.typeUrl).toBe('/cosmos.bank.v1beta1.SendAuthorization')
    expect(SendAuthorization.fromBinary(grantProto.grant!.authorization!.value)).toEqual({
      spendLimit: [{ denom: USDC.denom.toLowerCase(), amount: '10000000' }],
      allowList: [],
    })
    expect(grantProto.grant?.expiration?.seconds).toBe(BigInt(plan.expiresAt.getTime() / 1000))

    const allowanceProto = allowance.toProto()
    expect(allowanceProto).toMatchObject({ granter: CREATOR, grantee: LINK })
    const basic = BasicAllowance.fromBinary(allowanceProto.allowance!.value)
    expect(basic.spendLimit).toEqual([{ denom: 'inj', amount: plan.feeAllowance.toString() }])
    expect(basic.expiration?.seconds).toBe(BigInt(plan.expiresAt.getTime() / 1000))
  })
})

describe('cancelMessages', () => {
  it("revokes only the approvals given to this link's key", () => {
    const approval = (grantee: string, kind: Approval['kind']): Approval => ({
      kind,
      granter: CREATOR,
      grantee,
      type: '',
      action: '',
      limits: [],
      expiration: null,
      unlimited: false,
      revokeType: kind === 'authz' ? '/cosmos.bank.v1beta1.MsgSend' : null,
    })
    const msgs = cancelMessages([approval(LINK, 'authz'), approval(CREATOR, 'authz'), approval(LINK, 'feegrant')], LINK)
    expect(msgs.map(m => m.toData())).toMatchObject([
      { '@type': '/cosmos.authz.v1beta1.MsgRevoke', granter: CREATOR, grantee: LINK, msgTypeUrl: '/cosmos.bank.v1beta1.MsgSend' },
      { '@type': '/cosmos.feegrant.v1beta1.MsgRevokeAllowance', granter: CREATOR, grantee: LINK },
    ])
  })
})

describe('fetchGrantLinkState', () => {
  const stub = (grants: unknown[], allowances: unknown[]) =>
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = url.includes('/authz/') ? { grants, pagination: {} } : { allowances, pagination: {} }
      return new Response(JSON.stringify(body))
    }))
  const sendGrant = (granter: string, amount: string, expiration: string | null) => ({
    granter,
    grantee: LINK,
    authorization: { '@type': '/cosmos.bank.v1beta1.SendAuthorization', spend_limit: [{ denom: USDC.denom.toLowerCase(), amount }], allow_list: [] },
    expiration,
  })
  const feeGrant = (spend_limit: unknown[], expiration: string | null) => ({
    granter: CREATOR,
    grantee: LINK,
    allowance: { '@type': '/cosmos.feegrant.v1beta1.BasicAllowance', spend_limit, expiration },
  })

  it("reads what the creator's approvals still allow, ignoring anyone else's", async () => {
    stub(
      [sendGrant(LINK, '999', '2999-01-01T00:00:00Z'), sendGrant(CREATOR, '2500000', '2999-01-01T00:00:00Z')],
      [feeGrant([{ denom: 'inj', amount: '96000000000000' }], '2999-01-01T00:00:00Z')],
    )
    expect(await fetchGrantLinkState(CREATOR, LINK, 'USDC')).toEqual({
      remaining: { denom: USDC.denom.toLowerCase(), amount: BigInt(2_500_000) },
      expiresAt: new Date('2999-01-01T00:00:00Z'),
      fee: { left: BigInt('96000000000000') },
    })
  })

  it('treats an expired approval as gone even before the chain prunes it, and an uncapped allowance as uncapped', async () => {
    stub([sendGrant(CREATOR, '2500000', '2000-01-01T00:00:00Z')], [feeGrant([], null)])
    expect(await fetchGrantLinkState(CREATOR, LINK, 'USDC')).toEqual({ remaining: null, expiresAt: null, fee: { left: null } })
  })

  it('has nothing to pay out after a cancel', async () => {
    stub([], [])
    expect(await fetchGrantLinkState(CREATOR, LINK, 'USDC')).toEqual({ remaining: null, expiresAt: null, fee: null })
  })
})

describe('claim link fragments', () => {
  it('mark links that keep funds in the creator wallet, and read older links as escrows', () => {
    const grant = new URL(buildClaimLink('https://ninjapay.example', 'abc', KEY, 'grant'))
    expect(readKeyFromFragment(grant.hash)).toBe(KEY)
    expect(readKindFromFragment(grant.hash)).toBe('grant')

    const escrow = new URL(buildClaimLink('https://ninjapay.example', 'abc', KEY))
    expect(escrow.hash).toBe(`#k=${KEY}`)
    expect(readKindFromFragment(escrow.hash)).toBe('escrow')
  })
})
