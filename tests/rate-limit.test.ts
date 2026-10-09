import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '@/lib/rate-limit'

describe('rate limiter', () => {
  it('allows `limit` uses per key in the window, then again once the oldest falls out', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000 })
    expect([limiter.take('a', 0), limiter.take('a', 100), limiter.take('a', 200)]).toEqual([true, true, false])
    expect(limiter.take('b', 200)).toBe(true)
    // A refused use isn't counted, so the window frees up at 1,000.
    expect(limiter.take('a', 999)).toBe(false)
    expect(limiter.take('a', 1_000)).toBe(true)
    expect(limiter.take('a', 1_050)).toBe(false)
  })
})
