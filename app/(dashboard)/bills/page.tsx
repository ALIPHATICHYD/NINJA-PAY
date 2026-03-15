'use client'

import { useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { mockPurchaseBill, BILL_SERVICES } from '@/lib/vtpass'
import { toWei } from '@/lib/injective/bank'
import { recordTransaction } from '@/lib/supabase'

export default function BillsPage() {
  const { address, isConnected } = useWallet()
  const { usdt } = useBalance(address)

  const [billType, setBillType] = useState<'airtime' | 'data' | 'electricity' | 'cable'>(
    'airtime'
  )
  const [provider, setProvider] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | null
    message: string
  }>({ type: null, message: '' })

  const providers: { [key: string]: string[] } = {
    airtime: ['mtn', 'glo', 'airtel', '9mobile'],
    data: ['mtn', 'glo', 'airtel', '9mobile'],
    electricity: ['ekedc', 'ikedc', 'phcn', 'bedc'],
    cable: ['dstv', 'gotv', 'startimes'],
  }

  const placeholders: { [key: string]: string } = {
    airtime: 'Phone number (e.g., 08012345678)',
    data: 'Phone number (e.g., 08012345678)',
    electricity: 'Meter number (e.g., 12345678901)',
    cable: 'Smart card number',
  }

  const handlePay = async () => {
    if (!address || !provider || !identifier || !amount) {
      setStatus({ type: 'error', message: 'Please fill in all fields' })
      return
    }

    setLoading(true)
    setStatus({ type: null, message: '' })

    try {
      // Mock bill purchase (in production, use real VTPass API)
      const result = await mockPurchaseBill(
        `${billType}-${provider}`,
        identifier,
        parseInt(amount)
      )

      // Record transaction
      if (result.success && address) {
        await recordTransaction({
          userAddress: address,
          type: 'bills',
          status: 'pending',
          amount: toWei(amount),
          recipient: `${provider}-${identifier}`,
          txHash: result.transactionId,
        })
      }

      setStatus({
        type: 'success',
        message: `✓ Bill payment initiated for ${provider.toUpperCase()}`,
      })

      setIdentifier('')
      setAmount('')
    } catch (error: any) {
      setStatus({
        type: 'error',
        message: error.message || 'Failed to process bill payment',
      })
    } finally {
      setLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="font-semibold text-yellow-900 mb-2">Wallet Not Connected</h2>
          <p className="text-yellow-700">
            Please connect your wallet to pay bills
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Pay Bills</h1>
        <p className="text-gray-600 mb-8">
          Pay for airtime, data, electricity, or cable using INJ/USDT
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-8 space-y-6">
        {/* Bill Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Bill Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {['airtime', 'data', 'electricity', 'cable'].map((type) => (
              <button
                key={type}
                onClick={() => {
                  setBillType(type as any)
                  setProvider('')
                }}
                className={`py-2 px-4 rounded-lg font-medium transition capitalize ${
                  billType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Provider */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Provider
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent capitalize"
          >
            <option value="">Select provider</option>
            {providers[billType]?.map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Identifier */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {billType === 'electricity' ? 'Meter Number' : 'Identifier'}
          </label>
          <input
            type="text"
            placeholder={placeholders[billType]}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount (NGN)
          </label>
          <input
            type="number"
            placeholder="1000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-2">
            You'll pay with equivalent USDT from your balance
          </p>
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

        {/* Pay Button */}
        <button
          onClick={handlePay}
          disabled={loading || !provider || !identifier || !amount}
          className="w-full py-3 px-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Processing...' : 'Pay Bill'}
        </button>
      </div>
    </div>
  )
}
