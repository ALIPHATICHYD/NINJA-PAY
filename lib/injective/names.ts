/**
 * .inj names from the Injective Name Service (INS).
 *
 * - Forward: the registry contract gives the resolver for a name's node, and
 *   the resolver gives the name's inj1 address.
 * - Reverse: the reverse resolver gives an address's primary name. The docs
 *   say to trust it only if that name resolves back to the same address, so
 *   `lookupName` checks that.
 *
 * A node is the ENS-style namehash of the normalized name, as in sdk-ts's
 * own `nameToNode`. INS names are one label plus `.inj`, from lowercase
 * letters, digits and hyphens; NinjaPay accepts only those. That also keeps
 * out Unicode lookalikes of a familiar name.
 *
 * Contracts are queried over the chain's REST API, the route sdk-ts's
 * ChainRestWasmApi uses, so an unregistered name answers at once instead of
 * after the gRPC client's retries.
 *
 * Sources (checked 2026-09-30):
 * - https://docs.injective.network/developers-cosmwasm/smart-contracts/injective-name-service
 * - Contract addresses: @injectivelabs/networks getInjNameRegistryContractForNetwork and
 *   getInjNameReverseResolverContractForNetwork
 * - Query messages: @injectivelabs/sdk-ts QueryResolverAddress, QueryInjectiveAddress, QueryInjName
 * - Name rules and node hashing: @injectivelabs/sdk-ts 1.13 client/wasm/nameservice/utils
 */

import { QueryInjName, QueryInjectiveAddress, QueryResolverAddress } from '@injectivelabs/sdk-ts'
import { getInjNameRegistryContractForNetwork, getInjNameReverseResolverContractForNetwork } from '@injectivelabs/networks'
import { hexToBytes, namehash } from 'viem'
import { ENDPOINTS, NETWORK } from './network'
import { isSameAccount, parseAccountAddress, toInjectiveAddress, type AccountAddress } from './address'

const NAME_PATTERN = /^[a-z0-9-]{3,512}\.inj$/

/** True if the text is meant as a .inj name, valid or not. */
export function looksLikeInjName(input: string): boolean {
  return input.trim().toLowerCase().endsWith('.inj')
}

/** The name in the form INS stores it, or null if INS can't hold it. */
export function normalizeInjName(input: string): string | null {
  const name = input.trim().toLowerCase()
  return NAME_PATTERN.test(name) && !name.startsWith('-') && !name.split('.')[0].endsWith('-') ? name : null
}

/** The 32-byte node INS keys a name by. */
export function nameToNode(name: string): number[] {
  return Array.from(hexToBytes(namehash(name)))
}

/** What a recipient field holds before anything is looked up. */
export type RecipientInput =
  | { kind: 'empty' }
  | { kind: 'address'; account: AccountAddress }
  | { kind: 'name'; name: string }
  | { kind: 'bad-name' }
  | { kind: 'invalid' }

export function parseRecipientInput(input: string): RecipientInput {
  if (!input.trim()) return { kind: 'empty' }
  const account = parseAccountAddress(input)
  if (account) return { kind: 'address', account }
  if (!looksLikeInjName(input)) return { kind: 'invalid' }
  const name = normalizeInjName(input)
  return name ? { kind: 'name', name } : { kind: 'bad-name' }
}

// A contract answers a query for a record it doesn't hold with an error
// rather than an empty result; the chain passes that on as a JSON error body.
const NO_RECORD = /not found|query wasm contract failed/i

/** The contract's answer, or null if it holds no such record. Throws if the chain can't be reached. */
async function querySmart<T>(contract: string, payload: string): Promise<T | null> {
  const response = await fetch(
    `${ENDPOINTS.rest}/cosmwasm/wasm/v1/contract/${contract}/smart/${encodeURIComponent(payload)}`,
    { signal: AbortSignal.timeout(10_000) },
  )
  if (response.ok) return ((await response.json()) as { data?: T }).data ?? null
  const body = await response.json().catch(() => null) as { message?: unknown } | null
  if (typeof body?.message === 'string' && NO_RECORD.test(body.message)) return null
  throw new Error(`HTTP ${response.status}`)
}

/** The inj1 address a .inj name points to, or null if it has none. Throws if the chain can't be reached. */
export async function resolveInjName(input: string): Promise<string | null> {
  const name = normalizeInjName(input)
  if (!name) return null
  const node = nameToNode(name)
  const registry = await querySmart<{ resolver?: string | null }>(
    getInjNameRegistryContractForNetwork(NETWORK),
    new QueryResolverAddress({ node }).toPayload(),
  )
  if (!registry?.resolver) return null
  const record = await querySmart<{ address?: string | null }>(registry.resolver, new QueryInjectiveAddress({ node }).toPayload())
  return toInjectiveAddress(record?.address)
}

/** An address's primary .inj name, only if that name resolves back to the same address. Throws if the chain can't be reached. */
export async function lookupName(address: string): Promise<string | null> {
  const injectiveAddress = toInjectiveAddress(address)
  if (!injectiveAddress) return null
  const record = await querySmart<{ name?: string | null }>(
    getInjNameReverseResolverContractForNetwork(NETWORK),
    new QueryInjName({ address: injectiveAddress }).toPayload(),
  )
  const name = normalizeInjName(record?.name ?? '')
  if (!name) return null
  return isSameAccount(await resolveInjName(name), injectiveAddress) ? name : null
}
