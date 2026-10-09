/**
 * A sliding-window counter kept in this server instance's memory. On Vercel
 * each instance counts on its own and forgets on restart, so it slows abuse
 * down rather than stopping it; a shared store would be needed for a hard cap.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>()
  return {
    /** Counts one use by `key`, or returns false without counting it if `key` is over the limit. */
    take(key: string, now: number = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter(at => now - at < windowMs)
      const allowed = recent.length < limit
      if (allowed) recent.push(now)
      hits.set(key, recent)
      if (hits.size > 10_000) {
        for (const [k, times] of hits) if (times.every(at => now - at >= windowMs)) hits.delete(k)
      }
      return allowed
    },
  }
}
