'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  initializeKeplr,
  getUserAddress,
  sendToken,
  isKeplrAvailable,
  isUserUsingLedger,
  requestConnection,
} from '@/lib/injective/cosmos-transactions'
import { CHAIN_ID } from '@/lib/injective/constants'

interface UseCosmosTxReturn {
  // State
  isReady: boolean
  userAddress: string | null
  isLedger: boolean
  loading: boolean
  error: string | null

  // Methods
  initializeWallet: () => Promise<void>
  sendToken: (recipientAddress: string, amount: string, token: 'INJ' | 'USDC') => Promise<string>
  reset: () => void
}

/**
 * Hook for handling Cosmos transactions on Injective
 * Supports both Keplr and Leap wallets
 */
export function useCosmosTransaction(): UseCosmosTxReturn {
  const [userAddress, setUserAddress] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isLedger, setIsLedger] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initializeWallet = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      if (!isKeplrAvailable() && !(window as any).leap) {
        throw new Error('No wallet found. Please install Keplr or Leap.')
      }

      const address = await requestConnection(CHAIN_ID)
      const usingLedger = await isUserUsingLedger(CHAIN_ID)

      setUserAddress(address)
      setIsLedger(usingLedger)
      setIsReady(true)
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to initialize wallet'
      setError(errorMsg)
      console.error('Wallet initialization error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-initialize on component mount
  useEffect(() => {
    const hasWallet = isKeplrAvailable() || (typeof window !== 'undefined' && (window as any).leap)
    if (hasWallet && !isReady) {
      initializeWallet()
    }
  }, [isReady, initializeWallet])

  const sendTokenFn = useCallback(
    async (recipientAddress: string, amount: string, token: 'INJ' | 'USDC'): Promise<string> => {
      if (!userAddress) {
        throw new Error('Wallet not initialized. Please connect your wallet first.')
      }

      setLoading(true)
      setError(null)

      try {
        // sendToken expects chain-formatted amount
        // The function handles the conversion internally
        const txHash = await sendToken(recipientAddress, amount, CHAIN_ID, token)
        console.log(`✓ ${token} transfer successful: ${txHash}`)
        return txHash
      } catch (err: any) {
        const errorMsg = err.message || 'Transaction failed'
        setError(errorMsg)
        console.error('Send token error:', err)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [userAddress]
  )

  const reset = useCallback(() => {
    setUserAddress(null)
    setIsReady(false)
    setIsLedger(false)
    setLoading(false)
    setError(null)
  }, [])

  return {
    isReady,
    userAddress,
    isLedger,
    loading,
    error,
    initializeWallet,
    sendToken: sendTokenFn,
    reset,
  }
}

/**
 * Hook for EVM wallet management
 */
export function useEVMWallet() {
  const [address, setAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestConnection = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { requestEVMConnection } = await import('@/lib/injective/evm-config')
      const accounts = await requestEVMConnection()
      
      if (accounts && accounts.length > 0) {
        setAddress(accounts[0])
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to connect wallet'
      setError(errorMsg)
      console.error('EVM connection error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Check if already connected
    const checkConnection = async () => {
      const { getCurrentEVMAddress, getCurrentChainId } = await import('@/lib/injective/evm-config')
      const addr = await getCurrentEVMAddress()
      const chain = await getCurrentChainId()

      setAddress(addr)
      setChainId(chain)
    }

    checkConnection()

    // Listen for changes
    const { onAccountChange, onNetworkChange } = require('@/lib/injective/evm-config')
    const unsubscribeAccount = onAccountChange((accounts: string[]) => {
      setAddress(accounts.length > 0 ? accounts[0] : null)
    })

    const unsubscribeNetwork = onNetworkChange((newChainId: string) => {
      setChainId(newChainId)
    })

    return () => {
      unsubscribeAccount()
      unsubscribeNetwork()
    }
  }, [])

  return {
    address,
    chainId,
    loading,
    error,
    requestConnection,
    isConnected: !!address,
  }
}
