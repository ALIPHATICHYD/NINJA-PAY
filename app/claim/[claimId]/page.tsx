'use client'

import { useEffect, useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { getClaimPoolByLink, markClaimAsClaimed, hasUserClaimed } from '@/lib/supabase'
import { broadcastTxMessage } from '@/lib/injective/broadcast'
import { createMsgSendINJ } from '@/lib/injective/bank'

export default function PublicClaimPage({
  params,
}: {
  params: { claimId: string }
}) {
  const { address, isConnected, connect } = useWallet()
  const [pool, setPool] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [alreadyClaimed, setAlreadyClaimed] = useState(false)
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | null
    message: string
  }>({ type: null, message: '' })

  // Load claim pool on mount
  useEffect(() => {
    const loadPool = async () => {
      try {
        const p = await getClaimPoolByLink(params.claimId)
        setPool(p)

        if (p && isConnected && address) {
          const claimed = await hasUserClaimed(p.id, address)
          setAlreadyClaimed(claimed)
        }
      } catch (error) {
        console.error('Failed to load pool:', error)
        setStatus({ type: 'error', message: 'Pool not found' })
      } finally {
        setLoading(false)
      }
    }

    loadPool()
  }, [params.claimId, isConnected, address])

  const handleClaim = async () => {
    if (!address || !pool) return

    setClaiming(true)
    setStatus({ type: null, message: '' })

    try {
      // Find user's share
      const userShare = pool.shares.find((s: any) => s.address === address)
      if (!userShare) {
        setStatus({ type: 'error', message: 'Your address is not in this claim pool' })
        setClaiming(false)
        return
      }

      // In a real implementation, the backend would handle the actual MsgSend
      // For demo, we'll just mark it as claimed
      await markClaimAsClaimed(pool.id, address)

      setStatus({
        type: 'success',
        message: `✓ Successfully claimed ${userShare.amount} INJ!`,
      })
      setAlreadyClaimed(true)
    } catch (error: any) {
      setStatus({
        type: 'error',
        message: error.message || 'Failed to claim reward',
      })
    } finally {
      setClaiming(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (!pool) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="font-semibold text-red-900 mb-2">Claim Not Found</h2>
          <p className="text-red-700">
            This claim pool doesn't exist or has expired
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8 space-y-6 text-center">
          {/* Icon */}
          <div className="text-6xl">🎁</div>

          {/* Title */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">You Have a Gift!</h1>
            <p className="text-gray-600">
              Someone has created a claim pool for you
            </p>
          </div>

          {/* Pool Info */}
          <div className="bg-blue-50 rounded-lg p-4 space-y-2">
            <div>
              <p className="text-xs text-gray-600">Distribution Type</p>
              <p className="font-semibold text-gray-900 capitalize">
                {pool.claimType}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Total Pool</p>
              <p className="font-semibold text-gray-900">{pool.totalAmount} INJ</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Recipients</p>
              <p className="font-semibold text-gray-900">{pool.shares.length} people</p>
            </div>
          </div>

          {/* Your Share */}
          {isConnected && address && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-xs text-gray-600 mb-1">Your Share</p>
              <p className="text-2xl font-bold text-green-600">
                {pool.shares.find((s: any) => s.address === address)?.amount ||
                  'Address not found'}{' '}
                INJ
              </p>
            </div>
          )}

          {/* Status Message */}
          {status.type && (
            <div
              className={`p-4 rounded-lg ${
                status.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {status.message}
            </div>
          )}

          {/* Wallet Connection */}
          {!isConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Connect your wallet to claim your reward
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => connect('keplr')}
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
                >
                  Keplr
                </button>
                <button
                  onClick={() => connect('leap')}
                  className="flex-1 py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-semibold"
                >
                  Leap
                </button>
              </div>
            </div>
          ) : alreadyClaimed ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-700 font-semibold">✓ Already Claimed</p>
              <p className="text-sm text-blue-600 mt-1">
                You've already claimed your reward from this pool
              </p>
            </div>
          ) : (
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full py-3 px-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {claiming ? 'Claiming...' : 'Claim My Reward'}
            </button>
          )}

          {/* Address Display */}
          {isConnected && address && (
            <div className="text-xs text-gray-500 pt-4 border-t border-gray-200">
              Connected: {address.slice(0, 10)}...{address.slice(-4)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
