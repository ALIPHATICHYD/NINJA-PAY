'use client'

import { useBalance } from '@/hooks/useBalance'
import { useUSDCConversion } from '@/hooks/useUSDCConversion'
import { fromWei } from '@/lib/injective/bank'

interface BalanceCardProps {
  address: string | null
}

export function BalanceCard({ address }: BalanceCardProps) {
  const { inj, usdc, loading: balanceLoading } = useBalance(address)
  const { injUsdcRate, loading: priceLoading } = useUSDCConversion(1)

  const injAmount = fromWei(inj)
  const usdcAmount = fromWei(usdc)

  const ngnRate = 1592 // 1 USDC ≈ 1592 NGN
  const injUsdcRateNum = parseFloat(injUsdcRate) || 0
  const totalNGN =
    parseFloat(injAmount) * injUsdcRateNum * ngnRate +
    parseFloat(usdcAmount) * ngnRate

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
          <p className="text-xs font-medium text-blue-100">USDC Balance</p>
          <p className="text-lg font-semibold">
            {balanceLoading ? '...' : usdcAmount}
          </p>
        </div>
      </div>

      {(balanceLoading || priceLoading) && (
        <p className="text-xs text-blue-100 mt-2 animate-pulse">
          {balanceLoading ? 'Loading balance...' : 'Updating rates...'}
        </p>
      )}
    </div>
  )
}
