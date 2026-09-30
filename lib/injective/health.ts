/**
 * Is the chain NinjaPay reads the one it expects, and is it producing blocks?
 *
 * Sends are paused when the endpoint reports another chain id (a
 * misconfigured endpoint), when the latest block is stale (a halt, often a
 * scheduled upgrade, or a lagging endpoint), or when the endpoint can't be
 * reached. A scheduled upgrade is reported so the app can warn ahead of it.
 *
 * Sources (checked 2026-09-30):
 * - https://docs.injective.network/infra/public-endpoints
 * - https://docs.injective.network/developers-evm/network-information
 */

import { CHAIN_ID, ENDPOINTS, INJECTIVE_EVM, NETWORK_LABEL } from './network'

/** A block older than this means the chain (or the endpoint) has stalled. Blocks normally land in under a second. */
export const MAX_BLOCK_AGE_MS = 60_000

export type RailHealth = { ok: true } | { ok: false; reason: string }

export type UpgradePlan = { name: string; height: number }

function ago(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 2) return 'over a minute ago'
  if (minutes < 120) return `${minutes} minutes ago`
  return `${Math.round(minutes / 60)} hours ago`
}

/** Judge one rail from its reported chain id and latest block time. */
export function assessChain(
  reported: { chainId: string | number; blockTime: Date },
  expectedChainId: string | number,
  now: Date = new Date(),
): RailHealth {
  if (String(reported.chainId) !== String(expectedChainId)) {
    return {
      ok: false,
      reason: `NinjaPay's connection reports chain ${reported.chainId}, not ${expectedChainId}. Sending is paused until that is fixed.`,
    }
  }
  const age = now.getTime() - reported.blockTime.getTime()
  if (age > MAX_BLOCK_AGE_MS) {
    return {
      ok: false,
      reason: `${NETWORK_LABEL}'s last block was ${ago(age)}, so sending is paused. This usually means a network upgrade or an outage.`,
    }
  }
  return { ok: true }
}

const UNREACHABLE: RailHealth = { ok: false, reason: `Can't reach ${NETWORK_LABEL} right now, so sending is paused. Try again shortly.` }

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<T>
}

/** The Cosmos side, used by Keplr/Leap sends, payroll and claim links. */
export async function checkCosmosHealth(now?: Date): Promise<RailHealth> {
  try {
    const { block } = await getJson<{ block: { header: { chain_id: string; time: string } } }>(
      `${ENDPOINTS.rest}/cosmos/base/tendermint/v1beta1/blocks/latest`,
    )
    return assessChain({ chainId: block.header.chain_id, blockTime: new Date(block.header.time) }, CHAIN_ID, now)
  } catch {
    return UNREACHABLE
  }
}

/** The EVM side, used by INJ sends from MetaMask and other EVM wallets. */
export async function checkEvmHealth(now?: Date): Promise<RailHealth> {
  const rpc = (method: string, params: unknown[] = []) =>
    getJson<{ result: unknown }>(new URL(ENDPOINTS.evmRpc, typeof window === 'undefined' ? 'http://localhost' : window.location.origin).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }).then(r => r.result)
  try {
    const [chainId, block] = await Promise.all([rpc('eth_chainId'), rpc('eth_getBlockByNumber', ['latest', false])])
    const timestamp = Number(BigInt((block as { timestamp: string }).timestamp)) * 1000
    return assessChain({ chainId: Number(BigInt(chainId as string)), blockTime: new Date(timestamp) }, INJECTIVE_EVM.id, now)
  } catch {
    return UNREACHABLE
  }
}

/** The next scheduled chain upgrade, if governance has approved one. */
export async function fetchUpgradePlan(): Promise<UpgradePlan | null> {
  try {
    const { plan } = await getJson<{ plan: { name: string; height: string } | null }>(
      `${ENDPOINTS.rest}/cosmos/upgrade/v1beta1/current_plan`,
    )
    return plan ? { name: plan.name, height: Number(plan.height) } : null
  } catch {
    return null
  }
}
