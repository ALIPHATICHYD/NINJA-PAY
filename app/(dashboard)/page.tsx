'use client'

import Link from 'next/link'
import { BalanceCard } from '@/components/BalanceCard'
import { useWallet } from '@/hooks/useWallet'

export default function DashboardPage() {
  const { address, isConnected } = useWallet()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome to NinjaPay</h1>
        <p className="text-gray-600">
          Africa's crypto super-app for bills, payroll, and rewards — powered by Injective
        </p>
      </div>

      {/* Balance Card */}
      {isConnected && (
        <BalanceCard address={address} />
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/dashboard/send"
            className="bg-white rounded-lg p-6 shadow hover:shadow-lg transition border-l-4 border-blue-600"
          >
            <div className="text-3xl mb-2">💸</div>
            <h3 className="font-semibold text-gray-900">Send</h3>
            <p className="text-sm text-gray-600">Send INJ/USDT to wallets</p>
          </Link>

          <Link
            href="/dashboard/bills"
            className="bg-white rounded-lg p-6 shadow hover:shadow-lg transition border-l-4 border-green-600"
          >
            <div className="text-3xl mb-2">📱</div>
            <h3 className="font-semibold text-gray-900">Pay Bills</h3>
            <p className="text-sm text-gray-600">Airtime, data, electricity, cable</p>
          </Link>

          <Link
            href="/dashboard/claims"
            className="bg-white rounded-lg p-6 shadow hover:shadow-lg transition border-l-4 border-purple-600"
          >
            <div className="text-3xl mb-2">🎁</div>
            <h3 className="font-semibold text-gray-900">Create Claim</h3>
            <p className="text-sm text-gray-600">Distribute rewards to users</p>
          </Link>

          <Link
            href="/dashboard/payroll"
            className="bg-white rounded-lg p-6 shadow hover:shadow-lg transition border-l-4 border-orange-600"
          >
            <div className="text-3xl mb-2">💼</div>
            <h3 className="font-semibold text-gray-900">Payroll</h3>
            <p className="text-sm text-gray-600">Batch pay employees in crypto</p>
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="bg-white rounded-lg p-8 shadow">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Why NinjaPay?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="text-4xl font-bold text-blue-600 mb-2">⚡</div>
            <h3 className="font-semibold text-gray-900 mb-2">Zero Gas Fees</h3>
            <p className="text-gray-600">
              On Injective's zero-gas architecture. Every transaction is cheap.
            </p>
          </div>
          <div>
            <div className="text-4xl font-bold text-green-600 mb-2">🇳🇬</div>
            <h3 className="font-semibold text-gray-900 mb-2">African First</h3>
            <p className="text-gray-600">
              Built for NGN, GHS, KES. Pay bills directly from your crypto.
            </p>
          </div>
          <div>
            <div className="text-4xl font-bold text-purple-600 mb-2">🔐</div>
            <h3 className="font-semibold text-gray-900 mb-2">Fully On-Chain</h3>
            <p className="text-gray-600">
              Smart contracts, decentralized. No intermediaries.
            </p>
          </div>
        </div>
      </div>

      {!isConnected && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <h3 className="font-semibold text-blue-900 mb-2">Ready to get started?</h3>
          <p className="text-blue-700 mb-4">
            Connect your Keplr or Leap wallet to begin using NinjaPay
          </p>
        </div>
      )}
    </div>
  )
}
