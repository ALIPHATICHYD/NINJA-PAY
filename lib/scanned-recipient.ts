/**
 * What a scanned QR code says to send to: a plain address (NinjaPay's Receive page shows inj1…
 * and 0x… codes), a payment-request link from Receive, or a wallet URI such as
 * `ethereum:0x…@1439` (EIP-681) or `injective:inj1…`.
 */

import { parseAccountAddress } from './injective/address'
import { parsePaymentRequest } from './payment-request'
import type { TokenSymbol } from './injective/tokens'

export type ScannedRecipient = { to: string; token: TokenSymbol | null; amount: string | null }

const NAME = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.inj$/i

export function parseScannedRecipient(text: string): ScannedRecipient | null {
  const raw = text.trim()
  if (!raw) return null

  // A payment-request link: https://…/send?to=…&token=…&amount=…
  if (/^https?:\/\//i.test(raw)) {
    try {
      const request = parsePaymentRequest(new URL(raw).search)
      return request.to ? { to: request.to, token: request.token, amount: request.amount } : null
    } catch {
      return null
    }
  }

  // ethereum:0x…@chain/function?params or injective:inj1…?params
  const uri = raw.match(/^(?:ethereum|injective):(?:pay-)?([^@/?]+)/i)
  const candidate = uri ? uri[1] : raw
  if (parseAccountAddress(candidate)) return { to: candidate, token: null, amount: null }
  if (NAME.test(candidate)) return { to: candidate.toLowerCase(), token: null, amount: null }
  return null
}
