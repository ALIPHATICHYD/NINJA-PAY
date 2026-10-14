/**
 * Settles claim reservations nobody came back to, once a day (vercel.json),
 * so a creator's list doesn't count them as open forever. Claims also settle
 * whenever their link is used, so this only tidies up after links that went
 * quiet. It settles the oldest 100 reservations over 10 minutes old each run,
 * by asking the chain about each payout (lib/claim-recovery.ts).
 *
 * Vercel calls it with `Authorization: Bearer $CRON_SECRET`. It does nothing
 * without CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY.
 */

import { NextResponse } from 'next/server'
import { STALE_CLAIM_MS, settleAll } from '@/lib/claim-recovery'
import { serverClaimStore } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PER_RUN = 100

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const store = serverClaimStore()
  if (!store) return NextResponse.json({ checked: 0, freed: 0, note: 'SUPABASE_SERVICE_ROLE_KEY is not set' })

  const now = Date.now()
  const stale = await store.getStalePendingClaims(new Date(now - STALE_CLAIM_MS), PER_RUN)
  const freed = await settleAll(stale, now, store)
  return NextResponse.json({ checked: stale.length, freed })
}
