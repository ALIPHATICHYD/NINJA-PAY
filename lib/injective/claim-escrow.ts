/**
 * Claim-link escrow.
 *
 * Each claim pool is funded into a fresh, single-use Injective account whose
 * private key is generated in the creator's browser and shared only inside
 * the claim link's URL fragment (`#k=...`). Fragments are never sent to a
 * server, so NinjaPay never sees the key and never has custody of the funds.
 *
 * Trade-off: the link is a bearer secret. Anyone holding it can move the
 * escrow's funds; one-claim-per-address is enforced by the app (Supabase
 * unique constraints), not by the chain.
 */

import { MsgSend, MsgBroadcasterWithPk, PrivateKey } from '@injectivelabs/sdk-ts'
import { DEFAULT_GAS_PRICE } from '@injectivelabs/utils'
import { NETWORK } from './constants'
import { DENOMS, TOKENS, sameDenom } from './tokens'
import { fetchAllBalances, balanceOf } from './bank'
import { toChainAmount } from '../money'

export type ClaimToken = 'INJ' | 'USDC'

export const TOKEN_DECIMALS: Record<ClaimToken, number> = { INJ: TOKENS.INJ.decimals, USDC: TOKENS.USDC.decimals }
const TOKEN_DENOM: Record<ClaimToken, string> = { INJ: DENOMS.INJ, USDC: DENOMS.USDC }

// Every escrow transaction (claim payout or sweep) is a single MsgSend with a
// fixed gas limit, so its fee is known up front: 200,000 gas x 160,000,000 inj.
const ESCROW_TX_GAS = 200_000
const ESCROW_GAS_PRICE = BigInt(DEFAULT_GAS_PRICE)
export const ESCROW_TX_FEE = BigInt(ESCROW_TX_GAS) * ESCROW_GAS_PRICE

// INJ set aside in the escrow to pay fees: one tx per share plus one sweep.
// Reserved at 3x the fixed fee so a gas-price bump does not strand the pool.
const FEE_RESERVE_PER_TX = ESCROW_TX_FEE * BigInt(3)

const KEY_FRAGMENT_PARAM = 'k'

/**
 * Split a total (in base units) into `count` equal shares. Any indivisible
 * remainder goes to the first shares, one base unit each, so the shares always
 * sum to exactly the total.
 */
export function splitEqually(totalBase: bigint, count: number): bigint[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('Recipient count must be a whole number of at least 1')
  const n = BigInt(count)
  const each = totalBase / n
  const remainder = totalBase % n
  if (each === BigInt(0)) throw new Error('Each share would be zero. Increase the amount or reduce recipients.')
  return Array.from({ length: count }, (_, i) => each + (BigInt(i) < remainder ? BigInt(1) : BigInt(0)))
}

export type EscrowPlan = {
  token: ClaimToken
  totalBase: bigint
  shares: bigint[]
  feeReserve: bigint
  /** Coins the creator must send to the escrow, sorted by denom as the chain requires. */
  fundingCoins: { denom: string; amount: string }[]
}

/**
 * @param denom the exact spelling of the token's denom in the creator's
 *   balance (see resolveHeldDenom). Defaults to the configured denom.
 */
export function planEscrow(
  token: ClaimToken,
  totalAmount: string,
  recipientCount: number,
  denom: string = TOKEN_DENOM[token],
): EscrowPlan {
  const totalBase = BigInt(toChainAmount(totalAmount, TOKEN_DECIMALS[token]))
  const shares = splitEqually(totalBase, recipientCount)
  const feeReserve = FEE_RESERVE_PER_TX * BigInt(recipientCount + 1)

  const coins = new Map<string, bigint>()
  coins.set(denom, totalBase)
  coins.set(DENOMS.INJ, (coins.get(DENOMS.INJ) ?? BigInt(0)) + feeReserve)

  const fundingCoins = [...coins.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([denom, amount]) => ({ denom, amount: amount.toString() }))

  return { token, totalBase, shares, feeReserve, fundingCoins }
}

/**
 * Generate a fresh escrow account in the browser from 32 CSPRNG bytes.
 *
 * Do not use PrivateKey.generate().privateKey.toHex(): in sdk-ts 1.14 that
 * returns the account's 0x ADDRESS, not the private key.
 */
export function createEscrowKey(): { privateKeyHex: string; address: string } {
  for (let attempt = 0; attempt < 5; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const privateKeyHex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    try {
      // Throws for the (astronomically unlikely) bytes outside the secp256k1 range.
      return { privateKeyHex, address: PrivateKey.fromHex(privateKeyHex).toBech32() }
    } catch {
      // retry with fresh bytes
    }
  }
  throw new Error('Could not generate an escrow key. Try again.')
}

export function escrowAddressFromKey(privateKeyHex: string): string {
  return PrivateKey.fromHex(privateKeyHex).toBech32()
}

