/**
 * Gasless USDC transfers: the sender signs an EIP-3009
 * TransferWithAuthorization for Circle's USDC instead of sending a
 * transaction, and a relayer submits it and pays the INJ gas. The USDC moves
 * straight from the sender to the recipient; the relayer can only submit the
 * exact transfer that was signed, once, before it expires.
 *
 * Injective's native USDC is Circle's FiatTokenInjectiveV2_2, whose EIP-712
 * domain is name "USDC" (not "USD Coin", as on Base) and version "2". This
 * file is shared by the browser (building what the wallet signs) and the
 * relay route (checking it before paying gas).
 *
 * Sources (checked 2026-10-08):
 * - EIP-3009: https://eips.ethereum.org/EIPS/eip-3009
 * - Injective USDC on Blockscout: name "USDC", implementation FiatTokenInjectiveV2_2
 *   https://blockscout.injective.network/token/0xa00C59fF5a080D2b954d0c75e46E22a0c371235a
 * - Injective's x402 guide, which settles USDC the same way:
 *   https://docs.injective.network/developers-ai/x402
 */

import { getAddress, isAddress, isHex, recoverTypedDataAddress, type Address, type Hex } from 'viem'

export const USDC_EIP712_NAME = 'USDC'
export const USDC_EIP712_VERSION = '2'

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

export type TransferAuthorization = {
  from: Address
  to: Address
  /** USDC base units (6 decimals). */
  value: bigint
  /** Unix seconds. */
  validAfter: bigint
  validBefore: bigint
  /** 32 random bytes, so each authorization can be used once. */
  nonce: Hex
}

/** How long a signed transfer stays valid: long enough to relay, short enough not to linger. */
export const AUTHORIZATION_LIFETIME_SECONDS = 10 * 60
/** The relay refuses an authorization valid for longer than this. */
export const MAX_AUTHORIZATION_LIFETIME_SECONDS = 20 * 60
/** The smallest transfer NinjaPay pays gas for: 0.01 USDC, so gas never costs more than the payment. */
export const MIN_RELAYED_USDC = BigInt(10_000)

function randomNonce(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
}

/** A fresh authorization for `value` USDC from `from` to `to`, valid for ten minutes from `now`. */
export function newTransferAuthorization(from: Address, to: Address, value: bigint, now: Date = new Date()): TransferAuthorization {
  const seconds = Math.floor(now.getTime() / 1000)
  return {
    from: getAddress(from),
    to: getAddress(to),
    value,
    validAfter: BigInt(0),
    validBefore: BigInt(seconds + AUTHORIZATION_LIFETIME_SECONDS),
    nonce: randomNonce(),
  }
}

export function usdcDomain(chainId: number, usdc: Address) {
  return { name: USDC_EIP712_NAME, version: USDC_EIP712_VERSION, chainId, verifyingContract: getAddress(usdc) } as const
}

/** What the wallet signs, for viem or wagmi. */
export function transferAuthorizationTypedData(auth: TransferAuthorization, chainId: number, usdc: Address) {
  return {
    domain: usdcDomain(chainId, usdc),
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization' as const,
    message: auth,
  }
}

/** The same typed data as eth_signTypedData_v4 takes it: JSON, numbers as decimal strings. */
export function transferAuthorizationTypedDataJson(auth: TransferAuthorization, chainId: number, usdc: Address): string {
  return JSON.stringify({
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...TRANSFER_WITH_AUTHORIZATION_TYPES,
    },
    primaryType: 'TransferWithAuthorization',
    domain: usdcDomain(chainId, usdc),
    message: serializeAuthorization(auth),
  })
}

export type SerializedAuthorization = Record<keyof TransferAuthorization, string>

/** For JSON: bigints as decimal strings. */
export function serializeAuthorization(auth: TransferAuthorization): SerializedAuthorization {
  return {
    from: auth.from,
    to: auth.to,
    value: auth.value.toString(),
    validAfter: auth.validAfter.toString(),
    validBefore: auth.validBefore.toString(),
    nonce: auth.nonce,
  }
}

const UINT = /^\d{1,78}$/

/** Reads an authorization sent as JSON, or null if any field is malformed. */
export function parseAuthorization(input: unknown): TransferAuthorization | null {
  if (!input || typeof input !== 'object') return null
  const a = input as Partial<Record<keyof TransferAuthorization, unknown>>
  const strings = [a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce]
  if (!strings.every(s => typeof s === 'string')) return null
  const [from, to, value, validAfter, validBefore, nonce] = strings as string[]
  if (!isAddress(from) || !isAddress(to)) return null
  if (![value, validAfter, validBefore].every(n => UINT.test(n))) return null
  if (!isHex(nonce) || nonce.length !== 66) return null
  return {
    from: getAddress(from),
    to: getAddress(to),
    value: BigInt(value),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce: nonce.toLowerCase() as Hex,
  }
}

/**
 * Why the relay should refuse this authorization before checking the chain,
 * or null if it may go ahead. `now` is in unix seconds.
 */
export function authorizationProblem(auth: TransferAuthorization, now: number): string | null {
  if (auth.from === auth.to) return "The sender and the recipient are the same account."
  if (auth.value < MIN_RELAYED_USDC) return 'NinjaPay pays the network fee only for transfers of 0.01 USDC or more.'
  if (auth.validAfter > BigInt(now)) return "This transfer isn't valid yet."
  // Leave time for the transaction to reach a block.
  if (auth.validBefore <= BigInt(now + 30)) return 'This signed transfer has expired. Sign it again.'
  if (auth.validBefore > BigInt(now + MAX_AUTHORIZATION_LIFETIME_SECONDS)) {
    return 'This signed transfer stays valid for too long. Sign it again from NinjaPay.'
  }
  return null
}

/** Whether `signature` is `auth.from` signing exactly this transfer for this USDC contract. */
export async function isSignedBySender(auth: TransferAuthorization, signature: Hex, chainId: number, usdc: Address): Promise<boolean> {
  try {
    const signer = await recoverTypedDataAddress({ ...transferAuthorizationTypedData(auth, chainId, usdc), signature })
    return signer === auth.from
  } catch {
    return false
  }
}
