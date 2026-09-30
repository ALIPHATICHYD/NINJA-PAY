/**
 * Checks run before a transfer is signed, so the sender reads a plain
 * sentence instead of a raw chain error afterwards.
 *
 * - Circuit breaker: Injective can switch off a message type chain-wide
 *   without halting the chain. A disabled type blocks the send.
 * - Permissions module: a token can have a namespace that pauses SEND or
 *   RECEIVE for everyone, or gives an address a role without that action.
 *   Addresses with no role get the EVERYONE role. Either case blocks the send.
 * - A recipient with no account on chain has never received or sent
 *   anything. That is a warning only.
 *
 * Issuer rules are reported as information. NinjaPay doesn't screen
 * transfers and never suggests a way around a restriction. The issuer's
 * contract hook (Circle's compliance check for USDC) can't be read in
 * advance; it shows up when the transaction is simulated before signing.
 *
 * Sources (checked 2026-09-30):
 * - https://docs.injective.network/developers-native/core/circuit
 * - https://docs.injective.network/developers-native/injective/permissions/01_concepts
 * - Routes: cosmos/circuit/v1/query.proto (DisabledList) and
 *   injective/permissions/v1beta1/query.proto (Namespace, RolesByActor)
 */

import { ENDPOINTS } from './network'

export type TransferCheck = { level: 'block' | 'warn'; message: string }

export const MSG_SEND = '/cosmos.bank.v1beta1.MsgSend'
export const MSG_ETHEREUM_TX = '/injective.evm.v1.MsgEthereumTx'

// Permission bits from the permissions module's Action enum.
const ACTION_BITS = { RECEIVE: 2, SEND: 8 } as const
type CheckedAction = keyof typeof ACTION_BITS

const EVERYONE = 'EVERYONE'

const CIRCUIT_MESSAGE =
  "Injective has switched off this kind of transfer across the whole network for now. This is its circuit breaker, which contains a problem without halting the chain. It isn't about your account. Try again later."

const NO_HISTORY_MESSAGE =
  "This address has no activity on Injective yet. Check it with the person you're paying before you send."

class NotFound extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${ENDPOINTS.rest}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (response.status === 404) throw new NotFound(path)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<T>
}

/** A blocking check if Injective has disabled any of these message types chain-wide. Unreachable means no finding. */
export async function checkCircuitBreaker(typeUrls: string[]): Promise<TransferCheck | null> {
  try {
    const { disabled_list: disabled = [] } = await getJson<{ disabled_list?: string[] }>('/cosmos/circuit/v1/disable_list')
    return typeUrls.some(url => disabled.includes(url)) ? { level: 'block', message: CIRCUIT_MESSAGE } : null
  } catch {
    return null
  }
}

type RestNamespace = {
  role_permissions?: { name: string; permissions: number | string }[]
  policy_statuses?: { action: string | number; is_disabled?: boolean }[]
}

const actionIs = (value: string | number, action: CheckedAction) =>
  value === action || Number(value) === ACTION_BITS[action]

/** An address's roles for a token. No roles, or no record at all, means the EVERYONE role. */
async function rolesOf(denom: string, actor: string): Promise<string[]> {
  try {
    const { roles = [] } = await getJson<{ roles?: string[] }>(
      `/injective/permissions/v1beta1/roles_by_actor/${encodeURIComponent(denom)}/${actor}`,
    )
    return roles.length > 0 ? roles : [EVERYONE]
  } catch (error) {
    if (error instanceof NotFound) return [EVERYONE]
    throw error
  }
}

/**
 * Checks a token's permissions namespace for this transfer. A token without a
 * namespace has no such rules. If the namespace can't be read, nothing is
 * reported: the chain still enforces the rules when the transfer is simulated.
 */
export async function checkTokenPermissions(
  denom: string,
  symbol: string,
  from: string,
  to: string,
): Promise<TransferCheck[]> {
  let namespace: RestNamespace | null
  try {
    namespace = (await getJson<{ namespace?: RestNamespace | null }>(
      `/injective/permissions/v1beta1/namespace/${encodeURIComponent(denom)}`,
    )).namespace ?? null
  } catch {
    return []
  }
  if (!namespace) return []

  const rule = (sentence: string): TransferCheck => ({
    level: 'block',
    message: `${sentence} This is the token issuer's rule on Injective. NinjaPay doesn't screen transfers and can't change it.`,
  })

  const paused = (action: CheckedAction) =>
    (namespace.policy_statuses ?? []).some(p => actionIs(p.action, action) && p.is_disabled)
  if (paused('SEND')) return [rule(`Sending ${symbol} is paused for everyone right now.`)]
  if (paused('RECEIVE')) return [rule(`Receiving ${symbol} is paused for everyone right now.`)]

  const permissions = new Map((namespace.role_permissions ?? []).map(r => [r.name, Number(r.permissions)]))
  const can = (roles: string[], action: CheckedAction) =>
    roles.some(role => ((permissions.get(role) ?? 0) & ACTION_BITS[action]) !== 0)

  try {
    const [fromRoles, toRoles] = await Promise.all([rolesOf(denom, from), rolesOf(denom, to)])
    const checks: TransferCheck[] = []
    if (!can(fromRoles, 'SEND')) checks.push(rule(`Your account isn't allowed to send ${symbol}.`))
    if (!can(toRoles, 'RECEIVE')) checks.push(rule(`This address isn't allowed to receive ${symbol}.`))
    return checks
  } catch {
    return []
  }
}

/** True if the address has an account on chain, false if it has never been used, null if unknown. */
export async function hasAccount(injectiveAddress: string): Promise<boolean | null> {
  try {
    await getJson(`/cosmos/auth/v1beta1/accounts/${injectiveAddress}`)
    return true
  } catch (error) {
    return error instanceof NotFound ? false : null
  }
}

export async function checkRecipientHistory(injectiveAddress: string): Promise<TransferCheck | null> {
  return (await hasAccount(injectiveAddress)) === false ? { level: 'warn', message: NO_HISTORY_MESSAGE } : null
}
