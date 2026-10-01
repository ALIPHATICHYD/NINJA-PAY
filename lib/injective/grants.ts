/**
 * Approvals an account has given or received on Injective's Cosmos side:
 * authz grants (another account may send certain messages as you) and fee
 * allowances (another account may pay its network fees from your INJ).
 *
 * Read from the chain's REST API with the Cosmos SDK routes:
 * - GET /cosmos/authz/v1beta1/grants/granter/{address} and /grants/grantee/{address}
 * - GET /cosmos/feegrant/v1beta1/issued/{address} and /allowances/{address}
 *
 * Only the granter can revoke: MsgRevoke names the grantee and the message
 * type the grant covers; MsgRevokeAllowance names the grantee.
 *
 * Sources (checked 2026-10-01):
 * - https://docs.injective.network/developers-native/examples/authz
 * - https://docs.injective.network/developers-native/examples/feegrant
 * - cosmos-sdk v0.50: proto/cosmos/authz/v1beta1/query.proto,
 *   proto/cosmos/feegrant/v1beta1/{query,feegrant}.proto,
 *   x/bank/types/send_authorization.go (MsgTypeURL) and
 *   x/staking/types/authz.go (normalizeAuthzType)
 */

import { MsgRevoke, MsgRevokeAllowance } from '@injectivelabs/sdk-ts'
import { ENDPOINTS } from './network'
import { formatCoin, toCoins } from './activity'

type Coin = { denom: string; amount: string }
type Json = Record<string, unknown>

export type Approval = {
  kind: 'authz' | 'feegrant'
  granter: string
  grantee: string
  /** The `@type` of the authorization or allowance. */
  type: string
  /** What the grantee may do, as a phrase that reads before "from <account>": "send up to 5 USDC". */
  action: string
  /** Further limits, each a short sentence. */
  limits: string[]
  expiration: Date | null
  /** Reach over funds with no cap: any amount, any token, or any contract call. */
  unlimited: boolean
  /** For authz, the message type MsgRevoke needs; null when NinjaPay can't tell it. */
  revokeType: string | null
}

const coins = (list: unknown) => (Array.isArray(list) ? toCoins(list as Coin[]).map(c => formatCoin(c, 6)) : [])
const shortType = (typeUrl: string) => typeUrl.split('.').pop() ?? typeUrl
const date = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** "86400s" as "day", "3600s" as "hour", otherwise "N days/hours/seconds". */
export function describePeriod(value: unknown): string {
  const seconds = Number(String(value ?? '').replace(/s$/, ''))
  if (!Number.isFinite(seconds) || seconds <= 0) return 'period'
  for (const [unit, size] of [['day', 86_400], ['hour', 3_600], ['minute', 60]] as const) {
    if (seconds % size === 0) return seconds === size ? unit : `${seconds / size} ${unit}s`
  }
  return `${seconds} seconds`
}

// Generic grants for these let the grantee move any amount of the granter's funds.
const MOVES_FUNDS: Record<string, string> = {
  '/cosmos.bank.v1beta1.MsgSend': 'send any amount of any token',
  '/cosmos.bank.v1beta1.MsgMultiSend': 'send any amount of any token to several accounts',
  '/cosmwasm.wasm.v1.MsgExecuteContract': 'call any smart contract, including ones that move tokens',
  '/injective.wasmx.v1.MsgExecuteContractCompat': 'call any smart contract, including ones that move tokens',
  '/cosmos.authz.v1beta1.MsgGrant': 'give other accounts permissions over this account',
  '/cosmos.authz.v1beta1.MsgExec': 'use permissions this account was given',
}

const STAKE_ACTIONS: Record<string, [string, string]> = {
  AUTHORIZATION_TYPE_DELEGATE: ['stake', '/cosmos.staking.v1beta1.MsgDelegate'],
  AUTHORIZATION_TYPE_UNDELEGATE: ['unstake', '/cosmos.staking.v1beta1.MsgUndelegate'],
  AUTHORIZATION_TYPE_REDELEGATE: ['move staked', '/cosmos.staking.v1beta1.MsgBeginRedelegate'],
  AUTHORIZATION_TYPE_CANCEL_UNBONDING_DELEGATION: ['cancel unstaking of', '/cosmos.staking.v1beta1.MsgCancelUnbondingDelegation'],
}

