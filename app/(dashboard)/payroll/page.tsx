'use client'

import { useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { createMsgMultiSendPayroll, toWei, fromWei } from '@/lib/injective/bank'
import { broadcastTxMessage } from '@/lib/injective/broadcast'
import { recordTransaction } from '@/lib/supabase'

interface PayrollEntry {
  address: string
  amount: string
  name: string
}

export default function PayrollPage() {
  const { address, isConnected } = useWallet()
  const { inj } = useBalance(address)

  const [employees, setEmployees] = useState<PayrollEntry[]>([
    { address: '', amount: '', name: '' },
  ])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | null
    message: string
  }>({ type: null, message: '' })

  const totalAmount = employees.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0)
  const maxAmount = parseFloat(fromWei(inj))
  const canPayroll = totalAmount > 0 && totalAmount <= maxAmount && employees.every(e => e.address && e.amount)

  const addEmployee = () => {
    setEmployees([...employees, { address: '', amount: '', name: '' }])
  }

  const removeEmployee = (index: number) => {
    setEmployees(employees.filter((_, i) => i !== index))
  }

  const updateEmployee = (
    index: number,
    field: 'address' | 'amount' | 'name',
    value: string
  ) => {
    const updated = [...employees]
    updated[index] = { ...updated[index], [field]: value }
    setEmployees(updated)
  }

  const handlePayroll = async () => {
    if (!address) {
      setStatus({ type: 'error', message: 'Wallet not connected' })
      return
    }

    setLoading(true)
    setStatus({ type: null, message: '' })

    try {
      // Prepare payroll outputs
      const outputs = employees.map((emp) => ({
        address: emp.address,
        amount: toWei(emp.amount),
      }))

      // Create batch message
      const msg = createMsgMultiSendPayroll(toWei(totalAmount.toString()), outputs)

      // Broadcast
      const txHash = await broadcastTxMessage(msg, address)

      // Record transaction
      await recordTransaction({
        userAddress: address,
        type: 'payroll',
        status: 'pending',
        amount: toWei(totalAmount.toString()),
        recipient: `payroll-${employees.length}recipients`,
        txHash,
      })

      setStatus({
        type: 'success',
        message: `✓ Payroll of ${totalAmount} INJ to ${employees.length} employee(s) initiated!`,
      })

      // Reset form
      setEmployees([{ address: '', amount: '', name: '' }])
    } catch (error: any) {
      setStatus({
        type: 'error',
        message: error.message || 'Failed to process payroll',
      })
    } finally {
      setLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="font-semibold text-yellow-900 mb-2">Wallet Not Connected</h2>
          <p className="text-yellow-700">
            Please connect your wallet to manage payroll
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Crypto Payroll</h1>
        <p className="text-gray-600">
          Pay your team instantly in INJ with a single batch transaction
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-8 space-y-6">
        {/* Balance Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs text-gray-600 mb-1">Available INJ Balance</p>
          <p className="text-2xl font-bold text-blue-600">{fromWei(inj)}</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-100 rounded-lg p-4">
            <p className="text-xs text-gray-600">Total Payroll</p>
            <p className="text-2xl font-bold text-gray-900">{totalAmount.toFixed(3)} INJ</p>
          </div>
          <div className="bg-gray-100 rounded-lg p-4">
            <p className="text-xs text-gray-600">Employees</p>
            <p className="text-2xl font-bold text-gray-900">{employees.length}</p>
          </div>
        </div>

        {/* Employees */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Payroll Recipients
          </label>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {employees.map((emp, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={emp.name}
                  onChange={(e) => updateEmployee(index, 'name', e.target.value)}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <input
                  type="text"
                  placeholder="inj1abc..."
                  value={emp.address}
                  onChange={(e) => updateEmployee(index, 'address', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <input
                  type="number"
                  placeholder="0.00"
                  value={emp.amount}
                  onChange={(e) => updateEmployee(index, 'amount', e.target.value)}
                  step="0.001"
                  min="0"
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                {employees.length > 1 && (
                  <button
                    onClick={() => removeEmployee(index)}
                    className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addEmployee}
            className="mt-3 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-sm"
          >
            + Add Employee
          </button>
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

        {totalAmount > maxAmount && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            ⚠ Total payroll ({totalAmount.toFixed(3)} INJ) exceeds your balance ({maxAmount.toFixed(3)} INJ)
          </div>
        )}

        {/* Payroll Button */}
        <button
          onClick={handlePayroll}
          disabled={loading || !canPayroll}
          className="w-full py-3 px-4 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Processing Payroll...' : `Pay ${employees.length} Employee${employees.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
