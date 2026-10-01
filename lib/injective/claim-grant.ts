/**
 * Claim links that keep the funds in the creator's wallet.
 *
 * The creator signs one transaction giving the link's one-time key two
 * approvals, both ending when the link expires:
 * - an authz SendAuthorization: the key may send at most the link's total
 *   of one token from the creator's account;
 * - a fee allowance: the creator's INJ pays each claim's network fee, up to
 *   one maximum fee per share, so claimers need no INJ.
 *
 * A claim is MsgExec(MsgSend creator → claimer), signed by the link key with
 * the creator as fee granter. Nothing leaves the creator's wallet until
 * someone claims, the chain itself stops payouts at the total and at the
 * expiry, and the creator cancels by revoking both approvals, which needs
 * only their own wallet, not the link.
 *
 * Trade-offs: the link is still a bearer secret (anyone holding it can
 * claim), one claim per address is still enforced by the database rather
 * than the chain, and a claim fails if the creator's wallet no longer holds
 * enough when it is made.
 *
 * The link key's account doesn't exist until the fee allowance creates it,
 * which is what lets the key sign without ever holding funds.
 *
 * Sources (checked 2026-10-01):
 * - https://docs.injective.network/developers-native/examples/authz
 * - https://docs.injective.network/developers-native/examples/feegrant
 * - cosmos-sdk v0.50.14-inj.11: x/bank/types/send_authorization.go (Accept),
 *   x/feegrant/keeper/keeper.go (GrantAllowance creates the grantee account)
 * - injective-core v1.20.3: injective-chain/app/ante/fee.go (fee granter on
 *   Cosmos transactions)
 */

import {
  BaseAccount,
  ChainRestAuthApi,
  ChainRestTendermintApi,
  MsgAuthzExec,
  MsgGrant,
  MsgGrantAllowance,
  MsgSend,
  PrivateKey,
  TxRestApi,
  createTransaction,
} from '@injectivelabs/sdk-ts'
import { Any } from '@injectivelabs/core-proto-ts-v2/generated/google/protobuf/any_pb'
import { SendAuthorization } from '@injectivelabs/core-proto-ts-v2/generated/cosmos/bank/v1beta1/authz_pb'
import { CHAIN_ID } from './constants'
import { ENDPOINTS } from './network'
import { DENOMS, sameDenom } from './tokens'
import { balanceOf, fetchAllBalances } from './bank'
import { fetchAll, revokeMessage, type Approval } from './grants'
import {
  ESCROW_FALLBACK_GAS,
  ESCROW_MAX_GAS,
  FEE_RESERVE_PER_TX,
  GAS_BUFFER,
  TOKEN_DECIMALS,
  escrowFee,
  splitEqually,
  type ClaimToken,
} from './claim-escrow'
import {
  HOOK_RESTRICTION_MESSAGE,
  describeExecutionFailure,
  describeTransferError,
  errorMessage,
  isExecutionFailure,
  isHookOutOfGas,
  isHookRestriction,
} from './transfer-errors'
import { toChainAmount } from '../money'

const SEND_AUTHORIZATION = '/cosmos.bank.v1beta1.SendAuthorization'
// Blocks a claim transaction stays valid for, as in signAndBroadcast.
const TIMEOUT_BLOCKS = 120

/** How long a new link can pay out. */
export const LINK_LIFETIME_DAYS = [1, 7, 30] as const
export type LinkLifetime = (typeof LINK_LIFETIME_DAYS)[number]

export const LINK_CANCELLED_MESSAGE =
  'This claim link has ended: it expired, the sender cancelled it, or it has paid out its total.'

export type GrantPlan = {
  token: ClaimToken
  /** The token's denom as the creator's balance spells it; the approval and every claim use it. */
  denom: string
  totalBase: bigint
  shares: bigint[]
  /** The most the creator's INJ pays in claim fees: one maximum fee per share. */
  feeAllowance: bigint
  expiresAt: Date
}

export function planGrant(
  token: ClaimToken,
  totalAmount: string,
  recipientCount: number,
  days: LinkLifetime,
  denom: string = DENOMS[token],
  now: Date = new Date(),
): GrantPlan {
  const totalBase = BigInt(toChainAmount(totalAmount, TOKEN_DECIMALS[token]))
  const shares = splitEqually(totalBase, recipientCount)
  // Whole seconds: the chain stores the expiry as a timestamp in seconds.
  const expiresAt = new Date((Math.floor(now.getTime() / 1000) + days * 86_400) * 1000)
  return { token, denom, totalBase, shares, feeAllowance: FEE_RESERVE_PER_TX * BigInt(recipientCount), expiresAt }
}

/**
 * A MsgGrant an EVM wallet can sign. sdk-ts writes a grant's EIP-712 form
 * only for GenericAuthorization and throws for a SendAuthorization, so this
 * writes it the way injective-core renders the message when it checks the
 * signature: the chain's proto JSON, in field order, empty lists included.
 */
