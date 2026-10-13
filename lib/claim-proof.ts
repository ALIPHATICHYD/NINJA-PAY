/**
 * Proof that a request to /api/claims comes from someone holding the claim
 * link: the link's key signs what the request does, and the server checks the
 * signer is the link's address. The key itself never leaves the browser.
 *
 * Anyone with the link can already spend what it holds, so this asks for
 * nothing more than the link. What it shuts out is everyone else, who today
 * could write claim rows directly with the database's public key.
 */

import { recoverMessageAddress, isHex, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { toInjectiveAddress } from './injective/address'
import type { ClaimPool } from './injective/types'

export type NewClaimPool = Omit<ClaimPool, 'id' | 'createdAt'>

/** A request that changes claim rows, and so has to be signed by the link's key. */
export type SignedClaimRequest =
  | { action: 'create-pool'; pool: NewClaimPool }
  | { action: 'reserve'; poolId: string; claimer: string }
  | { action: 'record-tx'; claimId: string; txHash: string }
  | { action: 'release'; claimId: string }

/** The pool's fields in a fixed order, so the browser and the server sign and check the same text. */
function poolText(pool: NewClaimPool): string {
  return JSON.stringify({
    creatorAddress: pool.creatorAddress,
    name: pool.name || null,
    totalAmount: pool.totalAmount,
    claimType: pool.claimType,
    token: pool.token,
    escrowAddress: pool.escrowAddress,
    linkCode: pool.linkCode,
    shares: pool.shares.map(s => ({ amount: s.amount, amountBase: s.amountBase ?? null })),
  })
}

/** What the link's key signs: the action and everything it acts on. */
export function claimProofMessage(request: SignedClaimRequest): string {
  const lines = ['NinjaPay claim link', `action: ${request.action}`]
  switch (request.action) {
    case 'create-pool':
      lines.push(`pool: ${poolText(request.pool)}`)
      break
    case 'reserve':
      lines.push(`pool: ${request.poolId}`, `claimer: ${request.claimer}`)
      break
    case 'record-tx':
      lines.push(`claim: ${request.claimId}`, `tx: ${request.txHash}`)
      break
    case 'release':
      lines.push(`claim: ${request.claimId}`)
      break
  }
  return lines.join('\n')
}

/** Sign a request with the link's key, in the browser. */
export async function signClaimRequest(linkKeyHex: string, request: SignedClaimRequest): Promise<Hex> {
  const key = (linkKeyHex.startsWith('0x') ? linkKeyHex : `0x${linkKeyHex}`) as Hex
  return privateKeyToAccount(key).signMessage({ message: claimProofMessage(request) })
}

/** The inj1 address that signed the request, or null if the signature doesn't read. */
export async function claimRequestSigner(request: SignedClaimRequest, signature: unknown): Promise<string | null> {
  if (typeof signature !== 'string' || !isHex(signature) || signature.length !== 132) return null
  try {
    const address = await recoverMessageAddress({ message: claimProofMessage(request), signature })
    return toInjectiveAddress(address)
  } catch {
    return null
  }
}
