'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  sendToken,
  isKeplrAvailable,
  isLeapAvailable,
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
  sendToken: (recipientAddress: string, amount: string, token: 'INJ' | 'USDC', memo?: string) => Promise<string>
  reset: () => void
}

// Set once the user has connected Keplr/Leap here, so later visits can
// reconnect quietly instead of opening an approval window on page load.
const CONNECTED_KEY = 'ninjapay:cosmos-wallet-connected'

function rememberConnection(connected: boolean) {
  try {
    if (connected) window.localStorage.setItem(CONNECTED_KEY, '1')
    else window.localStorage.removeItem(CONNECTED_KEY)
  } catch {
    // Storage unavailable: the user just connects again next time.
  }
}

function connectedBefore(): boolean {
  try {
    return window.localStorage.getItem(CONNECTED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Hook for handling Cosmos transactions on Injective
 * Supports both Keplr and Leap wallets
 *
 * The wallet is only asked to connect when the user clicks a connect button
 * (initializeWallet). On page load it reconnects only if the user connected
 * here before, which needs no new approval (a locked wallet may still ask to
 * be unlocked).
 */
export function useCosmosTransaction(): UseCosmosTxReturn {
  const [userAddress, setUserAddress] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isLedger, setIsLedger] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async (quiet: boolean) => {
    // A quiet reconnect shows no spinner and no error: nothing was asked of the user.
    if (!quiet) {
      setLoading(true)
      setError(null)
    }

    try {
      if (!isKeplrAvailable() && !isLeapAvailable()) {
        throw new Error('No wallet found. Please install Keplr or Leap.')
      }

      const address = await requestConnection(CHAIN_ID)
      const usingLedger = await isUserUsingLedger(CHAIN_ID)

      setUserAddress(address)
      setIsLedger(usingLedger)
      setIsReady(true)
      rememberConnection(true)
    } catch (err: any) {
      if (quiet) {
        // The approval was revoked or the wallet is locked: wait for the user to connect again.
        rememberConnection(false)
      } else {
        setError(err.message || 'Failed to initialize wallet')
        console.error('Wallet initialization error:', err)
      }
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  const initializeWallet = useCallback(() => connect(false), [connect])

  // Reconnect quietly on mount, only if the user connected here before.
  useEffect(() => {
    if ((isKeplrAvailable() || isLeapAvailable()) && connectedBefore()) {
      connect(true)
    }
  }, [connect])

  const sendTokenFn = useCallback(
    async (recipientAddress: string, amount: string, token: 'INJ' | 'USDC', memo?: string): Promise<string> => {
      if (!userAddress) {
        throw new Error('Wallet not initialized. Please connect your wallet first.')
      }

      setLoading(true)
      setError(null)

      try {
        // amount is human-readable ("1.5"); sendToken converts to base units once
        const txHash = await sendToken(recipientAddress, amount, CHAIN_ID, token, { memo })
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
