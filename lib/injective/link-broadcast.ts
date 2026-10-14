/**
 * Broadcasting a claim link's payout.
 *
 * Everyone who opens a claim link pays out from the same account (the escrow,
 * or the link's own key), so a crowd claiming at once races for that
 * account's sequence number. The chain lets one transaction per sequence in
 * and refuses the rest at the door ("account sequence mismatch, expected N"),
 * without charging them anything. Instead of failing those claimers, this
 * signs again for the sequence the chain expects and tries again after a
 * short random pause, so a crowd goes through one after another.
 *
 * It also never guesses about money: when a payout was sent but its outcome
 * can't be read (a dropped connection, a slow block), it asks the chain for
 * the transaction's hash, and if the chain doesn't know it yet it throws
 * PayoutUncertainError rather than calling it failed. The claim page then
 * keeps the share reserved instead of freeing it to be paid twice.
 */

import { TxClient, TxRestApi } from '@injectivelabs/sdk-ts'
import { ENDPOINTS } from './network'
import { errorMessage, isInsufficientFee } from './transfer-errors'

type TxRaw = Parameters<typeof TxClient.hash>[0]

/** Blocks a payout stays valid for: after that the chain will never include it. */
export const LINK_TX_TIMEOUT_BLOCKS = 120

/** How long a claimer keeps retrying behind a crowd before giving up. */
export const CROWD_WAIT_MS = 60_000

export const CROWD_BUSY_MESSAGE =
  'A lot of people are claiming from this link right now, and your turn didn’t come up in time. Nothing was sent. Try again in a minute.'

export const PAYOUT_UNCERTAIN_MESSAGE =
  "Your claim was sent to Injective, but NinjaPay couldn't confirm it landed. Your share stays reserved for you. Open this link again in a few minutes to see whether it arrived."

/** The payout was sent, but whether it landed can't be told yet. Its share must not be freed. */
export class PayoutUncertainError extends Error {
  constructor(readonly txHash: string) {
    super(PAYOUT_UNCERTAIN_MESSAGE)
    this.name = 'PayoutUncertainError'
  }
}

const SEQUENCE_MISMATCH = /account sequence mismatch, expected (\d+)/i

/** The sequence the chain expects, from its "account sequence mismatch, expected N, got M" refusal. */
export function expectedSequence(failure: string): number | null {
  const match = SEQUENCE_MISMATCH.exec(failure)
  return match ? Number(match[1]) : null
}

/** A short random pause that grows with each try, so claimers retrying together spread out. */
export function crowdPause(attempt: number, random: () => number = Math.random): number {
  return 150 + Math.floor(random() * Math.min(250 * (attempt + 1), 1_500))
}

// Refusals at the door: the transaction was never let into a block, so nothing moved.
const REFUSED = /broadcast error on transaction validation|is invalid: code=|tx already in mempool/i

/**
 * Refused by the chain, or included and failed: either way it paid nothing.
 * The SDK raises TransactionException for both (a non-zero code).
 */
function paidNothing(error: unknown, failure: string): boolean {
  return (error as { errorClass?: string })?.errorClass === 'TransactionException' || REFUSED.test(failure) || isInsufficientFee(failure)
}

type Lookup = { found: true; code: number; rawLog: string } | { found: false; answered: boolean }

/** What the chain knows about a transaction. `answered` is false when the chain couldn't be asked. */
async function lookUp(txApi: TxRestApi, txHash: string): Promise<Lookup> {
  try {
    await txApi.fetchTx(txHash)
    return { found: true, code: 0, rawLog: '' }
  } catch (error) {
    // fetchTx raises TransactionException for a transaction that ran and failed.
    if ((error as { errorClass?: string })?.errorClass === 'TransactionException') {
      return { found: true, code: 1, rawLog: errorMessage(error) }
    }
    return { found: false, answered: /not found/i.test(errorMessage(error)) }
  }
}

export type LinkBroadcastOptions = {
  rest?: string
  /** Called with each signed transaction's hash before it is sent. If it throws, nothing is sent. */
  onSigned?: (txHash: string) => Promise<void> | void
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Sign for `sequence` and broadcast. Returns the hash once the payout is in a
 * block, or `failure` when it paid nothing (refused, or ran and failed).
 * Throws PayoutUncertainError when it may have gone through.
 */
export async function broadcastForLink(
  sign: (sequence: number) => TxRaw | Promise<TxRaw>,
  sequence: number,
  options: LinkBroadcastOptions = {},
): Promise<{ txHash: string } | { failure: string }> {
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const txApi = new TxRestApi(options.rest ?? ENDPOINTS.rest)
  const started = now()

  for (let attempt = 0; ; attempt++) {
    const txRaw = await sign(sequence)
    const txHash = TxClient.hash(txRaw)
    await options.onSigned?.(txHash)

    try {
      const result = await txApi.broadcast(txRaw)
      if (result.code === 0) return { txHash: result.txHash }
      return { failure: result.rawLog || `Transaction failed with code ${result.code}` }
    } catch (error) {
      const failure = errorMessage(error)
      const expected = expectedSequence(failure)
      if (expected !== null) {
        // Someone else's claim took this sequence. Nothing was charged; take the next one.
        if (now() - started >= CROWD_WAIT_MS) return { failure: CROWD_BUSY_MESSAGE }
        sequence = expected
        await sleep(crowdPause(attempt))
        continue
      }
      if (paidNothing(error, failure)) return { failure }

      // Sent, or maybe sent: ask the chain before saying anything.
      const landed = await lookUp(txApi, txHash)
      if (!landed.found) throw new PayoutUncertainError(txHash)
      return landed.code === 0 ? { txHash } : { failure: landed.rawLog }
    }
  }
}

/**
 * Whether a payout that was left pending landed: 'paid' once the chain has it,
 * 'failed' if it ran and failed or can no longer be included, 'unknown' while
 * it still might be. `staleAfterMs` must be longer than LINK_TX_TIMEOUT_BLOCKS
 * of blocks, so a payout reported 'failed' can never land later.
 */
export async function payoutOutcome(
  txHash: string,
  ageMs: number,
  staleAfterMs: number,
  rest: string = ENDPOINTS.rest,
): Promise<'paid' | 'failed' | 'unknown'> {
  const landed = await lookUp(new TxRestApi(rest), txHash)
  if (landed.found) return landed.code === 0 ? 'paid' : 'failed'
  // Only the chain saying it doesn't have it counts; an unreachable chain proves nothing.
  return landed.answered && ageMs > staleAfterMs ? 'failed' : 'unknown'
}
