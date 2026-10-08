/**
 * Errors from token hooks on Injective.
 *
 * Every USDC transfer on Injective is checked by an EVM hook that calls
 * Circle's compliance contract. Two outcomes look alike on chain:
 *
 * - "transfer is restricted by EVM hook: panic during EVM hook:
 *   types.ErrorOutOfGas: …" means the check itself ran out of gas. The docs
 *   say this is not a real restriction: retry with a higher gas limit.
 * - "transfer is restricted by EVM hook" without ErrorOutOfGas is a real
 *   restriction from the issuer's rules.
 *
 * NinjaPay does not screen transfers. A real restriction is shown as
 * information about the token's rules, never as NinjaPay's own decision, and
 * with no suggested way around it.
 *
 * Source (checked 2026-09-30): https://docs.injective.network/developers-defi/usdc-stablecoin
 */

const HOOK_PATTERN = /restricted by EVM hook/i
const OUT_OF_GAS_PATTERN = /ErrorOutOfGas/i

/** The compliance check ran out of gas. Retrying with more gas fixes it. */
export function isHookOutOfGas(message: string): boolean {
  return HOOK_PATTERN.test(message) && OUT_OF_GAS_PATTERN.test(message)
}

/** A real restriction from the token issuer's rules. */
export function isHookRestriction(message: string): boolean {
  return HOOK_PATTERN.test(message) && !OUT_OF_GAS_PATTERN.test(message)
}

export const HOOK_RESTRICTION_MESSAGE =
  "This transfer isn't allowed under the token issuer's rules on Injective (for USDC, that's Circle). " +
  "NinjaPay doesn't screen transfers and can't change this."

export const HOOK_OUT_OF_GAS_MESSAGE =
  "USDC's compliance check ran out of gas, even after a retry with a higher limit. " +
  'This is not a restriction on your account. Try again in a moment.'

/**
 * The chain turned the transaction away because its gas price was below what
 * Injective required at that moment ("insufficient fee; got: … required: …",
 * from injective-core's txfees module or cosmos-sdk). This happens when the
 * adaptive base fee rose after the price was read. A rejected transaction is
 * never included, so it is charged nothing.
 */
export function isInsufficientFee(message: string): boolean {
  return /insufficient fees?\b/i.test(message)
}

export const INSUFFICIENT_FEE_MESSAGE =
  "Injective's network fee went up while this transaction was on its way, so the chain didn't accept it and no fee was charged. Try again."

/** A readable version of a chain error for the hook and fee cases; anything else is returned unchanged. */
export function describeTransferError(message: string): string {
  if (isHookOutOfGas(message)) return HOOK_OUT_OF_GAS_MESSAGE
  if (isHookRestriction(message)) return HOOK_RESTRICTION_MESSAGE
  if (isInsufficientFee(message)) return INSUFFICIENT_FEE_MESSAGE
  return message
}

const EXECUTION_FAILURE = /failed to execute message; message index: \d+: /i

/**
 * Simulation ran the messages and the chain refused them, for example a
 * payment larger than the balance. Signed and broadcast, the transaction
 * would fail the same way and still be charged its fee. Hook out-of-gas is
 * left out: a higher gas limit fixes it.
 *
 * The text comes from cosmos-sdk's baseapp ("failed to execute message;
 * message index: N: <reason>"), as returned by /cosmos/tx/v1beta1/simulate.
 */
export function isExecutionFailure(message: string): boolean {
  return EXECUTION_FAILURE.test(message) && !isHookOutOfGas(message)
}

/** A readable version of an execution failure found in simulation, for when the wallet never opened. */
export function describeExecutionFailure(message: string): string {
  const unsigned = 'Nothing was signed or sent, so no fee was charged.'
  // An authz send over its approval's cap is reported as insufficient funds
  // too, so check for it first (cosmos-sdk x/bank/types/send_authorization.go).
  if (/more than spend limit/i.test(message)) return `The total is more than the approval it's sent under allows. ${unsigned}`
  const notAllowed = message.match(/cannot send to (\S+) address/i)
  if (notAllowed) return `The approval it's sent under doesn't allow paying ${notAllowed[1]}. ${unsigned}`
  if (/authorization not found/i.test(message)) {
    return `The approval it's sent under no longer exists: it was revoked, used up or has expired. ${unsigned}`
  }
  if (/insufficient funds/i.test(message)) {
    return "This account doesn't hold enough of that token for the whole amount. Nothing was signed or sent, so no fee was charged."
  }
  const reason = message
    .slice(message.search(EXECUTION_FAILURE))
    .replace(EXECUTION_FAILURE, '')
    .replace(/ \[[^\]]*\]/g, '')
    .replace(/\s*With gas wanted:[\s\S]*$/, '')
    .trim()
  return `Injective would refuse this transaction (${reason}), so it wasn't signed or sent and no fee was charged.`
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '')
}
