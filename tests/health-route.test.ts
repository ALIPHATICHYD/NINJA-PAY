import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const deps = vi.hoisted(() => ({
  chain: { ok: true } as { ok: true } | { ok: false; reason: string },
  evm: { ok: true } as { ok: true } | { ok: false; reason: string },
  database: true,
  calls: 0,
}))

vi.mock('@/lib/injective/health', () => ({
  checkCosmosHealth: async () => { deps.calls++; return deps.chain },
  checkEvmHealth: async () => deps.evm,
}))
vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: true, pingDatabase: async () => deps.database }))

beforeEach(() => {
  deps.chain = { ok: true }
  deps.evm = { ok: true }
  deps.database = true
  deps.calls = 0
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

const health = async () => {
  const { GET } = await import('@/app/api/health/route')
  const response = await GET()
  return { status: response.status, body: await response.json() }
}

describe('health check', () => {
  it('answers 200 when everything is up, with the relay off', async () => {
    vi.stubEnv('USDC_RELAY_FACILITATOR_URL', '')
    vi.stubEnv('USDC_RELAYER_PRIVATE_KEY', '')
    const { status, body } = await health()
    expect(status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.checks.relay).toEqual({ ok: true, detail: 'off' })
  })

  it('answers 503 and says which part is down', async () => {
    deps.chain = { ok: false, reason: "Injective testnet's last block was 5 minutes ago, so sending is paused." }
    deps.database = false
    const { status, body } = await health()
    expect(status).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.checks.chain).toEqual({ ok: false, detail: deps.chain.reason })
    expect(body.checks.database).toEqual({ ok: false, detail: 'not answering' })
    expect(body.checks.evm.ok).toBe(true)
  })

  it('reuses its answer for 15 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.UTC(2030, 0, 1))
    const { GET } = await import('@/app/api/health/route')
    await GET()
    await GET()
    expect(deps.calls).toBe(1)
    vi.setSystemTime(Date.UTC(2030, 0, 1, 0, 0, 16))
    await GET()
    expect(deps.calls).toBe(2)
  })

  it('never shows the relayer key or address', async () => {
    vi.stubEnv('USDC_RELAYER_PRIVATE_KEY', `0x${'1'.repeat(64)}`)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const { body } = await health()
    expect(JSON.stringify(body)).not.toMatch(/1111|0x[0-9a-f]{40}/i)
    expect(body.checks.relay.ok).toBe(false)
    vi.unstubAllGlobals()
  })
})