/** What an authz authorization allows, in plain words. */
export function describeAuthorization(authorization: Json): Pick<Approval, 'type' | 'action' | 'limits' | 'unlimited' | 'revokeType'> {
  const type = String(authorization['@type'] ?? '')
  if (type === '/cosmos.authz.v1beta1.GenericAuthorization') {
    const msg = String(authorization.msg ?? '')
    const funds = MOVES_FUNDS[msg]
    return {
      type,
      action: funds ?? `submit ${shortType(msg).replace(/^Msg/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} messages`,
      limits: funds ? [] : [`Message type: ${msg}`],
      unlimited: !!funds,
      revokeType: msg || null,
    }
  }
  if (type === '/cosmos.bank.v1beta1.SendAuthorization') {
    const limit = coins(authorization.spend_limit)
    const allow = Array.isArray(authorization.allow_list) ? (authorization.allow_list as string[]) : []
    return {
      type,
      action: limit.length ? `send up to ${limit.join(' and ')}` : 'send tokens',
      limits: allow.length ? [`Only to ${allow.join(', ')}`] : [],
      unlimited: limit.length === 0,
      revokeType: '/cosmos.bank.v1beta1.MsgSend',
    }
  }
  if (type === '/cosmos.staking.v1beta1.StakeAuthorization') {
    const [verb, revokeType] = STAKE_ACTIONS[String(authorization.authorization_type)] ?? ['manage staking of', null]
    const max = authorization.max_tokens ? coins([authorization.max_tokens]) : []
    const allow = (authorization.allow_list as { address?: string[] } | undefined)?.address ?? []
    const deny = (authorization.deny_list as { address?: string[] } | undefined)?.address ?? []
    return {
      type,
      action: `${verb} ${max.length ? `up to ${max[0]}` : 'any amount of INJ'}`,
      limits: [
        ...(allow.length ? [`Only with validators ${allow.join(', ')}`] : []),
        ...(deny.length ? [`Not with validators ${deny.join(', ')}`] : []),
      ],
      unlimited: false,
      revokeType,
    }
  }
  return { type, action: `act under a ${shortType(type)} permission`, limits: [`Permission type: ${type}`], unlimited: false, revokeType: null }
}

/** What a fee allowance allows, in plain words. Allowances can wrap one another. */
export function describeAllowance(allowance: Json): Pick<Approval, 'type' | 'action' | 'limits' | 'unlimited' | 'expiration'> {
  const type = String(allowance['@type'] ?? '')
  if (type === '/cosmos.feegrant.v1beta1.AllowedMsgAllowance') {
    const inner = describeAllowance((allowance.allowance as Json) ?? {})
    const allowed = Array.isArray(allowance.allowed_messages) ? (allowance.allowed_messages as string[]) : []
    return { ...inner, type, limits: [...inner.limits, `Only for ${allowed.map(shortType).join(', ') || 'no messages'}`] }
  }
  const basic = type === '/cosmos.feegrant.v1beta1.PeriodicAllowance' ? ((allowance.basic as Json) ?? {}) : allowance
  const total = coins(basic.spend_limit)
  const limits = [total.length ? `Up to ${total.join(' and ')} in total` : 'No total limit']
  if (type === '/cosmos.feegrant.v1beta1.PeriodicAllowance') {
    const perPeriod = coins(allowance.period_spend_limit)
    limits.push(`At most ${perPeriod.join(' and ') || 'any amount'} each ${describePeriod(allowance.period)}`)
  } else if (type !== '/cosmos.feegrant.v1beta1.BasicAllowance') {
    limits.push(`Allowance type: ${type}`)
  }
  return {
    type,
    action: 'pay network fees',
    limits,
    unlimited: total.length === 0 && type !== '/cosmos.feegrant.v1beta1.PeriodicAllowance',
    expiration: date(basic.expiration),
  }
}

/** Every page of a Cosmos list query, up to `maxPages`. */
export async function fetchAll(path: string, field: string, maxPages = 10): Promise<Json[]> {
  const items: Json[] = []
  let key: string | null = null
  for (let page = 0; page < maxPages; page++) {
    const query: string = `pagination.limit=100${key ? `&pagination.key=${encodeURIComponent(key)}` : ''}`
    const response = await fetch(`${ENDPOINTS.rest}${path}?${query}`, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`Injective returned HTTP ${response.status}`)
    const data = (await response.json()) as Json & { pagination?: { next_key?: string | null } }
    items.push(...((data[field] as Json[] | undefined) ?? []))
    key = data.pagination?.next_key ?? null
    if (!key) break
  }
  return items
}

const fromAuthz = (grant: Json): Approval => ({
  kind: 'authz',
  granter: String(grant.granter),
  grantee: String(grant.grantee),
  expiration: date(grant.expiration),
  ...describeAuthorization((grant.authorization as Json) ?? {}),
})

const fromFeegrant = (grant: Json): Approval => ({
  kind: 'feegrant',
  granter: String(grant.granter),
  grantee: String(grant.grantee),
  revokeType: null,
  ...describeAllowance((grant.allowance as Json) ?? {}),
})

/** Approvals `address` has given and received, read from the chain. */
export async function fetchApprovals(address: string): Promise<{ given: Approval[]; received: Approval[] }> {
  const [givenAuthz, receivedAuthz, givenFees, receivedFees] = await Promise.all([
    fetchAll(`/cosmos/authz/v1beta1/grants/granter/${address}`, 'grants'),
    fetchAll(`/cosmos/authz/v1beta1/grants/grantee/${address}`, 'grants'),
    fetchAll(`/cosmos/feegrant/v1beta1/issued/${address}`, 'allowances'),
    fetchAll(`/cosmos/feegrant/v1beta1/allowances/${address}`, 'allowances'),
  ])
  return {
    given: [...givenAuthz.map(fromAuthz), ...givenFees.map(fromFeegrant)],
    received: [...receivedAuthz.map(fromAuthz), ...receivedFees.map(fromFeegrant)],
  }
}

/** The message that revokes an approval, signed by its granter; null if NinjaPay can't build it. */
export function revokeMessage(approval: Approval) {
  const { granter, grantee } = approval
  if (approval.kind === 'feegrant') return MsgRevokeAllowance.fromJSON({ granter, grantee })
  return approval.revokeType ? MsgRevoke.fromJSON({ granter, grantee, messageType: approval.revokeType }) : null
}
