import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClaimRecord } from '@/lib/injective/types'

const state = vi.hoisted(() => ({ stale: [] as ClaimRecord[], before: null as Date | null, settled: [] as string[], fail: false, alerts: [] as string[] }))
vi.mock('@/lib/supabase-server', () => ({
  serverClaimStore: () => ({
    getStalePendingClaims: async (before: Date) => {
      if (state.fail) throw new Error('database down')
      state.before = before
      return state.stale
    },
  }),
}))
vi.mock('@/lib/alerts', () => ({ alertOperator: async (key: string) => { state.alerts.push(key); return true } }))
vi.mock('@/lib/claim-recovery', () => ({
  STALE_CLAIM_MS: 10 * 60_000,
  settleAll: async (claims: ClaimRecord[]) => {
    state.settled.push(...claims.map(c => c.id))
    return 1
  },
}))

const { GET } = await import('@/app/api/cron/settle-claims/route')
const run = (authorization?: string) =>
  GET(new Request('http://localhost/api/cron/settle-claims', { headers: authorization ? { authorization } : {} }))

afterEach(() => vi.unstubAllEnvs())

describe('the daily claim-settling job', () => {
  it('does nothing for a caller without the cron secret', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await run('Bearer ')).status).toBe(401)
    vi.stubEnv('CRON_SECRET', 'right')
    expect((await run('Bearer wrong')).status).toBe(401)
    expect((await run()).status).toBe(401)
    expect(state.settled).toEqual([])
  })

  it('settles reservations over 10 minutes old', async () => {
    vi.stubEnv('CRON_SECRET', 'right')
    state.stale = [{ id: 'a', poolId: 'p', shareIndex: 0, claimerAddress: 'inj1a', txHash: null, status: 'pending' }]
    const response = await run('Bearer right')
    expect(await response.json()).toEqual({ checked: 1, freed: 1 })
    expect(state.settled).toEqual(['a'])
    expect(Date.now() - state.before!.getTime()).toBeGreaterThanOrEqual(10 * 60_000)
  })

  it('alerts the operator and answers 500 when the job fails', async () => {
    vi.stubEnv('CRON_SECRET', 'right')
    state.fail = true
    const response = await run('Bearer right')
    expect(response.status).toBe(500)
    expect(state.alerts).toEqual(['cron:settle-claims'])
    state.fail = false
  })
})
