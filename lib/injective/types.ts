export interface BalanceState {
  inj: string // Wei
  usdc: string // Wei
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

export interface ClaimShare {
  /** Human-readable amount, for display */
  amount: string
  /** Exact amount in the token's base units; what is actually paid */
  amountBase?: string
  /** Legacy field from pools created before escrow; unused for new pools */
  address?: string
}

export interface ClaimPool {
  id: string
  creatorAddress: string
  name?: string
  totalAmount: string // human-readable
  claimType: 'equal' | 'percentage' | 'custom'
  /** Token held in escrow. Null for legacy pools created before escrow. */
  token: 'INJ' | 'USDC' | null
  /** Escrow account funded at creation. Null for legacy (unfunded) pools. */
  escrowAddress: string | null
  shares: ClaimShare[]
  linkCode: string
  createdAt: Date
}

export interface ClaimRecord {
  id: string
  poolId: string
  shareIndex: number
  claimerAddress: string
  txHash: string | null
  status: 'pending' | 'paid'
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
