/**
 * The tokens NinjaPay moves, per network.
 *
 * USDC is Circle's native USDC on Injective. It follows the MultiVM Token
 * Standard, so the ERC-20 contract and the bank denom `erc20:<contract>` are one
 * token with one balance: reading either shows the same amount.
 *
 * Sources (checked 2026-09-30):
 * - Contract addresses: https://docs.injective.network/developers-defi/usdc-stablecoin
 * - Denoms, decimals and logos: Injective's official token lists,
 *   https://github.com/InjectiveLabs/injective-lists (json/tokens/{testnet,mainnet}.json)
 *
 * Denom casing: the token lists write the address checksummed
 * (`erc20:0xa00C…`), while Injective's agent-skills constants write it in
 * lowercase. Always compare denoms with `sameDenom`, and when signing a
 * bank transfer use the exact denom the chain returned for the sender
 * (see `resolveHeldDenom` in bank.ts).
 */

import { Network } from '@injectivelabs/networks'
import { NETWORK } from './constants'

export type TokenSymbol = 'INJ' | 'USDC'

export type TokenInfo = {
  symbol: TokenSymbol
  name: string
  /** Bank denom as listed in Injective's token list */
  denom: string
  decimals: number
  /** ERC-20 contract on Injective EVM, for MultiVM tokens */
  evmAddress?: `0x${string}`
  logo: string
}

const INJ_LOGO = 'https://imagedelivery.net/lPzngbR8EltRfBOi_WYaXw/7123d071-0def-459a-16b9-d85e8ea04700/public'
const USDC_LOGO = 'https://imagedelivery.net/lPzngbR8EltRfBOi_WYaXw/c09b0eff-fd4a-4756-e5c9-f6bf8ac0c900/public'

const USDC_ADDRESS: Record<'testnet' | 'mainnet', `0x${string}`> = {
  testnet: '0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d',
  mainnet: '0xa00C59fF5a080D2b954d0c75e46E22a0c371235a',
}

const usdcAddress = USDC_ADDRESS[NETWORK === Network.Mainnet ? 'mainnet' : 'testnet']

export const INJ: TokenInfo = {
  symbol: 'INJ',
  name: 'Injective',
  denom: 'inj',
  decimals: 18,
  logo: INJ_LOGO,
}

export const USDC: TokenInfo = {
  symbol: 'USDC',
  name: 'USD Coin',
  denom: `erc20:${usdcAddress}`,
  decimals: 6,
  evmAddress: usdcAddress,
  logo: USDC_LOGO,
}

export const TOKENS: Record<TokenSymbol, TokenInfo> = { INJ, USDC }

export const DENOMS: Record<TokenSymbol, string> = { INJ: INJ.denom, USDC: USDC.denom }

/**
 * The Polygon USDC.e Peggy denom NinjaPay used before it moved to native USDC.
 * It is not Circle's native USDC; show it separately, never as "USDC".
 */
export const LEGACY_PEGGY_USDC_DENOM = 'peggy0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

/** Denoms compare case-insensitively (the erc20: address may be checksummed or not). */
export function sameDenom(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}
