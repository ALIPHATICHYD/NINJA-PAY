import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MSG_ETHEREUM_TX,
  MSG_SEND,
  checkCircuitBreaker,
  checkRecipientHistory,
  checkTokenPermissions,
  checkTokenPermissionsForMany,
} from '@/lib/injective/transfer-checks'

const DENOM = 'erc20:0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d'
const ALICE = 'inj1alice'
const BOB = 'inj1bob'

// Answers REST paths from a table; anything else is a 404.
function stubRest(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => {
    const path = decodeURIComponent(new URL(String(input)).pathname)
    return path in routes ? new Response(JSON.stringify(routes[path])) : new Response('{"code":5}', { status: 404 })
  }))
}

const namespace = (extra: object) => ({
  [`/injective/permissions/v1beta1/namespace/${DENOM}`]: {
    namespace: {
      denom: DENOM,
      role_permissions: [
        { name: 'EVERYONE', role_id: 0, permissions: 10 }, // RECEIVE | SEND
        { name: 'blocked', role_id: 1, permissions: 0 },
      ],
      policy_statuses: [],
      ...extra,
    },
  },
})

afterEach(() => vi.unstubAllGlobals())

describe('circuit breaker', () => {
  it('blocks a message type Injective has disabled', async () => {
    stubRest({ '/cosmos/circuit/v1/disable_list': { disabled_list: [MSG_SEND] } })
    expect(await checkCircuitBreaker([MSG_SEND])).toMatchObject({ level: 'block', message: expect.stringMatching(/circuit breaker/) })
    expect(await checkCircuitBreaker([MSG_ETHEREUM_TX])).toBeNull()
  })

  it('reports nothing when the list is empty or unreachable', async () => {
    stubRest({ '/cosmos/circuit/v1/disable_list': { disabled_list: [] } })
    expect(await checkCircuitBreaker([MSG_SEND])).toBeNull()
    stubRest({})
    expect(await checkCircuitBreaker([MSG_SEND])).toBeNull()
  })
})

describe('token permissions', () => {
  it('has nothing to say about a token without a namespace', async () => {
    stubRest({})
    expect(await checkTokenPermissions(DENOM, 'USDC', ALICE, BOB)).toEqual([])
  })

  it('allows addresses with only the EVERYONE role when it can send and receive', async () => {
    stubRest(namespace({}))
    expect(await checkTokenPermissions(DENOM, 'USDC', ALICE, BOB)).toEqual([])
  })

  it('blocks when sending or receiving is paused, as the issuer rule it is', async () => {
    stubRest(namespace({ policy_statuses: [{ action: 'SEND', is_disabled: true, is_sealed: false }] }))
    const [check] = await checkTokenPermissions(DENOM, 'USDC', ALICE, BOB)
    expect(check.level).toBe('block')
    expect(check.message).toMatch(/Sending USDC is paused.*issuer's rule.*doesn't screen transfers/)

    stubRest(namespace({ policy_statuses: [{ action: 2, is_disabled: true }] }))
    expect((await checkTokenPermissions(DENOM, 'USDC', ALICE, BOB))[0].message).toMatch(/Receiving USDC is paused/)
  })

  it('blocks a recipient whose role lacks RECEIVE', async () => {
    stubRest({
      ...namespace({}),
      [`/injective/permissions/v1beta1/roles_by_actor/${DENOM}/${BOB}`]: { roles: ['blocked'] },
    })
    const checks = await checkTokenPermissions(DENOM, 'USDC', ALICE, BOB)
    expect(checks).toHaveLength(1)
    expect(checks[0].message).toMatch(/This address isn't allowed to receive USDC/)
  })

  it('never suggests a way around a restriction', async () => {
    stubRest({
      ...namespace({}),
      [`/injective/permissions/v1beta1/roles_by_actor/${DENOM}/${ALICE}`]: { roles: ['blocked'] },
    })
    const [check] = await checkTokenPermissions(DENOM, 'USDC', ALICE, BOB)
    expect(check.message).toMatch(/Your account isn't allowed to send USDC/)
    expect(check.message).not.toMatch(/instead|try another|use a different|workaround/i)
  })
})

describe('token permissions for a payroll run', () => {
  it('pins a recipient block to that recipient and leaves the others clear', async () => {
    stubRest({
      ...namespace({}),
      [`/injective/permissions/v1beta1/roles_by_actor/${DENOM}/inj1carol`]: { roles: ['blocked'] },
    })
    const { sender, recipients } = await checkTokenPermissionsForMany(DENOM, 'USDC', ALICE, [BOB, 'inj1carol', 'inj1dan'])
    expect(sender).toEqual([])
    expect(recipients.map(r => r.length)).toEqual([0, 1, 0])
    expect(recipients[1][0].message).toMatch(/isn't allowed to receive USDC/)
  })

  it('reports a pause once for the whole run', async () => {
    stubRest(namespace({ policy_statuses: [{ action: 'RECEIVE', is_disabled: true }] }))
    const { sender, recipients } = await checkTokenPermissionsForMany(DENOM, 'USDC', ALICE, [BOB, 'inj1carol'])
    expect(sender).toHaveLength(1)
    expect(recipients).toEqual([[], []])
  })
})

describe('recipient history', () => {
  it('warns about an address with no account on chain', async () => {
    stubRest({})
    expect(await checkRecipientHistory(BOB)).toMatchObject({ level: 'warn' })
  })

  it('says nothing for a used address or when the chain is unreachable', async () => {
    stubRest({ [`/cosmos/auth/v1beta1/accounts/${BOB}`]: { account: {} } })
    expect(await checkRecipientHistory(BOB)).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    expect(await checkRecipientHistory(BOB)).toBeNull()
  })
})
