'use client'

import { useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { createClaimPool, getClaimPoolsByCreator } from '@/lib/supabase'
import { toWei } from '@/lib/injective/bank'
import { useEffect } from 'react'

interface ClaimShare {
  address: string
  amount: string
}

export default function ClaimsPage() {
  const { address, isConnected } = useWallet()
  const [tab, setTab] = useState<'create' | 'view'>('create')
  const [claimType, setClaimType] = useState<'equal' | 'percentage' | 'custom'>('equal')
  const [totalAmount, setTotalAmount] = useState('')
  const [recipients, setRecipients] = useState<ClaimShare[]>([
    { address: '', amount: '' },
  ])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | null
    message: string
  }>({ type: null, message: '' })
  const [createdPools, setCreatedPools] = useState<any[]>([])

  // Load created pools
  const loadPools = async () => {
    if (!address) return
    try {
      const pools = await getClaimPoolsByCreator(address)
      setCreatedPools(pools)
    } catch (error) {
      console.error('Failed to load pools:', error)
    }
  }

  useEffect(() => {
    if (address) {
      loadPools()
    }
  }, [address])

  const addRecipient = () => {
    setRecipients([...recipients, { address: '', amount: '' }])
  }

  const removeRecipient = (index: number) => {
    setRecipients(recipients.filter((_, i) => i !== index))
  }

  const updateRecipient = (
    index: number,
    field: 'address' | 'amount',
    value: string
  ) => {
    const updated = [...recipients]
    updated[index] = { ...updated[index], [field]: value }
    setRecipients(updated)
  }

  const generateLinkCode = () =>
    `claim_${Math.random().toString(36).substr(2, 9)}`

  const handleCreateClaim = async () => {
    if (!address || !totalAmount || recipients.some((r) => !r.address)) {
      setStatus({ type: 'error', message: 'Please fill in all required fields' })
      return
    }

    setLoading(true)
    setStatus({ type: null, message: '' })

    try {
      const shares = recipients.map((r) => ({
        address: r.address,
        amount: toWei(r.amount || (parseFloat(totalAmount) / recipients.length).toString()),
      }))

      const linkCode = generateLinkCode()

      const pool = await createClaimPool({
        creatorAddress: address,
        totalAmount: toWei(totalAmount),
        claimType,
        shares,
        claimedBy: [],
        linkCode,
        link: `/claim/${linkCode}`,
        createdAt: new Date(),
      })

      setStatus({
        type: 'success',
        message: `✓ Claim pool created! Share link: /claim/${linkCode}`,
      })

      // Reset form
      setTotalAmount('')
      setRecipients([{ address: '', amount: '' }])

      // Reload pools
      loadPools()
    } catch (error: any) {
      setStatus({
        type: 'error',
        message: error.message || 'Failed to create claim pool',
      })
    } finally {
      setLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="font-semibold text-yellow-900 mb-2">Wallet Not Connected</h2>
          <p className="text-yellow-700">
            Please connect your wallet to create claims
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Claim Pools</h1>
        <p className="text-gray-600">
          Create shareable reward distributions and giveaway links
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b border-gray-200">
        <button
          onClick={() => setTab('create')}
          className={`px-4 py-2 font-semibold border-b-2 transition ${
            tab === 'create'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Create Pool
        </button>
        <button
          onClick={() => setTab('view')}
          className={`px-4 py-2 font-semibold border-b-2 transition ${
            tab === 'view'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          My Pools ({createdPools.length})
        </button>
      </div>

      {/* Create Tab */}
      {tab === 'create' && (
        <div className="bg-white rounded-lg shadow p-8 space-y-6">
          {/* Total Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Total Amount (INJ)
            </label>
            <input
              type="number"
              placeholder="100"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              step="0.001"
              min="0"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Distribution Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Distribution Type
            </label>
            <div className="flex gap-4">
              {['equal', 'percentage', 'custom'].map((type) => (
                <label key={type} className="flex items-center gap-2">
                  <input
                    type="radio"
                    value={type}
                    checked={claimType === type}
                    onChange={(e) => setClaimType(e.target.value as any)}
                    className="w-4 h-4"
                  />
                  <span className="text-gray-700 capitalize">{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Recipients
            </label>
            <div className="space-y-3">
              {recipients.map((recipient, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="inj1abc..."
                    value={recipient.address}
                    onChange={(e) =>
                      updateRecipient(index, 'address', e.target.value)
                    }
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {claimType === 'custom' && (
                    <input
                      type="number"
                      placeholder="Amount"
                      value={recipient.amount}
                      onChange={(e) =>
                        updateRecipient(index, 'amount', e.target.value)
                      }
                      className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  )}
                  {recipients.length > 1 && (
                    <button
                      onClick={() => removeRecipient(index)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addRecipient}
              className="mt-3 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              + Add Recipient
            </button>
          </div>

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

          {/* Create Button */}
          <button
            onClick={handleCreateClaim}
            disabled={loading || !totalAmount || !recipients[0]?.address}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Creating...' : 'Create Claim Pool'}
          </button>
        </div>
      )}

      {/* View Tab */}
      {tab === 'view' && (
        <div className="space-y-4">
          {createdPools.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center text-gray-600">
              No claim pools created yet
            </div>
          ) : (
            createdPools.map((pool) => (
              <div
                key={pool.id}
                className="bg-white rounded-lg shadow p-6 space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900">Pool ID: {pool.id.slice(0, 8)}</h3>
                    <p className="text-sm text-gray-600">
                      Type: {pool.claimType} • Recipients: {pool.shares.length}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/claim/${pool.linkCode}`
                      navigator.clipboard.writeText(url)
                      alert('Link copied to clipboard!')
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
