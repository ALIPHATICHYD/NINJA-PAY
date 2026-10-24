import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fake PostgREST client that records every query the helpers make.
const state = vi.hoisted(() => ({
  queries: [] as { table: string; select: string; filters: [string, string][] }[],
  rows: [] as unknown[],
  error: null as { message: string } | null,
}))

vi.mock('@/lib/injective/constants', () => ({ SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'anon' }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const query = { table, select: '', filters: [] as [string, string][] }
      state.queries.push(query)
      const result = () => ({ data: state.error ? null : state.rows, error: state.error })
      const builder = {
        select(columns = '*') { query.select = columns; return builder },
        eq(column: string, value: string) { query.filters.push([column, value]); return builder },
        order() { return builder },
        maybeSingle: async () => ({ data: state.error ? null : state.rows[0] ?? null, error: state.error }),
        then: (resolve: (r: unknown) => void) => resolve(result()),
      }
      return builder
    },
  }),
}))

const { getClaimPoolByLink, getClaimPoolsByCreator, toClaimPoolWithClaims } = await import('@/lib/supabase')

const poolRow = (id: string, claims: unknown[] | null) => ({
  id,
  creator_address: 'inj1creator',
  name: 'Team lunch',
  total_amount: '10',
  claim_type: 'equal',
  token: 'USDC',
  escrow_address: 'inj1escrow',
  shares: ['5', '5'],
  link_code: `code-${id}`,
  created_at: '2026-10-21T12:00:00Z',
  claims,
})
const claimRow = (id: string, poolId: string, status: 'pending' | 'paid') => ({
  id, pool_id: poolId, share_index: 0, claimer_address: 'inj1claimer', tx_hash: null, status, created_at: '2026-10-21T12:01:00Z',
})

beforeEach(() => {
  state.queries = []
  state.rows = []
  state.error = null
})

describe('reading claim pools with their claims', () => {
  it('maps a pool row and its embedded claims', () => {
    const { pool, claims } = toClaimPoolWithClaims(poolRow('p1', [claimRow('c1', 'p1', 'paid')]) as never)
    expect(pool).toMatchObject({ id: 'p1', creatorAddress: 'inj1creator', linkCode: 'code-p1', shares: ['5', '5'] })
    expect(claims).toEqual([expect.objectContaining({ id: 'c1', poolId: 'p1', status: 'paid' })])
  })

  it('treats a pool with no embedded claims as having none', () => {
    expect(toClaimPoolWithClaims(poolRow('p1', null) as never).claims).toEqual([])
  })

  it("loads a creator's pools and every claim in one query, however many pools there are", async () => {
    state.rows = Array.from({ length: 25 }, (_, i) => poolRow(`p${i}`, [claimRow(`c${i}`, `p${i}`, 'paid')]))
    const pools = await getClaimPoolsByCreator('inj1creator')
    expect(pools).toHaveLength(25)
    expect(pools[3].claims[0].poolId).toBe('p3')
    expect(state.queries).toEqual([{ table: 'claim_pools', select: '*, claims(*)', filters: [['creator_address', 'inj1creator']] }])
  })

  it('throws when the list cannot be read, rather than showing an empty one', async () => {
    state.error = { message: 'timeout' }
    await expect(getClaimPoolsByCreator('inj1creator')).rejects.toThrow("Couldn't load your claim links")
  })

  it('loads a claim link and its claims in one query', async () => {
    state.rows = [poolRow('p1', [claimRow('c1', 'p1', 'paid'), claimRow('c2', 'p1', 'pending')])]
    const found = await getClaimPoolByLink('code-p1')
    expect(found?.claims.map(c => c.status)).toEqual(['paid', 'pending'])
    expect(state.queries).toHaveLength(1)
    expect(state.queries[0]).toMatchObject({ table: 'claim_pools', select: '*, claims(*)' })
  })

  it('returns null for a link code no pool has', async () => {
    expect(await getClaimPoolByLink('missing')).toBeNull()
  })
})
