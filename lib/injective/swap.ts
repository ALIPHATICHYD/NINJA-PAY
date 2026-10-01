/**
 * INJ → USDC quotes from Injective's Swap precompile.
 *
 * This is the crypto step an off-ramp would start from: turning INJ into
 * USDC on Injective's spot orderbook. It is a quote only. NinjaPay doesn't
 * execute swaps, and a quote is never a naira amount.
 *
 * The precompile only routes markets on the exchange module's swap allowlist
 * (`swap_params.allowed_markets`). Injective's governance or exchange admins
 * add markets; NinjaPay can't, so the route check reports that case plainly.
 *
 * The docs don't say whether a quote already deducts the market's taker
 * fee, so the page shows the fee rate beside the quote rather than taking
 * it off a second time.
 *
 * Amounts use each token's ERC20 decimals. A spot order's quantity must be a
 * multiple of the market's quantity tick, which the v1beta1 market query
 * gives in base units, so the amount in is rounded down to it before quoting.
 *
 * Sources (checked 2026-09-30):
 * - https://docs.injective.network/developers-evm/swap-precompile (interface,
 *   address, allowlist route, market and token-pair queries)
 * - https://docs.injective.network/developers-evm/precompiles (Swap at 0x68, v1.20.4+)
 * - https://docs.injective.network/developers-defi/min-quantity-tick-size
 */

import { ENDPOINTS } from './network'
import { INJ, USDC, sameDenom } from './tokens'

export const SWAP_PRECOMPILE = '0x0000000000000000000000000000000000000068' as const

export const SWAP_ABI = [
  {
    type: 'function',
    name: 'quoteExactInputV1',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'marketId', type: 'string' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'quoteExactOutputV1',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenOut', type: 'address' },
      { name: 'marketId', type: 'string' },
      { name: 'amountOut', type: 'uint256' },
    ],
    outputs: [{ name: 'amountIn', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'swapExactInputV1',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'marketId', type: 'string' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minOut', type: 'uint256' },
      { name: 'recipient', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const

export type SwapRoute = {
  marketId: `0x${string}`
  /** INJ's ERC20 address, which the precompile takes as tokenIn. */
  tokenIn: `0x${string}`
  /** Quantity step in INJ base units; 1 when the market gives none. */
  quantityTick: bigint
  /** The market's taker fee rate as a fraction, e.g. 0.001. */
  takerFeeRate: number
}

export type RouteCheck =
  | { ok: true; route: SwapRoute }
  | { ok: false; reason: 'no-market' | 'swaps-off' | 'not-allowlisted' | 'no-token' }

type RestSpotMarket = {
  market_id: string
  base_denom: string
  quote_denom: string
  taker_fee_rate?: string
  min_quantity_tick_size?: string
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${ENDPOINTS.rest}${path}`, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<T>
}

/** A decimal string's whole part as a bigint, at least 1. */
function tickFrom(value: string | undefined): bigint {
  const whole = /^\d+/.exec(value ?? '')?.[0]
  return whole && BigInt(whole) > BigInt(0) ? BigInt(whole) : BigInt(1)
}

/**
 * Finds the active INJ/USDC spot market and checks the precompile can quote
 * it: swaps switched on, the market allowlisted, and INJ mapped to an ERC20
 * address. Throws if Injective can't be reached.
 */
export async function findInjUsdcRoute(): Promise<RouteCheck> {
  const [{ markets = [] }, { params }, { token_pairs: pairs = [] }] = await Promise.all([
    getJson<{ markets?: RestSpotMarket[] }>('/injective/exchange/v1beta1/spot/markets?status=Active'),
    getJson<{ params?: { swap_params?: { enabled?: boolean; allowed_markets?: string[] } } }>('/injective/exchange/v2/exchangeParams'),
    getJson<{ token_pairs?: { bank_denom: string; erc20_address: string }[] }>('/injective/erc20/v1beta1/all_token_pairs?pagination.limit=1000'),
  ])

  const market = markets.find(m => sameDenom(m.base_denom, INJ.denom) && sameDenom(m.quote_denom, USDC.denom))
  if (!market) return { ok: false, reason: 'no-market' }

  const swap = params?.swap_params
  if (!swap?.enabled) return { ok: false, reason: 'swaps-off' }
  if (!(swap.allowed_markets ?? []).some(id => id.toLowerCase() === market.market_id.toLowerCase()))
    return { ok: false, reason: 'not-allowlisted' }

  const pair = pairs.find(p => sameDenom(p.bank_denom, INJ.denom))
  if (!pair || !/^0x[0-9a-fA-F]{40}$/.test(pair.erc20_address)) return { ok: false, reason: 'no-token' }

  return {
    ok: true,
    route: {
      marketId: market.market_id as `0x${string}`,
      tokenIn: pair.erc20_address as `0x${string}`,
      quantityTick: tickFrom(market.min_quantity_tick_size),
      takerFeeRate: Number(market.taker_fee_rate ?? 'NaN'),
    },
  }
}

/** The amount rounded down to the market's quantity step. */
export function roundToTick(amount: bigint, tick: bigint): bigint {
  return tick > BigInt(1) ? amount - (amount % tick) : amount
}

/** The least the swap should return, after allowing this much slippage (basis points). */
export function minReceived(amountOut: bigint, slippageBps: number): bigint {
  return (amountOut * BigInt(10_000 - slippageBps)) / BigInt(10_000)
}

/** Above this gap from the oracle, a quote is flagged. */
export const ORACLE_TOLERANCE = 0.03

/**
 * How far the quote's INJ price is from Injective's Pyth prices, as a
 * fraction (0.01 = 1%). Null when a price is missing.
 */
export function oracleGap(amountIn: bigint, amountOut: bigint, injUsd: number | null, usdcUsd: number | null): number | null {
  if (!injUsd || !usdcUsd || amountIn <= BigInt(0)) return null
  const quotedUsd = (Number(amountOut) / 10 ** USDC.decimals) * usdcUsd
  const oracleUsd = (Number(amountIn) / 10 ** INJ.decimals) * injUsd
  return Math.abs(quotedUsd - oracleUsd) / oracleUsd
}
