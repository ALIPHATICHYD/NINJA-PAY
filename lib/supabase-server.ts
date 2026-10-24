/**
 * Supabase with the service role key, for server routes only. The key skips
 * Row Level Security, so it must never reach the browser: it is read from
 * SUPABASE_SERVICE_ROLE_KEY, which has no NEXT_PUBLIC_ prefix, and only route
 * handlers import this file. The `server-only` import makes the build fail if
 * a browser component ever imports it.
 *
 * Unset, everything here returns null and NinjaPay keeps writing claim links
 * from the browser with the public key, as before.
 */

import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './injective/constants'
import { createClaimStore, type ClaimStore } from './supabase'

let client: SupabaseClient | null = null

export function serviceSupabase(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !key) return null
  client ??= createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}

/** Claim-link writes through the service role, or null when it isn't set up. */
export function serverClaimStore(): ClaimStore | null {
  const db = serviceSupabase()
  return db ? createClaimStore(db) : null
}
