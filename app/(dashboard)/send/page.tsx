'use client'

import { useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { createMsgSendINJ, createMsgSendUSDT, toWei, fromWei } from '@/lib/injective/bank'
import { broadcastTxMessage } from '@/lib/injective/broadcast'
import { recordTransaction } from '@/lib/supabase'

export default function SendPage() {
  const { address, isConnected } = useWallet()
  const { inj, usdt } = useBalance(address)

  const [token, setToken] = useState<'inj' | 'usdt'>('inj')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | null
    message: string
  }>({ type: null, message: '' })

  const maxAmount = token === 'inj' ? fromWei(inj) : fromWei(usdt)
  const canSend =
    amount && parseFloat(amount) > 0 && parseFloat(amount) <= parseFloat(maxAmount)

  const handleSend = async () => {
    if (!address || !recipient || !amount) {
      setStatus({ type: 'error', message: 'Please fill in all fields' })
      return
    }

    setLoading(true)
    setStatus({ type: null, message: '' })

    try {
      // Create the appropriate message
      const amountInWei = toWei(amount)
      const msg =
        token === 'inj'
          ? createMsgSendINJ(recipient, amountInWei)
          : createMsgSendUSDT(recipient, amountInWei)

      // Broadcast transaction
      const txHash = await broadcastTxMessage(msg, address)

      // Record transaction
      await recordTransaction({
        userAddress: address,
        type: 'send',
        status: 'pending',
        amount: amountInWei,
        recipient,
        txHash,
      })

      setStatus({
        type: 'success',
        message: `✓ Sent ${amount} ${token.toUpperCase()} to ${recipient.slice(0, 10)}...`,
      })

      setRecipient('')
      setAmount('')
    } catch (error: any) {
      setStatus({
        type: 'error',
        message: error.message || 'Failed to send transaction',
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
            Please connect your wallet using the button in the top right
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Send Tokens</h1>
        <p className="text-gray-600 mb-8">
          Send INJ or USDT to another wallet address
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-8 space-y-6">
        {/* Token Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Token
          </label>
          <div className="flex gap-4">
            {['inj', 'usdt'].map((t) => (
              <button
                key={t}
                onClick={() => setToken(t as 'inj' | 'usdt')}
                className={`flex-1 py-3 px-4 rounded-lg font-semibold transition ${
                  token === t
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Available: {maxAmount} {token.toUpperCase()}
          </p>
        </div>

        {/* Recipient Address */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Recipient Address
          </label>
          <input
            type="text"
            placeholder="inj1abc..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount ({token.toUpperCase()})
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              step="0.001"
              min="0"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={() => setAmount(maxAmount)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition"
            >
              Max
            </button>
          </div>
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

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={loading || !canSend}
          className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Sending...' : `Send ${token.toUpperCase()}`}
        </button>
      </div>
    </div>
  )
}
