/**
 * Names for the denoms in a wallet's history, from Injective's official
 * token lists.
 *
 * NinjaPay only sends INJ and USDC, and trusts them by exact denom (TOKENS
 * in tokens.ts). Every other denom is named from Injective's list, verified
 * entries only, so an ibc/ or peggy denom shows its real name instead of a
 * hash. A name never grants trust: a listed token calling itself INJ or USDC
 * on another denom keeps its denom beside the symbol, and nothing is priced
 * by its symbol (see `pricedAs` in activity.ts).
 *
 * The testnet list is over 20 MB, so /api/tokens reads it on the server and
 * sends the browser only the verified entries.
 *
 * Which assets can be cashed out to naira is the licensed partner's
 * decision, not this list's.
 *
 * Source (checked 2026-10-01): https://github.com/InjectiveLabs/injective-lists
 * (json/tokens/{testnet,mainnet}.json: denom, symbol, overrideSymbol, name,
 * decimals, tokenVerification)
 */

import { IS_MAINNET } from './network'
import { INJ, USDC, LEGACY_PEGGY_USDC_DENOM, sameDenom } from './tokens'

export const TOKEN_LIST_URL = `https://raw.githubusercontent.com/InjectiveLabs/injective-lists/master/json/tokens/${IS_MAINNET ? 'mainnet' : 'testnet'}.json`

export type ListedToken = { denom: string; symbol: string; name: string; decimals: number }

/** Listed tokens keyed by lowercase denom (erc20: addresses come in either case). */
export type TokenMap = ReadonlyMap<string, ListedToken>

export const NO_TOKENS: TokenMap = new Map()

type RawToken = {
  denom?: unknown
  symbol?: unknown
  overrideSymbol?: unknown
  name?: unknown
  decimals?: unknown
  tokenVerification?: unknown
}

export const shortDenom = (denom: string) => (denom.length > 12 ? `${denom.slice(0, 10)}…` : denom)

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** The verified entries of an Injective token list, skipping any that are malformed. */
export function verifiedTokens(raw: unknown): ListedToken[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((token: RawToken | null) => {
    if (token?.tokenVerification !== 'verified') return []
    const denom = text(token.denom)
    const symbol = text(token.overrideSymbol) || text(token.symbol)
    const { decimals } = token
    if (!denom || !symbol) return []
    if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return []
    // A few entries use the whole denom as the symbol.
    const short = symbol.length > 32 ? shortDenom(symbol) : symbol
    return [{ denom, symbol: short, name: text(token.name) || short, decimals }]
  })
}

export function tokenMap(tokens: ListedToken[]): TokenMap {
  return new Map(tokens.map(token => [token.denom.toLowerCase(), token]))
}

export type DenomLabel = {
  token: string
  decimals: number
  /** False when neither NinjaPay nor Injective's verified list knows the denom. */
  verified: boolean
}

const ALLOWLIST = [INJ, USDC]

/** A symbol that reads as INJ or USDC, e.g. "usdc" or "U.S.D.C". */
const looksAllowlisted = (symbol: string) => {
  const plain = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return ALLOWLIST.some(token => token.symbol === plain)
}

/**
 * What to call a denom. INJ and USDC only on their exact denoms; any other
 * token named INJ or USDC keeps its short denom beside the name. A denom
 * nobody has verified shows as its short denom in base units.
 */
export function labelDenom(denom: string, list: TokenMap = NO_TOKENS): DenomLabel {
  const allowed = ALLOWLIST.find(token => sameDenom(token.denom, denom))
  if (allowed) return { token: allowed.symbol, decimals: allowed.decimals, verified: true }
  // Polygon USDC.e that NinjaPay used before native USDC. Not in Injective's lists.
  if (sameDenom(denom, LEGACY_PEGGY_USDC_DENOM)) return { token: 'USDC.e (legacy)', decimals: 6, verified: true }
  const listed = list.get(denom.toLowerCase())
  if (listed) {
    const token = looksAllowlisted(listed.symbol) ? `${listed.symbol} · ${shortDenom(denom)}` : listed.symbol
    return { token, decimals: listed.decimals, verified: true }
  }
  return { token: shortDenom(denom), decimals: 0, verified: false }
}
