/**
 * A rate limit counted in the database, so every server instance shares one
 * count and a restart doesn't reset it. It needs SUPABASE_SERVICE_ROLE_KEY and
 * the hit_rate_limit function from sql/phase2-rate-limits.sql. Without them,
 * or when the database doesn't answer within 3 seconds, it counts in this
 * instance's memory instead (lib/rate-limit.ts), as NinjaPay did before.
 *
 * Windows are fixed: an hour-long window starts on the hour. So across the
 * turn of a window a key can get up to twice its limit. Keys are stored as
 * HMACs, never as the addresses they count.
 */

import { createHmac } from 'node:crypto'
import { createRateLimiter } from './rate-limit'
import { serviceSupabase } from './supabase-server'

const DB_TIMEOUT_MS = 3_000

export function createSharedRateLimiter({ name, limit, windowMs }: { name: string; limit: number; windowMs: number }) {
  const local = createRateLimiter({ limit, windowMs })
  return {
    /** Counts one use by `key`, and says whether it is within the limit. */
    async take(key: string, now: number = Date.now()): Promise<boolean> {
      const db = serviceSupabase()
      if (db) {
        try {
          const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
          const { data, error } = await db
            .rpc('hit_rate_limit', {
              p_key: createHmac('sha256', secret).update(`${name}:${key}`).digest('hex'),
              p_window_seconds: Math.round(windowMs / 1000),
              p_limit: limit,
            })
            .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
          if (!error && typeof data === 'boolean') return data
        } catch {
          // Fall through to this instance's own count.
        }
      }
      return local.take(key, now)
    },
  }
}
