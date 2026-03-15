import { useState, useCallback, useEffect } from 'react'
import { initWalletStrategy, getWalletAddress, isWalletConnected } from '@/lib/injective/wallet'

interface UseWalletReturn {
  address: string | null
  isConnected: boolean
  loading: boolean
  error: string | null
  connect: (walletType: 'keplr' | 'leap') => Promise<void>
  disconnect: () => Promise<void>
}

/**
 * Hook for managing wallet connection
 */
export function useWallet(): UseWalletReturn {
  const [address, setAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if wallet is already connected on mount
  useEffect(() => {
    const checkWallet = async () => {
      if (isWalletConnected()) {
        try {
          const addr = await getWalletAddress()
          setAddress(addr)
        } catch (err) {
          console.error('Failed to get wallet address:', err)
        }
      }
    }
    checkWallet()
  }, [])

  const connect = useCallback(async (walletType: 'keplr' | 'leap') => {
    setLoading(true)
    setError(null)
    try {
      await initWalletStrategy(walletType)
      const addr = await getWalletAddress()
      setAddress(addr)
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet')
      setAddress(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    try {
      const { disconnectWallet } = await import('@/lib/injective/wallet')
      await disconnectWallet()
      setAddress(null)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect wallet')
    }
  }, [])

  return {
    address,
    isConnected: address !== null,
    loading,
    error,
    connect,
    disconnect,
  }
}
