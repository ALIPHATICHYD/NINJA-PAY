/**
 * Payroll budgets: the account that holds the payroll funds (the owner) lets
 * another account (the operator) pay payroll from it, up to a total, until a
 * date, and optionally only to listed accounts. NinjaPay holds nothing: it is
 * one authz SendAuthorization from the owner to the operator, which the owner
 * can revoke at any time on Approvals.
 *
 * The operator pays a run as one MsgExec carrying one MsgSend per recipient,
 * signs it and pays its network fee. For each MsgSend the chain deducts the
 * amount from the budget and refuses the whole transaction if any one goes
 * over what's left, pays an account that isn't on the list, or comes after
 * the expiry, so either everyone in the run is paid or nobody is.
 *
 * Sources (checked 2026-10-01):
 * - https://docs.injective.network/developers-native/examples/authz
 * - cosmos-sdk v0.50.14-inj.11: x/bank/types/send_authorization.go (Accept:
 *   spend limit and allow list), x/authz/keeper/keeper.go (DispatchActions
 *   saves the updated grant after each message, or deletes it once spent)
 */

import { MsgAuthzExec, MsgSend } from '@injectivelabs/sdk-ts'
import { Any } from '@injectivelabs/core-proto-ts-v2/generated/google/protobuf/any_pb'
import { SendAuthorization } from '@injectivelabs/core-proto-ts-v2/generated/cosmos/bank/v1beta1/authz_pb'
import { sameDenom } from './tokens'
import { fetchAll } from './grants'
import { MsgGrantSend } from './claim-grant'

const SEND_AUTHORIZATION = '/cosmos.bank.v1beta1.SendAuthorization'

/** How long a new budget lasts. */
export const BUDGET_LIFETIME_DAYS = [7, 30, 90] as const
export type BudgetLifetime = (typeof BUDGET_LIFETIME_DAYS)[number]

export type PayrollBudget = {
  owner: string
  operator: string
  /** What is left to pay out, per denom. */
  remaining: { denom: string; amount: bigint }[]
  /** Accounts the operator may pay; empty means any account. */
  allowList: string[]
  expiresAt: Date | null
}

/** The approval an owner signs to give `operator` a budget of `totalBase` of `denom`. */
export function buildBudgetGrant(
  owner: string,
  operator: string,
  budget: { denom: string; totalBase: bigint; expiresAt: Date; allowList?: string[] },
): MsgGrantSend {
  const authorization = Any.create({
    typeUrl: SEND_AUTHORIZATION,
    value: SendAuthorization.toBinary(
      SendAuthorization.create({
        spendLimit: [{ denom: budget.denom, amount: budget.totalBase.toString() }],
        allowList: [...new Set(budget.allowList ?? [])],
      }),
    ),
  })
  const expiration = Math.floor(budget.expiresAt.getTime() / 1000)
  return MsgGrantSend.fromJSON({ granter: owner, grantee: operator, authorization, expiration })
}

/** When a budget made now for `days` ends, in whole seconds as the chain stores it. */
export const budgetExpiry = (days: BudgetLifetime, now = new Date()) =>
  new Date((Math.floor(now.getTime() / 1000) + days * 86_400) * 1000)

type Json = Record<string, unknown>
type Coin = { denom: string; amount: string }

/** The budgets other accounts have given `operator` that are still open, read from the chain. */
export async function fetchBudgets(operator: string, now = new Date()): Promise<PayrollBudget[]> {
  const grants = await fetchAll(`/cosmos/authz/v1beta1/grants/grantee/${operator}`, 'grants')
  return grants.flatMap(grant => {
    const authorization = (grant.authorization as Json | undefined) ?? {}
    if (authorization['@type'] !== SEND_AUTHORIZATION) return []
    const expiresAt = typeof grant.expiration === 'string' && grant.expiration ? new Date(grant.expiration) : null
    // The chain prunes expired grants a little later; treat them as gone now.
    if (expiresAt && expiresAt <= now) return []
    const remaining = ((authorization.spend_limit as Coin[] | undefined) ?? [])
      .map(c => ({ denom: c.denom, amount: BigInt(c.amount) }))
      .filter(c => c.amount > BigInt(0))
    if (remaining.length === 0) return []
    return [{
      owner: String(grant.granter),
      operator: String(grant.grantee),
      remaining,
      allowList: (authorization.allow_list as string[] | undefined) ?? [],
      expiresAt,
    }]
  })
}

/** What's left of `denom` in a budget, in base units. */
export const budgetLeft = (budget: PayrollBudget, denom: string) =>
  budget.remaining.find(c => sameDenom(c.denom, denom))?.amount ?? BigInt(0)

/**
 * Why the chain would refuse this run from this budget, as a sentence, or
 * null if the budget covers it. Rows are numbered from 1.
 */
export function budgetProblem(
  budget: PayrollBudget,
  denom: string,
  outputs: { address: string; amountBase: string }[],
  now = new Date(),
): string | null {
  if (budget.expiresAt && budget.expiresAt <= now) return 'This payroll budget has ended.'
  const total = outputs.reduce((sum, o) => sum + BigInt(o.amountBase), BigInt(0))
  if (total > budgetLeft(budget, denom)) return 'The total is more than this payroll budget has left.'
  if (budget.allowList.length) {
    const outside = outputs.flatMap((o, i) => (budget.allowList.includes(o.address) ? [] : [i + 1]))
    if (outside.length) {
      return `${outside.length === 1 ? 'Row' : 'Rows'} ${outside.join(', ')} ${outside.length === 1 ? "isn't" : "aren't"} on the list of accounts this budget may pay.`
    }
  }
  return null
}

/** One MsgExec, signed by the operator, paying every output from the owner's account. */
export function buildBudgetPayroll(
  budget: Pick<PayrollBudget, 'owner' | 'operator'>,
  denom: string,
  outputs: { address: string; amountBase: string }[],
): MsgAuthzExec {
  return MsgAuthzExec.fromJSON({
    grantee: budget.operator,
    msgs: outputs.map(o =>
      MsgSend.fromJSON({ srcInjectiveAddress: budget.owner, dstInjectiveAddress: o.address, amount: { denom, amount: o.amountBase } }),
    ),
  })
}
