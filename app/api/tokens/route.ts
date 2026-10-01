/**
 * Injective's verified tokens for this network, trimmed for the browser.
 *
 * Injective's token lists are too large to send to every visitor (testnet is
 * over 20 MB), so this reads the list on the server and returns only each
 * verified token's denom, symbol, name and decimals. A good answer is cached
 * for an hour. If the list can't be read, the last good one is served, or an
 * empty list that isn't cached, and the app shows raw denoms in base units
 * until it loads. A failed read is retried after a minute, not on every request.
 */

import { NextResponse } from 'next/server'
import { TOKEN_LIST_URL, verifiedTokens, type ListedToken } from '@/lib/injective/token-list'

export const dynamic = 'force-dynamic'

const REFRESH_MS = 60 * 60_000
// After a failed read, wait this long before trying again, so a slow or
// failing connection costs one timeout a minute rather than one per request.
export const RETRY_MS = 60_000

let cached: { tokens: ListedToken[]; at: number } | null = null
let failedAt = -Infinity
// Requests that arrive while the list is downloading share that download.
let loading: Promise<void> | null = null

async function loadTokens(): Promise<ListedToken[]> {
  const response = await fetch(TOKEN_LIST_URL, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const tokens = verifiedTokens(await response.json())
  if (tokens.length === 0) throw new Error('No verified tokens in the list')
  return tokens
}

function refresh(): Promise<void> {
  loading ??= loadTokens()
    .then(tokens => { cached = { tokens, at: Date.now() } })
    // Keep the last good list, if there is one.
    .catch(() => { failedAt = Date.now() })
    .finally(() => { loading = null })
  return loading
}

export async function GET() {
  const stale = !cached || Date.now() - cached.at > REFRESH_MS
  if (stale && Date.now() - failedAt > RETRY_MS) await refresh()
  if (!cached) return NextResponse.json({ tokens: [] }, { headers: { 'cache-control': 'no-store' } })
  return NextResponse.json(
    { tokens: cached.tokens },
    { headers: { 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  )
}