export class MsgGrantSend extends MsgGrant {
  static fromJSON(params: MsgGrant.Params): MsgGrantSend {
    return new MsgGrantSend(params)
  }

  toEip712V2() {
    const { granter, grantee, grant } = this.toProto()
    const authorization = SendAuthorization.fromBinary(grant!.authorization!.value)
    return {
      '@type': '/cosmos.authz.v1beta1.MsgGrant',
      granter,
      grantee,
      grant: {
        authorization: {
          '@type': SEND_AUTHORIZATION,
          spend_limit: authorization.spendLimit.map(({ denom, amount }) => ({ denom, amount })),
          allow_list: authorization.allowList,
        },
        // Whole seconds, as the chain prints a timestamp without nanoseconds.
        expiration: new Date(Number(grant!.expiration!.seconds) * 1000).toISOString().replace('.000Z', 'Z'),
      },
    } as unknown as ReturnType<MsgGrant['toEip712V2']>
  }
}

/** The two approvals the creator signs, in one transaction, to open a link. */
export function buildGrantMsgs(creator: string, linkAddress: string, plan: GrantPlan): [MsgGrantSend, MsgGrantAllowance] {
  const expiration = Math.floor(plan.expiresAt.getTime() / 1000)
  const authorization = Any.create({
    typeUrl: SEND_AUTHORIZATION,
    value: SendAuthorization.toBinary(
      SendAuthorization.create({ spendLimit: [{ denom: plan.denom, amount: plan.totalBase.toString() }] }),
    ),
  })
  return [
    MsgGrantSend.fromJSON({ granter: creator, grantee: linkAddress, authorization, expiration }),
    MsgGrantAllowance.fromJSON({
      granter: creator,
      grantee: linkAddress,
      allowance: { spendLimit: [{ denom: DENOMS.INJ, amount: plan.feeAllowance.toString() }], expiration },
    }),
  ]
}

/** The messages that cancel a link: a revoke for every approval the creator gave its key. */
export function cancelMessages(given: Approval[], linkAddress: string) {
  return given
    .filter(approval => approval.grantee === linkAddress)
    .map(revokeMessage)
    .filter(msg => msg !== null)
}

export type GrantLinkState = {
  /** What the link can still send, or null once it has paid out its total, expired or been cancelled. */
  remaining: { denom: string; amount: bigint } | null
  expiresAt: Date | null
  /** The creator's fee allowance for the link: null if there is none, `left: null` if it has no cap. */
  fee: { left: bigint | null } | null
}

type Json = Record<string, unknown>
type Coin = { denom: string; amount: string }

const live = (expiration: unknown, now: number) =>
  typeof expiration !== 'string' || !expiration || new Date(expiration).getTime() > now

/** What a link can still pay out, read from the chain. */
export async function fetchGrantLinkState(creator: string, linkAddress: string, token: ClaimToken): Promise<GrantLinkState> {
  const [grants, allowances] = await Promise.all([
    fetchAll(`/cosmos/authz/v1beta1/grants/grantee/${linkAddress}`, 'grants'),
    fetchAll(`/cosmos/feegrant/v1beta1/allowances/${linkAddress}`, 'allowances'),
  ])
  const now = Date.now()

  const grant = grants.find(g => {
    const authorization = (g.authorization as Json | undefined) ?? {}
    return g.granter === creator && authorization['@type'] === SEND_AUTHORIZATION && live(g.expiration, now)
  })
  const limit = ((grant?.authorization as Json | undefined)?.spend_limit as Coin[] | undefined) ?? []
  const coin = limit.find(c => sameDenom(c.denom, DENOMS[token]))

  const allowance = allowances.find(a => a.granter === creator)?.allowance as Json | undefined
  // NinjaPay grants a BasicAllowance. Read its cap; any other kind is left for the chain to judge.
  const basic = allowance?.['@type'] === '/cosmos.feegrant.v1beta1.BasicAllowance' ? allowance : undefined
  const feeCoins = (basic?.spend_limit as Coin[] | undefined) ?? []
  const feeOpen = allowance && live(basic?.expiration, now)

  return {
    remaining: coin && BigInt(coin.amount) > BigInt(0) ? { denom: coin.denom, amount: BigInt(coin.amount) } : null,
    expiresAt: typeof grant?.expiration === 'string' ? new Date(grant.expiration) : null,
    fee: feeOpen ? { left: feeCoins.length ? BigInt(balanceOf(feeCoins, DENOMS.INJ)) : null } : null,
  }
}

/**
 * Pay one share to `recipient` from the creator's wallet, signed with the
 * link key and paid for by the creator's fee allowance. The link's state and
 * the creator's balances are read fresh first, so a claim the chain would
 * refuse is never signed or charged.
 */
