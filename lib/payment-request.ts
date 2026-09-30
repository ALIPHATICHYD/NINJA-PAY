/**
 * Payment-request links: one person asks another to send them INJ or USDC on
 * Injective. The link opens NinjaPay's Send page with the fields filled in;
 * nothing moves until the payer checks it and signs.
 *
 * These are person-to-person requests. NinjaPay doesn't verify who made a
 * link and doesn't offer payment acceptance to businesses.
 */

import { toChainAmount } from './money'
import { parseAccountAddress } from './injective/address'
import { TOKENS, type TokenSymbol } from './injective/tokens'

export type PaymentRequest = {
  /** The requester's address, inj1… or 0x… */
  to: string
  token: TokenSymbol
  /** Human-readable amount, or null to let the payer choose */
  amount: string | null
}

/** Base units of a positive amount with no more decimals than the token has, else null. */
export function requestAmountBase(amount: string, token: TokenSymbol): bigint | null {
  try {
    const base = BigInt(toChainAmount(amount, TOKENS[token].decimals))
    return base > BigInt(0) ? base : null
  } catch {
    return null
  }
}

export function paymentRequestUrl(origin: string, request: PaymentRequest): string {
  const params = new URLSearchParams({ to: request.to, token: request.token })
  if (request.amount) params.set('amount', request.amount)
  return `${origin}/send?${params}`
}

/** Reads a request from a query string. Each field is kept only if it is valid. */
export function parsePaymentRequest(search: string): { to: string | null; token: TokenSymbol | null; amount: string | null } {
  const params = new URLSearchParams(search)
  const to = params.get('to')?.trim() ?? ''
  const token = params.get('token')?.trim().toUpperCase() ?? ''
  const amount = params.get('amount')?.trim() ?? ''
  const validToken = token in TOKENS ? (token as TokenSymbol) : null
  return {
    to: parseAccountAddress(to) ? to : null,
    token: validToken,
    amount: validToken && requestAmountBase(amount, validToken) !== null ? amount : null,
  }
}
