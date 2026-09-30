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

/** A readable version of a chain error for the two hook cases; anything else is returned unchanged. */
export function describeTransferError(message: string): string {
  if (isHookOutOfGas(message)) return HOOK_OUT_OF_GAS_MESSAGE
  if (isHookRestriction(message)) return HOOK_RESTRICTION_MESSAGE
  return message
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '')
}
