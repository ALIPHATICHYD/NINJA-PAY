import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from './injective/constants'
import { ClaimPool } from './injective/types'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

/**
 * Create a new claim pool
 */
export async function createClaimPool(
  pool: Omit<ClaimPool, 'id' | 'claimedBy'>
): Promise<ClaimPool> {
  try {
    const { data, error } = await supabase
      .from('claim_pools')
      .insert({
        creator_address: pool.creatorAddress,
        total_amount: pool.totalAmount,
        claim_type: pool.claimType,
        shares: pool.shares,
        claimed_by: [],
        link_code: pool.linkCode,
        created_at: new Date(),
      })
      .select()
      .single()

    if (error) throw error

    return {
      id: data.id,
      creatorAddress: data.creator_address,
      totalAmount: data.total_amount,
      claimType: data.claim_type,
      shares: data.shares,
      claimedBy: data.claimed_by || [],
      linkCode: data.link_code,
      createdAt: new Date(data.created_at),
    }
  } catch (error) {
    console.error('Failed to create claim pool:', error)
    throw error
  }
}

/**
 * Get claim pool by link code
 */
export async function getClaimPoolByLink(
  linkCode: string
): Promise<ClaimPool | null> {
  try {
    const { data, error } = await supabase
      .from('claim_pools')
      .select()
      .eq('link_code', linkCode)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      throw error
    }

    return {
      id: data.id,
      creatorAddress: data.creator_address,
      totalAmount: data.total_amount,
      claimType: data.claim_type,
      shares: data.shares,
      claimedBy: data.claimed_by || [],
      linkCode: data.link_code,
      createdAt: new Date(data.created_at),
    }
  } catch (error) {
    console.error('Failed to get claim pool:', error)
    throw error
  }
}

/**
 * Get all claim pools created by a user
 */
export async function getClaimPoolsByCreator(
  creatorAddress: string
): Promise<ClaimPool[]> {
  try {
    const { data, error } = await supabase
      .from('claim_pools')
      .select()
      .eq('creator_address', creatorAddress)
      .order('created_at', { ascending: false })

    if (error) throw error

    return (data || []).map((pool) => ({
      id: pool.id,
      creatorAddress: pool.creator_address,
      totalAmount: pool.total_amount,
      claimType: pool.claim_type,
      shares: pool.shares,
      claimedBy: pool.claimed_by || [],
      linkCode: pool.link_code,
      createdAt: new Date(pool.created_at),
    }))
  } catch (error) {
    console.error('Failed to get claim pools:', error)
    return []
  }
}

/**
 * Mark a claim as claimed
 */
export async function markClaimAsClaimed(
  poolId: string,
  claimerAddress: string
): Promise<void> {
  try {
    // Get current claimed_by
    const { data: pool, error: fetchError } = await supabase
      .from('claim_pools')
      .select('claimed_by')
      .eq('id', poolId)
      .single()

    if (fetchError) throw fetchError

    const claimedBy = pool.claimed_by || []

    // Add new claimer if not already claimed
    if (!claimedBy.includes(claimerAddress)) {
      claimedBy.push(claimerAddress)

      const { error: updateError } = await supabase
        .from('claim_pools')
        .update({ claimed_by: claimedBy })
        .eq('id', poolId)

      if (updateError) throw updateError
    }
  } catch (error) {
    console.error('Failed to mark claim as claimed:', error)
    throw error
  }
}

/**
 * Check if an address has already claimed
 */
export async function hasUserClaimed(
  poolId: string,
  userAddress: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('claim_pools')
      .select('claimed_by')
      .eq('id', poolId)
      .single()

    if (error) throw error

    return (data.claimed_by || []).includes(userAddress)
  } catch (error) {
    console.error('Failed to check user claim status:', error)
    return false
  }
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
      created_at: new Date(),
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
