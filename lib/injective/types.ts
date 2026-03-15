export interface BalanceState {
  inj: string // Wei
  usdt: string // Wei
  loading: boolean
  error?: string
}

export interface TransactionRecord {
  id: string
  type: 'send' | 'bills' | 'claim' | 'payroll'
  status: 'pending' | 'confirmed' | 'failed'
  amount: string
  recipient: string
  txHash?: string
  createdAt: Date
}

export interface ClaimPool {
  id: string
  creatorAddress: string
  totalAmount: string // Wei
  claimType: 'equal' | 'percentage' | 'custom'
  shares: { address: string; amount: string }[]
  claimedBy: string[]
  linkCode: string
  createdAt: Date
}

export interface PayrollOutput {
  address: string
  amount: string // Wei
}

export interface BillPayment {
  billType: 'airtime' | 'data' | 'electricity' | 'cable'
  provider: string
  identifier: string // Phone number, meter ID, account number
  amount: string // Wei
}