export async function payShareFromGrant(
  linkKeyHex: string,
  creator: string,
  recipient: string,
  token: ClaimToken,
  amountBase: string,
): Promise<string> {
  const key = PrivateKey.fromHex(linkKeyHex)
  const linkAddress = key.toBech32()
  const amount = BigInt(amountBase)
  const txApi = new TxRestApi(ENDPOINTS.rest)

  let minGas = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    let state: GrantLinkState
    let held: Coin[]
    try {
      ;[state, held] = await Promise.all([fetchGrantLinkState(creator, linkAddress, token), fetchAllBalances(creator)])
    } catch {
      throw new Error('Could not read this claim link from Injective. Try again.')
    }

    const { remaining, fee: allowance } = state
    if (!remaining) throw new Error(LINK_CANCELLED_MESSAGE)
    if (remaining.amount < amount) throw new Error("This claim link doesn't have enough left for your share.")
    if (!allowance) throw new Error('This claim link can no longer pay network fees. Ask the sender for a new link.')

    const injHeld = BigInt(balanceOf(held, DENOMS.INJ))
    const check = (fee: bigint) => {
      const tokenHeld = BigInt(balanceOf(held, remaining.denom))
      if (token === 'INJ' ? injHeld < amount + fee : tokenHeld < amount) {
        throw new Error(`The sender's wallet no longer holds enough ${token} for your share. Ask them to add funds and try again.`)
      }
      if (injHeld < fee) throw new Error("The sender's wallet doesn't have enough INJ left to pay this claim's network fee.")
      if (allowance.left !== null && allowance.left < fee) {
        throw new Error('This claim link has used up the network fees the sender set aside. Ask the sender for a new link.')
      }
    }

    const msg = MsgAuthzExec.fromJSON({
      grantee: linkAddress,
      msgs: MsgSend.fromJSON({
        srcInjectiveAddress: creator,
        dstInjectiveAddress: recipient,
        // The approval's own spelling of the denom, which the chain matches exactly.
        amount: { denom: remaining.denom, amount: amountBase },
      }),
    })

    let account: { accountNumber: number; sequence: number }
    let timeoutHeight: number
    try {
      const [accountResponse, latestBlock] = await Promise.all([
        new ChainRestAuthApi(ENDPOINTS.rest).fetchAccount(linkAddress),
        new ChainRestTendermintApi(ENDPOINTS.rest).fetchLatestBlock(),
      ])
      account = BaseAccount.fromRestApi(accountResponse).toAccountDetails()
      timeoutHeight = Number(latestBlock.header.height) + TIMEOUT_BLOCKS
    } catch {
      throw new Error('Could not read this claim link from Injective. Try again.')
    }

    const build = (gas: number) =>
      createTransaction({
        message: msg,
        memo: '',
        fee: { amount: [{ denom: DENOMS.INJ, amount: escrowFee(gas).toString() }], gas: gas.toString(), granter: creator },
        pubKey: key.toPublicKey().toBase64(),
        sequence: account.sequence,
        accountNumber: account.accountNumber,
        chainId: CHAIN_ID,
        timeoutHeight,
      })

    let gas = ESCROW_FALLBACK_GAS
    try {
      const { txRaw } = build(ESCROW_FALLBACK_GAS)
      txRaw.signatures = [new Uint8Array(0)]
      const { gasInfo } = await txApi.simulate(txRaw)
      gas = Math.ceil(Number(gasInfo.gasUsed) * GAS_BUFFER)
    } catch (error) {
      if (isHookRestriction(errorMessage(error))) throw new Error(HOOK_RESTRICTION_MESSAGE)
      // The chain refused the claim: broadcasting it would only spend the sender's fee allowance.
      if (isExecutionFailure(errorMessage(error))) {
        check(escrowFee(ESCROW_FALLBACK_GAS))
        throw new Error(describeExecutionFailure(errorMessage(error)))
      }
      // Otherwise fall back to the default gas and let the broadcast decide.
    }
    gas = Math.min(Math.max(gas, minGas), ESCROW_MAX_GAS)
    check(escrowFee(gas))

    let failure: string
    try {
      const { txRaw, signBytes } = build(gas)
      txRaw.signatures = [key.sign(signBytes)]
      const result = await txApi.broadcast(txRaw)
      if (result.code === 0) return result.txHash
      failure = result.rawLog || `Transaction failed with code ${result.code}`
    } catch (error) {
      failure = errorMessage(error)
    }

    if (attempt === 0 && isHookOutOfGas(failure) && gas < ESCROW_MAX_GAS) {
      minGas = gas * 2
      continue
    }
    // Someone else's claim used the same sequence number a moment earlier. Nothing was charged.
    if (attempt === 0 && /account sequence mismatch/i.test(failure)) continue
    throw new Error(describeTransferError(failure))
  }
  throw new Error('Transaction failed.')
}
