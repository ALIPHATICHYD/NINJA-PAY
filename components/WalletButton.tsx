'use client'

import { useWallet } from '@/hooks/useWallet'
import { useState } from 'react'

export function WalletButton() {
  const { address, isConnected, loading, connect, disconnect } = useWallet()
  const [showMenu, setShowMenu] = useState(false)

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          {formatAddress(address)}
        </button>
        {showMenu && (
          <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
            <button
              onClick={async () => {
                await disconnect()
                setShowMenu(false)
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => connect('keplr')}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
      >
        {loading ? 'Connecting...' : 'Keplr'}
      </button>
      <button
        onClick={() => connect('leap')}
        disabled={loading}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
      >
        {loading ? 'Connecting...' : 'Leap'}
      </button>
    </div>
  )
}
