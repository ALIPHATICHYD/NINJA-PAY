/**
 * One Injective account, two address formats.
 *
 * Injective's EVM and Cosmos sides share accounts: `0xabc…` and `inj1…` are
 * the same 20 bytes written two ways, with one balance. NinjaPay accepts
 * either format wherever it asks for an address and stores the inj1 form.
 *
 * Sources (checked 2026-09-30):
 * - https://docs.injective.network/developers/convert-addresses
 * - https://docs.injective.network/developers-evm/evm-integrations-faq
 */

import { getAddress, isAddress } from 'viem'
import { getEthereumAddress, getInjectiveAddress } from '@injectivelabs/sdk-ts'

export type AccountAddress = {
  /** Canonical form NinjaPay stores and signs bank messages with. */
  injective: string
  /** EIP-55 checksummed form for EVM wallets and contracts. */
  evm: `0x${string}`
}

/**
 * Both forms of an Injective account address, or null if `input` is not a
 * valid inj1 or 0x account address.
 *
 * inj1 addresses must carry a valid bech32 checksum. 0x addresses may be all
 * lowercase, all uppercase or EIP-55 checksummed; a mixed-case address with
 * a wrong checksum is rejected, since that usually means a typo.
 */
export function parseAccountAddress(input: string): AccountAddress | null {
  const value = input.trim()
  try {
    if (value.startsWith('0x')) {
      if (!isAddress(value)) return null
      const evm = getAddress(value)
      return { evm, injective: getInjectiveAddress(evm) }
    }
    if (/^inj1/i.test(value)) {
      const hex = getEthereumAddress(value) // throws on a bad bech32 checksum
      if (!isAddress(hex, { strict: false })) return null
      const evm = getAddress(hex)
      const injective = getInjectiveAddress(evm)
      // Re-encoding catches a different prefix hiding before the last "1".
      return injective === value.toLowerCase() ? { evm, injective } : null
    }
  } catch {
    // Malformed input
  }
  return null
}

/** The inj1 form of an address, or null if it is not a valid account address. */
export function toInjectiveAddress(input: string | null | undefined): string | null {
  return input ? parseAccountAddress(input)?.injective ?? null : null
}

/** True when two addresses, in either format, are the same account. */
export function isSameAccount(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = toInjectiveAddress(a)
  return x !== null && x === toInjectiveAddress(b)
}

/** "inj1abcdefgh…uvwxyz" for display. */
export function shortAddress(address: string, head = 10, tail = 6): string {
  return address.length > head + tail + 1 ? `${address.slice(0, head)}…${address.slice(-tail)}` : address
}
