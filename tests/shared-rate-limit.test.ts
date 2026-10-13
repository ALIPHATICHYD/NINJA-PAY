import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  configured: true,
  answers: [] as ({ data: unknown; error: unknown } | Error)[],
  calls: [] as Record<string, unknown>[],
}))
vi.mock('@/lib/supabase-server', () => ({
  serviceSupabase: () =>
    db.configured
      ? {
          rpc: (name: string, args: Record<string, unknown>) => ({
            abortSignal: async () => {
              db.calls.push({ name, ...args })
              const next = db.answers.shift() ?? { data: true, error: null }
              if (next instanceof Error) throw next
              return next
            },
          }),
        }
      : null,
}))

const { createSharedRateLimiter } = await import('@/lib/shared-rate-limit')

beforeEach(() => {
  db.configured = true
  db.answers = []
  db.calls = []
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
})

describe('the shared rate limit', () => {
  it("follows the database's count, which every server instance shares", async () => {
    const limiter = createSharedRateLimiter({ name: 'relay-sender', limit: 10, windowMs: 60 * 60_000 })
    db.answers = [{ data: true, error: null }, { data: false, error: null }]
    expect(await limiter.take('0xabc')).toBe(true)
    expect(await limiter.take('0xabc')).toBe(false)
    expect(db.calls[0]).toMatchObject({ name: 'hit_rate_limit', p_window_seconds: 3600, p_limit: 10 })
  })

  it('stores a keyed hash, never the address itself', async () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678'
    await createSharedRateLimiter({ name: 'relay-sender', limit: 10, windowMs: 1000 }).take(address)
    const key = String(db.calls[0].p_key)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(key).not.toContain(address.slice(2))
    // Different limits count the same address separately.
    await createSharedRateLimiter({ name: 'relay-all', limit: 10, windowMs: 1000 }).take(address)
    expect(db.calls[1].p_key).not.toBe(key)
  })

  it("counts in this instance's memory when the database errors, is unreachable, or isn't set up", async () => {
    const limiter = createSharedRateLimiter({ name: 'x', limit: 2, windowMs: 60_000 })
    db.answers = [{ data: null, error: { message: 'function hit_rate_limit does not exist' } }, new Error('timeout')]
    expect(await limiter.take('k', 0)).toBe(true)
    expect(await limiter.take('k', 1)).toBe(true)
    db.configured = false
    expect(await limiter.take('k', 2)).toBe(false)
  })
})
