/**
 * Where a visitor's page reports an error it couldn't render past
 * (app/error.tsx, app/global-error.tsx), so it reaches the logs and the
 * operator instead of only the visitor's screen. It keeps the message, digest
 * and path only (lib/error-report.ts) and answers 204 either way.
 */

import { reportError } from '@/lib/error-report'
import { createRateLimiter } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 2 * 1024
// A page that keeps failing reports once per render; this keeps one visitor to a trickle.
const perNetwork = createRateLimiter({ limit: 20, windowMs: 60_000 })

function callerNetwork(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

const done = (status = 204) => new Response(null, { status, headers: { 'cache-control': 'no-store' } })

export async function POST(request: Request) {
  if (!perNetwork.take(callerNetwork(request))) return done(429)
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return done(413)
  let body: { message?: unknown; digest?: unknown; path?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return done(400)
  }
  if (typeof body.message !== 'string') return done(400)
  await reportError({
    source: 'browser',
    message: body.message,
    digest: typeof body.digest === 'string' ? body.digest : undefined,
    path: typeof body.path === 'string' ? body.path : undefined,
    requestId: request.headers.get('x-vercel-id') ?? undefined,
  })
  return done()
}
