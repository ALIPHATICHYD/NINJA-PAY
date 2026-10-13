import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from './injective/constants'
import { ClaimPool, ClaimRecord } from './injective/types'

let _supabase: SupabaseClient | null = null

/** False when .env.local is missing the Supabase URL or anon key. Check before calling any helper. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

export const SUPABASE_SETUP_MESSAGE =
  'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server.'

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    if (!isSupabaseConfigured) {
      throw new Error(SUPABASE_SETUP_MESSAGE)
    }
    _supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  }
  return _supabase
}

// Convenience alias so existing code stays the same
const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as any)[prop]
  },
})

type ClaimPoolRow = {
  id: string
  creator_address: string
  name: string | null
  total_amount: string
  claim_type: ClaimPool['claimType']
  token: ClaimPool['token'] | null
  escrow_address: string | null
  shares: ClaimPool['shares'] | null
  link_code: string
  created_at: string
}

type ClaimRow = {
  id: string
  pool_id: string
  share_index: number
  claimer_address: string
  tx_hash: string | null
  status: ClaimRecord['status']
  created_at?: string
}

function toClaimPool(row: ClaimPoolRow): ClaimPool {
  return {
    id: row.id,
    creatorAddress: row.creator_address,
    name: row.name ?? undefined,
    totalAmount: row.total_amount,
    claimType: row.claim_type,
    token: row.token ?? null,
    escrowAddress: row.escrow_address ?? null,
    shares: row.shares || [],
    linkCode: row.link_code,
    createdAt: new Date(row.created_at),
  }
}

/** Whether the database answers a trivial read within five seconds. Reads no rows. */
export async function pingDatabase(): Promise<boolean> {
  if (!isSupabaseConfigured) return false
  try {
    const { error } = await supabase
      .from('claim_pools')
      .select('id', { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(5_000))
    return !error
  } catch {
    return false
  }
}

// Postgres error codes surfaced by PostgREST
const UNIQUE_VIOLATION = '23505'
const NO_ROWS = 'PGRST116'

/**
 * Create a claim pool row. Only the escrow's public address is stored; the
 * escrow key never leaves the creator's browser.
 */
export async function createClaimPool(
  pool: Omit<ClaimPool, 'id' | 'createdAt'>
): Promise<ClaimPool> {
  const { data, error } = await supabase
    .from('claim_pools')
    .insert({
      creator_address: pool.creatorAddress,
      name: pool.name,
      total_amount: pool.totalAmount,
      claim_type: pool.claimType,
      token: pool.token,
      escrow_address: pool.escrowAddress,
      shares: pool.shares,
      claimed_by: [],
      link_code: pool.linkCode,
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create claim pool:', error)
    throw new Error(
      error.message?.includes('escrow_address') || error.message?.includes('token')
        ? 'The database is missing the claim escrow columns. Run the migration in the README.'
        : error.message || 'Failed to save the claim pool.'
    )
  }
  return toClaimPool(data)
}

export async function getClaimPoolByLink(linkCode: string): Promise<ClaimPool | null> {
  const { data, error } = await supabase
    .from('claim_pools')
    .select()
    .eq('link_code', linkCode)
    .single()

  if (error) {
    if (error.code === NO_ROWS) return null
    console.error('Failed to get claim pool:', error)
    throw error
  }
  return toClaimPool(data)
}

export async function getClaimPoolsByCreator(creatorAddress: string): Promise<ClaimPool[]> {
  const { data, error } = await supabase
    .from('claim_pools')
    .select()
    .eq('creator_address', creatorAddress)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to get claim pools:', error)
    return []
  }
  return (data || []).map(toClaimPool)
}

/**
 * Map claim-pool escrow addresses to their pool, so on-chain activity with an
 * escrow can be labelled as a claim. Addresses that are not escrows are omitted.
 */
export async function resolveClaimEscrows(
  addresses: string[]
): Promise<Map<string, { poolName: string; creatorAddress: string }>> {
  const result = new Map<string, { poolName: string; creatorAddress: string }>()
  if (!isSupabaseConfigured || addresses.length === 0) return result
  const { data, error } = await supabase
    .from('claim_pools')
    .select('escrow_address, name, link_code, creator_address')
    .in('escrow_address', addresses)
  if (error) {
    console.error('Failed to resolve claim escrows:', error)
    return result
  }
  for (const row of data ?? []) {
    result.set(row.escrow_address, {
      poolName: row.name || `Claim ${String(row.link_code).slice(0, 4)}`,
      creatorAddress: row.creator_address,
    })
  }
  return result
}

function toClaimRecord(row: ClaimRow): ClaimRecord {
  return {
    id: row.id,
    poolId: row.pool_id,
    shareIndex: row.share_index,
    claimerAddress: row.claimer_address,
    txHash: row.tx_hash,
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
  }
}

export async function getClaimsForPools(poolIds: string[]): Promise<ClaimRecord[]> {
  if (poolIds.length === 0) return []
  const { data, error } = await supabase.from('claims').select().in('pool_id', poolIds)
  if (error) {
    console.error('Failed to load claims:', error)
    return []
  }
  return (data || []).map(toClaimRecord)
}

/** Like getClaimsForPools, but a failed read throws: reserving must not mistake it for an empty pool. */
async function readClaims(poolId: string): Promise<ClaimRecord[]> {
  const { data, error } = await supabase.from('claims').select().eq('pool_id', poolId)
  if (error) throw new Error(error.message || "Couldn't read this link's claims. Try again.")
  return (data || []).map(toClaimRecord)
}

export async function getClaimByClaimer(poolId: string, claimerAddress: string): Promise<ClaimRecord | null> {
  const { data, error } = await supabase
    .from('claims')
    .select()
    .eq('pool_id', poolId)
    .eq('claimer_address', claimerAddress)
    .maybeSingle()
  if (error) {
    console.error('Failed to check claim status:', error)
    return null
  }
  return data ? toClaimRecord(data) : null
}

/**
 * Reserve a free share for a claimer. The claims table has unique
 * (pool_id, share_index) and unique (pool_id, claimer_address) constraints,
 * so the insert itself is the lock: two claimers can never get the same
 * share, and one address can never hold two shares. Each claimer tries a
 * random free share, so a crowd arriving together doesn't all race for the
 * same one.
 */
export async function reserveClaimShare(
  pool: ClaimPool,
  claimerAddress: string,
  random: () => number = Math.random,
): Promise<{ record: ClaimRecord } | { error: 'already-claimed' | 'fully-claimed' }> {
  for (let attempt = 0; attempt < pool.shares.length; attempt++) {
    const taken = new Set((await readClaims(pool.id)).map(c => c.shareIndex))
    const freeShares = pool.shares.map((_, i) => i).filter(i => !taken.has(i))
    if (freeShares.length === 0) return { error: 'fully-claimed' }
    const free = freeShares[Math.floor(random() * freeShares.length)]

    const { data, error } = await supabase
      .from('claims')
      .insert({ pool_id: pool.id, share_index: free, claimer_address: claimerAddress, status: 'pending' })
      .select()
      .single()

    if (!error) return { record: toClaimRecord(data) }
    if (error.code !== UNIQUE_VIOLATION) throw new Error(error.message || 'Failed to reserve a share.')
    if (error.message?.includes('claims_one_per_claimer')) return { error: 'already-claimed' }
    // Someone else took this share between our read and insert; try the next one.
  }
  return { error: 'fully-claimed' }
}

/**
 * Record the payout's hash on its reservation before the payout is sent, so a
 * claim interrupted at any point can be checked against the chain later.
 * Throws if it can't be saved: the payout must not go out unrecorded.
 */
export async function recordClaimTx(claimId: string, txHash: string): Promise<void> {
  const { error } = await supabase.from('claims').update({ tx_hash: txHash }).eq('id', claimId).eq('status', 'pending')
  if (error) throw new Error("Couldn't save your claim before sending it, so nothing was sent. Try again.")
}

/** Pending reservations in a pool, for recovery. */
export async function getPendingClaims(poolId: string): Promise<ClaimRecord[]> {
  return (await readClaims(poolId)).filter(c => c.status === 'pending')
}

export async function markClaimPaid(claimId: string, txHash: string): Promise<void> {
  const { error } = await supabase.from('claims').update({ status: 'paid', tx_hash: txHash }).eq('id', claimId)
  // The payout already happened on-chain; a failed status write is logged, not surfaced.
  if (error) console.error('Failed to mark claim paid:', error)
}

/** Release a reservation after a failed payout so the share can be claimed again. */
export async function releaseClaim(claimId: string): Promise<void> {
  const { error } = await supabase.from('claims').delete().eq('id', claimId).eq('status', 'pending')
  if (error) console.error('Failed to release claim reservation:', error)
}

/**
 * Record a transaction in the database
 */
export async function recordTransaction(transaction: {
  userAddress: string
  type: 'send' | 'bills' | 'claim' | 'payroll'
  status: 'pending' | 'confirmed' | 'failed'
  amount: string
  recipient: string
  txHash?: string
}): Promise<void> {
  try {
    const { error } = await supabase.from('transactions').insert({
      user_address: transaction.userAddress,
      type: transaction.type,
      status: transaction.status,
      amount: transaction.amount,
      recipient: transaction.recipient,
      tx_hash: transaction.txHash,
      created_at: new Date().toISOString(),
    })

    if (error) throw error
  } catch (error) {
    console.error('Failed to record transaction:', error)
    // Don't throw - this is non-critical for the user experience
  }
}

/**
 * Get transaction history for a user
 */
export async function getTransactionHistory(
  userAddress: string,
  limit: number = 50
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select()
      .eq('user_address', userAddress)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return data || []
  } catch (error) {
    console.error('Failed to get transaction history:', error)
    return []
  }
}
