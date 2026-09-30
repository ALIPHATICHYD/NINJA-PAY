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
import { fetchAllBalances, balanceOf, type Coin } from './bank'
import { toChainAmount } from '../money'
import { describeTransferError, errorMessage, isHookOutOfGas, isHookRestriction, HOOK_RESTRICTION_MESSAGE } from './transfer-errors'

export type ClaimToken = 'INJ' | 'USDC'

export const TOKEN_DECIMALS: Record<ClaimToken, number> = { INJ: TOKENS.INJ.decimals, USDC: TOKENS.USDC.decimals }
const TOKEN_DENOM: Record<ClaimToken, string> = { INJ: DENOMS.INJ, USDC: DENOMS.USDC }

// Every escrow transaction (claim payout or sweep) is a single MsgSend. Its
// gas is sized by simulation, because USDC transfers also run Circle's
// compliance hook, and is capped at what the pool's fee reserve pays for.
const ESCROW_GAS_PRICE = BigInt(DEFAULT_GAS_PRICE)
const ESCROW_FALLBACK_GAS = 200_000 // when simulation is unavailable
const ESCROW_MAX_GAS = 600_000
const GAS_BUFFER = 1.3

const escrowFee = (gas: number) => BigInt(gas) * ESCROW_GAS_PRICE

// INJ set aside in the escrow to pay fees: one tx per share plus one sweep,
// each at the gas cap (600,000 gas x 160,000,000 inj = 0.000096 INJ).
const FEE_RESERVE_PER_TX = escrowFee(ESCROW_MAX_GAS)

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

type EscrowTx = {
  /** Throws a readable error if the escrow can't pay `fee` plus what it sends. */
  check: (held: Coin[], fee: bigint) => void
  /** The MsgSend for a given fee (the sweep sends back its INJ minus the fee). */
  build: (held: Coin[], fee: bigint) => MsgSend
}

/**
 * Sign with the escrow key and broadcast. Balances are read fresh, gas is
 * sized by simulation (capped at ESCROW_MAX_GAS), and if USDC's compliance
 * hook runs out of gas the transaction is retried once with twice the gas.
 */
async function broadcastFromEscrow(privateKeyHex: string, tx: EscrowTx): Promise<string> {
  const escrowAddress = escrowAddressFromKey(privateKeyHex)
  const broadcaster = new MsgBroadcasterWithPk({
    network: NETWORK,
    privateKey: privateKeyHex,
    simulateTx: false,
  })

  let minGas = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    let held: Coin[]
    try {
      held = await fetchAllBalances(escrowAddress)
    } catch {
      throw new Error('Could not read the claim pool balance. Try again.')
    }

    let gas = ESCROW_FALLBACK_GAS
    try {
      const { gasInfo } = await broadcaster.simulate({ msgs: tx.build(held, escrowFee(ESCROW_MAX_GAS)) })
      gas = Math.ceil(Number(gasInfo.gasUsed) * GAS_BUFFER)
    } catch (error) {
      if (isHookRestriction(errorMessage(error))) throw new Error(HOOK_RESTRICTION_MESSAGE)
      // Otherwise fall back to the default gas and let the broadcast decide.
    }
    gas = Math.min(Math.max(gas, minGas), ESCROW_MAX_GAS)

    const fee = escrowFee(gas)
    tx.check(held, fee)

    let failure: string
    try {
      const result = await broadcaster.broadcast({
        msgs: tx.build(held, fee),
        gas: { gas, gasPrice: ESCROW_GAS_PRICE.toString() },
      })
      if (result.code === 0) return result.txHash
      failure = result.rawLog || `Transaction failed with code ${result.code}`
    } catch (error) {
      failure = errorMessage(error)
    }

    if (attempt === 0 && isHookOutOfGas(failure) && gas < ESCROW_MAX_GAS) {
      minGas = gas * 2
      continue
    }
    throw new Error(describeTransferError(failure))
  }
  throw new Error('Transaction failed.')
}

/** Pay one share from the escrow to the claimer. */
export async function payShareFromEscrow(
  privateKeyHex: string,
  recipient: string,
  token: ClaimToken,
  amountBase: string,
): Promise<string> {
  const escrowAddress = escrowAddressFromKey(privateKeyHex)
  const needed = BigInt(amountBase)
  const tokenCoin = (held: Coin[]) => held.find(c => sameDenom(c.denom, TOKEN_DENOM[token]))

  return broadcastFromEscrow(privateKeyHex, {
    check: (held, fee) => {
      const inj = BigInt(balanceOf(held, DENOMS.INJ))
      const available = BigInt(tokenCoin(held)?.amount ?? '0')
      if (token === 'INJ' ? inj < needed + fee : available < needed) {
        throw new Error('This claim pool does not have enough funds left for your share.')
      }
      if (inj < fee) {
        throw new Error('This claim pool has run out of INJ to pay network fees.')
      }
    },
    build: held => MsgSend.fromJSON({
      srcInjectiveAddress: escrowAddress,
      dstInjectiveAddress: recipient,
      // Use the escrow's own spelling of the denom so the chain matches the coins it holds.
      amount: { denom: tokenCoin(held)?.denom ?? TOKEN_DENOM[token], amount: amountBase },
    }),
  })
}

/**
 * Return everything left in the escrow (minus the sweep's own fee) to
 * `refundTo`: every token it holds, not only INJ and USDC, so nothing is
 * stranded (for example USDC from before NinjaPay moved to native USDC).
 */
export async function sweepEscrow(privateKeyHex: string, refundTo: string): Promise<string> {
  const escrowAddress = escrowAddressFromKey(privateKeyHex)
  const refundCoins = (held: Coin[], fee: bigint) => {
    const inj = BigInt(balanceOf(held, DENOMS.INJ))
    return held
      .map(c => ({
        denom: c.denom,
        amount: sameDenom(c.denom, DENOMS.INJ) ? (inj > fee ? inj - fee : BigInt(0)).toString() : c.amount,
      }))
      .filter(c => BigInt(c.amount) > BigInt(0))
      .sort((a, b) => (a.denom < b.denom ? -1 : a.denom > b.denom ? 1 : 0))
  }

  return broadcastFromEscrow(privateKeyHex, {
    check: (held, fee) => {
      if (BigInt(balanceOf(held, DENOMS.INJ)) < fee) {
        throw new Error('The claim pool has no INJ left to pay the network fee for a refund.')
      }
      if (refundCoins(held, fee).length === 0) throw new Error('Nothing left to reclaim.')
    },
    build: (held, fee) => MsgSend.fromJSON({
      srcInjectiveAddress: escrowAddress,
      dstInjectiveAddress: refundTo,
      amount: refundCoins(held, fee),
    }),
  })
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
