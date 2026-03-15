import { useState, useCallback } from 'react'
import { TransactionRecord } from '@/lib/injective/types'

interface UseTransactionReturn {
  transactions: TransactionRecord[]
  addTransaction: (tx: Omit<TransactionRecord, 'id' | 'createdAt'>) => void
  updateTransaction: (id: string, updates: Partial<TransactionRecord>) => void
  clearTransactions: () => void
}

/**
 * Hook for managing local transaction state
 */
export function useTransaction(): UseTransactionReturn {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])

  const addTransaction = useCallback(
    (
      tx: Omit<TransactionRecord, 'id' | 'createdAt'>
    ) => {
      const newTx: TransactionRecord = {
        ...tx,
        id: `tx_${Date.now()}`,
        createdAt: new Date(),
      }
      setTransactions((prev) => [newTx, ...prev])
    },
    []
  )

  const updateTransaction = useCallback(
    (id: string, updates: Partial<TransactionRecord>) => {
      setTransactions((prev) =>
        prev.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx))
      )
    },
    []
  )

  const clearTransactions = useCallback(() => {
    setTransactions([])
  }, [])

  return {
    transactions,
    addTransaction,
    updateTransaction,
    clearTransactions,
  }
}
