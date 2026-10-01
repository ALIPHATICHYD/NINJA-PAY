/**
 * Injective's verified tokens for this network, trimmed for the browser.
 *
 * Injective's token lists are too large to send to every visitor (testnet is
 * over 20 MB), so this reads the list on the server and returns only each
 * verified token's denom, symbol, name and decimals. A good answer is cached
 * for an hour. If the list can't be read, the last good one is served, or an
 * empty list that isn't cached, and the app shows raw denoms until it loads.
 */

import { NextResponse } from 'next/server'
import { TOKEN_LIST_URL, verifiedTokens, type ListedToken } from '@/lib/injective/token-list'

export const dynamic = 'force-dynamic'

const REFRESH_MS = 60 * 60_000

let cached: { tokens: ListedToken[]; at: number } | null = null

async function loadTokens(): Promise<ListedToken[]> {
  const response = await fetch(TOKEN_LIST_URL, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const tokens = verifiedTokens(await response.json())
  if (tokens.length === 0) throw new Error('No verified tokens in the list')
  return tokens
}

export async function GET() {
  if (!cached || Date.now() - cached.at > REFRESH_MS) {
    try {
      cached = { tokens: await loadTokens(), at: Date.now() }
    } catch {
      // Keep the last good list, if there is one.
    }
  }
  if (!cached) return NextResponse.json({ tokens: [] }, { headers: { 'cache-control': 'no-store' } })
  return NextResponse.json(
    { tokens: cached.tokens },
    { headers: { 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  )
}