/** Build the MsgSend the creator signs to fund the escrow. */
export function buildFundingMsg(creatorAddress: string, escrowAddress: string, plan: EscrowPlan): MsgSend {
  return MsgSend.fromJSON({
    srcInjectiveAddress: creatorAddress,
    dstInjectiveAddress: escrowAddress,
    amount: plan.fundingCoins,
  })
}

export function buildClaimLink(origin: string, linkCode: string, privateKeyHex: string): string {
  return `${origin}/claim/${linkCode}#${KEY_FRAGMENT_PARAM}=${privateKeyHex}`
}

/** Read the escrow key from a URL fragment such as `#k=abc...`. */
export function readKeyFromFragment(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const key = params.get(KEY_FRAGMENT_PARAM)
  return key && /^(0x)?[0-9a-fA-F]{64}$/.test(key) ? key.replace(/^0x/, '') : null
}

async function broadcastFromEscrow(privateKeyHex: string, msg: MsgSend): Promise<string> {
  const broadcaster = new MsgBroadcasterWithPk({
    network: NETWORK,
    privateKey: privateKeyHex,
    simulateTx: false,
  })
  const result = await broadcaster.broadcast({
    msgs: msg,
    gas: { gas: ESCROW_TX_GAS, gasPrice: ESCROW_GAS_PRICE.toString() },
  })
  if (result.code !== 0) {
    throw new Error(result.rawLog || `Transaction failed with code ${result.code}`)
  }
  return result.txHash
}

/** Pay one share from the escrow to the claimer. */
export async function payShareFromEscrow(
  privateKeyHex: string,
  recipient: string,
  token: ClaimToken,
  amountBase: string,
): Promise<string> {
  const escrowAddress = escrowAddressFromKey(privateKeyHex)
  let held: { denom: string; amount: string }[]
  try {
    held = await fetchAllBalances(escrowAddress)
  } catch {
    throw new Error('Could not read the claim pool balance. Try again.')
  }
  const inj = BigInt(balanceOf(held, DENOMS.INJ))
  const tokenCoin = held.find(c => sameDenom(c.denom, TOKEN_DENOM[token]))
  const available = BigInt(tokenCoin?.amount ?? '0')
  const needed = BigInt(amountBase)

  if (token === 'INJ' ? inj < needed + ESCROW_TX_FEE : available < needed) {
    throw new Error('This claim pool does not have enough funds left for your share.')
  }
  if (inj < ESCROW_TX_FEE) {
    throw new Error('This claim pool has run out of INJ to pay network fees.')
  }

  const msg = MsgSend.fromJSON({
    srcInjectiveAddress: escrowAddress,
    dstInjectiveAddress: recipient,
    // Use the escrow's own spelling of the denom so the chain matches the coins it holds.
    amount: { denom: tokenCoin?.denom ?? TOKEN_DENOM[token], amount: amountBase },
  })
  return broadcastFromEscrow(privateKeyHex, msg)
}

/**
 * Return everything left in the escrow (minus the sweep's own fee) to
 * `refundTo`: every token it holds, not only INJ and USDC, so nothing is
 * stranded (for example USDC from before NinjaPay moved to native USDC).
 */
export async function sweepEscrow(privateKeyHex: string, refundTo: string): Promise<string> {
  const escrowAddress = escrowAddressFromKey(privateKeyHex)
  let held: { denom: string; amount: string }[]
  try {
    held = await fetchAllBalances(escrowAddress)
  } catch {
    throw new Error('Could not read the claim pool balance. Try again.')
  }
  const inj = BigInt(balanceOf(held, DENOMS.INJ))

  if (inj < ESCROW_TX_FEE) {
    throw new Error('The claim pool has no INJ left to pay the network fee for a refund.')
  }

  const coins = held
    .map(c => ({
      denom: c.denom,
      amount: sameDenom(c.denom, DENOMS.INJ) ? (inj - ESCROW_TX_FEE).toString() : c.amount,
    }))
    .filter(c => BigInt(c.amount) > BigInt(0))
    .sort((a, b) => (a.denom < b.denom ? -1 : a.denom > b.denom ? 1 : 0))
  if (coins.length === 0) throw new Error('Nothing left to reclaim.')

  const msg = MsgSend.fromJSON({
    srcInjectiveAddress: escrowAddress,
    dstInjectiveAddress: refundTo,
    amount: coins,
  })
  return broadcastFromEscrow(privateKeyHex, msg)
}

// ─── Creator-side key storage ───
// The creator's browser keeps each pool's key so the link can be re-copied and
// leftovers reclaimed. It is never uploaded. Clearing site data loses it; the
// full claim link (which contains the key) works as a backup.

const STORAGE_KEY = 'ninjapay:claim-escrow-keys'

type StoredEscrow = { privateKeyHex: string; refundTo: string }

function readStore(): Record<string, StoredEscrow> {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function saveEscrowKey(linkCode: string, entry: StoredEscrow): void {
  try {
    const store = readStore()
    store[linkCode] = entry
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Storage unavailable (private mode, blocked). The link itself still carries the key.
  }
}

export function loadEscrowKey(linkCode: string): StoredEscrow | null {
  return readStore()[linkCode] ?? null
}
