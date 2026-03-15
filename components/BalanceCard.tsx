'use client'

import { useBalance } from '@/hooks/useBalance'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { fromWei } from '@/lib/injective/bank'

interface BalanceCardProps {
  address: string | null
}

export function BalanceCard({ address }: BalanceCardProps) {
  const { inj, usdt, loading: balanceLoading } = useBalance(address)
  const { injToUsdtRate } = useExchangeRate()

  const injAmount = fromWei(inj)
  const usdtAmount = fromWei(usdt)

  const ngnRate = 1500 // 1 USDT ≈ 1500 NGN (mock rate)
  const totalNGN =
    parseFloat(injAmount) * parseFloat(injToUsdtRate) * ngnRate +
    parseFloat(usdtAmount) * ngnRate

  if (!address) {
    return (
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-6 text-white">
        <h2 className="text-xl font-semibold mb-2">Connect Wallet</h2>
        <p className="text-blue-100">Connect your wallet to view balance</p>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-6 text-white">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-blue-100">Total NGN Value</h2>
        <p className="text-3xl font-bold">₦{totalNGN.toFixed(2)}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-blue-100">INJ Balance</p>
          <p className="text-lg font-semibold">
            {balanceLoading ? '...' : injAmount}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-blue-100">USDT Balance</p>
          <p className="text-lg font-semibold">
            {balanceLoading ? '...' : usdtAmount}
          </p>
        </div>
      </div>

      {balanceLoading && (
        <p className="text-xs text-blue-100 mt-2 animate-pulse">
          Loading balance...
        </p>
      )}
    </div>
  )
}
